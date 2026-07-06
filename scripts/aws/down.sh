#!/usr/bin/env bash
# Tear down ALL pp-* AWS resources created by up.sh. Idempotent — safe to re-run
# and safe if some resources are already gone. Verify nothing billable remains in
# the AWS Billing console afterward.
set -uo pipefail
export AWS_PAGER=""

echo "== EC2 =="
IID=$(aws ec2 describe-instances --filters Name=tag:Name,Values=pp-k3s \
  "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
if [ -n "$IID" ]; then aws ec2 terminate-instances --instance-ids $IID >/dev/null && echo "  terminating $IID"; else echo "  none"; fi

echo "== RDS + ElastiCache (deleting) =="
aws rds delete-db-instance --db-instance-identifier pp-postgres --skip-final-snapshot --delete-automated-backups >/dev/null 2>&1 && echo "  pp-postgres" || echo "  no RDS"
aws elasticache delete-cache-cluster --cache-cluster-id pp-redis >/dev/null 2>&1 && echo "  pp-redis" || echo "  no Redis"

echo "== waiting for deletes (so SGs/subnet-groups become deletable)... =="
[ -n "$IID" ] && aws ec2 wait instance-terminated --instance-ids $IID
aws rds wait db-instance-deleted --db-instance-identifier pp-postgres 2>/dev/null || true
aws elasticache wait cache-cluster-deleted --cache-cluster-id pp-redis 2>/dev/null || true

echo "== security groups (pp-data first — it references pp-app) =="
for name in pp-data pp-app; do
  gid=$(aws ec2 describe-security-groups --group-names "$name" --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
  if [ -n "$gid" ] && [ "$gid" != None ]; then aws ec2 delete-security-group --group-id "$gid" >/dev/null 2>&1 && echo "  deleted $name" || echo "  $name still in use (retry in a minute)"; else echo "  no $name"; fi
done

echo "== subnet groups + key pair =="
aws rds delete-db-subnet-group --db-subnet-group-name pp-subnets >/dev/null 2>&1 && echo "  rds subnet group" || true
aws elasticache delete-cache-subnet-group --cache-subnet-group-name pp-subnets >/dev/null 2>&1 && echo "  cache subnet group" || true
aws ec2 delete-key-pair --key-name pp-key >/dev/null 2>&1 && echo "  key pair" || true
rm -f ~/pp-key.pem

echo "== disarm CD (so pushes don't deploy to a dead instance) =="
command -v gh >/dev/null 2>&1 && gh secret delete EC2_HOST -R "${PP_GH_REPO:-shreyasganesh0/payments-processor}" >/dev/null 2>&1 && echo "  cleared CD EC2_HOST — CD now no-ops until up.sh re-arms it" || echo "  (gh not found / already clear)"

echo "== done. Confirm the AWS Billing/EC2 console shows nothing running. =="
