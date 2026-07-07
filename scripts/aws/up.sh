#!/usr/bin/env bash
# Provision the whole AWS stack and deploy the app, idempotently. Re-running
# reuses whatever already exists. Also wires GitHub Actions CD to the (ephemeral)
# instance so `git push` to main auto-deploys. Tear it all down with down.sh.
#
# Prereqs: aws CLI configured, docker, gh (authed, repo scope), an SSH client.
# Cost: t3.small (~$0.02/hr) + free-tier RDS/ElastiCache. RUN down.sh WHEN DONE.
set -euo pipefail
export AWS_PAGER=""

VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
# Never hardcode a DB password here (public repo). Supply it out-of-band and keep
# it STABLE across runs (RDS is created once with it): export PP_DB_PASSWORD=...
PGPASS="${PP_DB_PASSWORD:?set PP_DB_PASSWORD to a strong secret before running; do not hardcode it}"
ITYPE="${PP_INSTANCE_TYPE:-t3.small}"
REPO="${PP_GH_REPO:-shreyasganesh0/payments-processor}"
KEY="$HOME/pp-key.pem"

say() { printf '\n=== %s ===\n' "$1"; }

say "security groups"
APP=$(aws ec2 describe-security-groups --group-names pp-app --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
[ -z "$APP" ] || [ "$APP" = None ] && APP=$(aws ec2 create-security-group --group-name pp-app --description "payments app" --vpc-id "$VPC" --query GroupId --output text)
DATA=$(aws ec2 describe-security-groups --group-names pp-data --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
[ -z "$DATA" ] || [ "$DATA" = None ] && DATA=$(aws ec2 create-security-group --group-name pp-data --description "payments datastores" --vpc-id "$VPC" --query GroupId --output text)
for pg in "$DATA:5432" "$DATA:6379" "$APP:22" "$APP:80" "$APP:443"; do
  gid=${pg%:*}; port=${pg#*:}; src="--source-group $APP"; [ "$gid" = "$APP" ] && src="--cidr 0.0.0.0/0"
  aws ec2 authorize-security-group-ingress --group-id "$gid" --protocol tcp --port "$port" $src >/dev/null 2>&1 || true
done
echo "  APP=$APP DATA=$DATA"

say "subnet groups"
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" --query 'Subnets[].SubnetId' --output text)
aws rds create-db-subnet-group --db-subnet-group-name pp-subnets --db-subnet-group-description pp --subnet-ids $SUBNETS >/dev/null 2>&1 || true
aws elasticache create-cache-subnet-group --cache-subnet-group-name pp-subnets --cache-subnet-group-description pp --subnet-ids $SUBNETS >/dev/null 2>&1 || true

say "RDS + ElastiCache (create if missing)"
aws rds describe-db-instances --db-instance-identifier pp-postgres >/dev/null 2>&1 || \
  aws rds create-db-instance --db-instance-identifier pp-postgres --db-instance-class db.t3.micro --engine postgres \
    --master-username payments --master-user-password "$PGPASS" --allocated-storage 20 --db-name payments \
    --db-subnet-group-name pp-subnets --vpc-security-group-ids "$DATA" --no-publicly-accessible --no-multi-az --backup-retention-period 0 >/dev/null
aws elasticache describe-cache-clusters --cache-cluster-id pp-redis >/dev/null 2>&1 || \
  aws elasticache create-cache-cluster --cache-cluster-id pp-redis --engine redis --cache-node-type cache.t3.micro \
    --num-cache-nodes 1 --cache-subnet-group-name pp-subnets --security-group-ids "$DATA" >/dev/null

say "SSH key + EC2"
[ -f "$KEY" ] || { aws ec2 delete-key-pair --key-name pp-key >/dev/null 2>&1 || true; aws ec2 create-key-pair --key-name pp-key --query KeyMaterial --output text > "$KEY"; chmod 600 "$KEY"; }
AMI=$(aws ssm get-parameters --names /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query 'Parameters[0].Value' --output text)
IID=$(aws ec2 describe-instances --filters Name=tag:Name,Values=pp-k3s "Name=instance-state-name,Values=pending,running" --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null)
if [ -z "$IID" ] || [ "$IID" = None ]; then
  SUBNET=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)
  IID=$(aws ec2 run-instances --image-id "$AMI" --instance-type "$ITYPE" --key-name pp-key --security-group-ids "$APP" \
    --subnet-id "$SUBNET" --associate-public-ip-address --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20}}]' \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=pp-k3s}]' --query 'Instances[0].InstanceId' --output text)
fi
aws ec2 wait instance-running --instance-ids "$IID"
IP=$(aws ec2 describe-instances --instance-ids "$IID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
HOST="$IP.nip.io"; API_BASE="http://api.$HOST"; WEB_ORIGIN="http://$HOST"
echo "  instance=$IID ip=$IP"

say "build image with API base $API_BASE"
docker build --build-arg NEXT_PUBLIC_API_BASE="$API_BASE" -t ghcr.io/${REPO%%/*}/payments-processor-app:latest . >/dev/null

say "wait for datastores"
aws rds wait db-instance-available --db-instance-identifier pp-postgres
RDS=$(aws rds describe-db-instances --db-instance-identifier pp-postgres --query 'DBInstances[0].Endpoint.Address' --output text)
REDIS=$(aws elasticache describe-cache-clusters --cache-cluster-id pp-redis --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text)
echo "  rds=$RDS redis=$REDIS"

SSH="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -i $KEY ubuntu@$IP"
say "wait for sshd + install k3s"
for i in $(seq 1 30); do $SSH true 2>/dev/null && break; sleep 5; done
$SSH 'bash -s' <<'K3S'
command -v kubectl >/dev/null 2>&1 || curl -sfL https://get.k3s.io | sh - >/dev/null 2>&1
for i in $(seq 1 30); do [ -f /etc/rancher/k3s/k3s.yaml ] && break; sleep 2; done
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
sudo swapon --show | grep -q file || { sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null; }
for i in $(seq 1 40); do kubectl get nodes 2>/dev/null | grep -q ' Ready ' && break; sleep 2; done
sudo apt-get update -qq >/dev/null 2>&1; sudo apt-get install -y git >/dev/null 2>&1
K3S

say "secret + repo + overlay"
$SSH "kubectl get ns payments >/dev/null 2>&1 || kubectl create ns payments; \
  kubectl -n payments delete secret app-secret --ignore-not-found >/dev/null; \
  kubectl -n payments create secret generic app-secret \
    --from-literal=DATABASE_URL='postgres://payments:$PGPASS@$RDS:5432/payments?sslmode=no-verify' \
    --from-literal=POSTGRES_PASSWORD='$PGPASS' >/dev/null; \
  rm -rf ~/payments-processor && git clone -q https://github.com/$REPO ~/payments-processor; \
  cd ~/payments-processor/k8s/overlays/aws && sed -i 's/EC2_PUBLIC_DNS/$HOST/g; s/ELASTICACHE_ENDPOINT/$REDIS/g' patch-config.yaml patch-ingress.yaml"

say "load image into k3s + apply"
docker save ghcr.io/${REPO%%/*}/payments-processor-app:latest | gzip | $SSH "gunzip | sudo k3s ctr images import - >/dev/null"
$SSH "cd ~/payments-processor && kubectl kustomize --load-restrictor=LoadRestrictionsNone k8s/overlays/aws | kubectl apply -f - >/dev/null && kubectl -n payments rollout status deploy/api --timeout=180s && kubectl -n payments rollout status deploy/web --timeout=120s"

say "wire GitHub Actions CD to this instance"
if command -v gh >/dev/null 2>&1; then
  gh secret set EC2_HOST --repo "$REPO" --body "$IP" >/dev/null && \
  gh secret set EC2_USER --repo "$REPO" --body "ubuntu" >/dev/null && \
  gh secret set EC2_SSH_KEY --repo "$REPO" < "$KEY" >/dev/null && \
  gh variable set PUBLIC_API_BASE --repo "$REPO" --body "$API_BASE" >/dev/null && \
  echo "  CD secrets/vars set — push to main auto-deploys"
else echo "  gh not found — set EC2_HOST=$IP, EC2_USER=ubuntu, EC2_SSH_KEY=~/pp-key.pem, var PUBLIC_API_BASE=$API_BASE manually"; fi

cat <<DONE

========================================================================
  LIVE:  console  $WEB_ORIGIN
         api      $API_BASE
  smoke: make smoke HOST=$HOST
  CD:    push to main auto-deploys (secrets point at $IP)
  COST:  running now — tear down with scripts/aws/down.sh when done
========================================================================
DONE
