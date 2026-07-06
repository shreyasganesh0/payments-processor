# Deploy to AWS free-tier (k3s + RDS + ElastiCache)

A runbook to put the pipeline on the public internet on AWS, driven by the CD
workflow (`.github/workflows/cd.yml`). **You** run the AWS steps on your own
account; the repo provides the manifests, image, and pipeline.

> **Cost warning.** AWS free tier gives 750 h/mo each of EC2 t3.micro, RDS
> db.t3.micro, and ElastiCache cache.t3.micro for 12 months — enough for *one
> always-on instance of each*. k3s + the current `ts-node` image wants ~2 GB, so
> a **t3.small** (~$15/mo, or new-account promo credits) is reliable; t3.micro is
> too tight. **Do the teardown at the end** or you will be billed.

## 0. Prereqs
- An AWS account + the `aws` CLI configured (`aws configure`).
- This repo pushed to GitHub (for CD).
- A default VPC (new accounts have one). Note its subnets.

## 1. Managed datastores (L10.1)
Create one security group the datastores trust, and open Postgres/Redis only to it:
```bash
# a security group the EC2 will belong to, and one the DBs allow from it
aws ec2 create-security-group --group-name pp-app --description "payments app"
aws ec2 create-security-group --group-name pp-data --description "payments datastores"
APP=$(aws ec2 describe-security-groups --group-names pp-app --query 'SecurityGroups[0].GroupId' --output text)
DATA=$(aws ec2 describe-security-groups --group-names pp-data --query 'SecurityGroups[0].GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$DATA" --protocol tcp --port 5432 --source-group "$APP"
aws ec2 authorize-security-group-ingress --group-id "$DATA" --protocol tcp --port 6379 --source-group "$APP"
```
Then create the databases (console is easiest — pick the **Free tier** template):
- **RDS Postgres 16**, `db.t3.micro`, 20 GB, security group `pp-data`, not publicly accessible. DB name `payments`, user `payments`. Note the **endpoint**.
- **ElastiCache (Valkey/Redis) `cache.t3.micro`**, security group `pp-data`. Note the **primary endpoint**.

## 2. EC2 + k3s (L10.2)
- Launch an EC2 (**t3.small**, Ubuntu, security group `pp-app`); open **22, 80, 443** to your IP / the world.
- SSH in and install k3s:
  ```bash
  bash scripts/aws/k3s-install.sh   # copy the repo up first, or curl the raw file
  ```

## 3. Create the real secret (never committed)
On the EC2 (with `kubectl` from k3s), create `app-secret` from your managed URLs:
```bash
kubectl create namespace payments
kubectl -n payments create secret generic app-secret \
  --from-literal=DATABASE_URL='postgres://payments:PASSWORD@RDS_ENDPOINT:5432/payments?sslmode=require' \
  --from-literal=POSTGRES_PASSWORD='PASSWORD'
```

## 4. Point the overlay at your endpoints
Edit the two placeholders (commit these — they're not secrets):
- `patch-config.yaml`: `CORS_ORIGIN` → `http://EC2_PUBLIC_DNS`, `REDIS_URL` → `redis://ELASTICACHE_ENDPOINT:6379`
- `patch-ingress.yaml`: hosts → `EC2_PUBLIC_DNS` and `api.EC2_PUBLIC_DNS`
- `kustomization.yaml`: `images[0].newName` → `ghcr.io/<your-gh-owner>/payments-processor-app`

## 5. First deploy (manual, then CD takes over)
Make the GHCR package **public** (so k3s can pull without a pull secret), build+push once, then apply:
```bash
docker build --build-arg NEXT_PUBLIC_API_BASE=http://api.EC2_PUBLIC_DNS -t ghcr.io/<owner>/payments-processor-app:bootstrap .
docker push ghcr.io/<owner>/payments-processor-app:bootstrap
# on the EC2:
kubectl kustomize k8s/overlays/aws | sed 's#:latest#:bootstrap#' | kubectl apply -f -
kubectl -n payments get pods -w
```
Map the hosts locally to test: `echo "<EC2_IP> EC2_PUBLIC_DNS api.EC2_PUBLIC_DNS" | sudo tee -a /etc/hosts`, then open `http://EC2_PUBLIC_DNS`.

## 6. CI/CD (L10.4)
In the GitHub repo add:
- **Secrets:** `EC2_HOST` (public DNS/IP), `EC2_USER` (e.g. `ubuntu`), `EC2_SSH_KEY` (a private key whose public half is on the EC2).
- **Variable:** `PUBLIC_API_BASE` = `http://api.EC2_PUBLIC_DNS` (baked into the web bundle).

Now every push to `main` builds the image (SHA-tagged), pushes to GHCR, migrates, and rolls out — `rollout status` gates it, `kubectl rollout undo deploy/<x>` reverts.

## 7. TLS (L10.5, optional)
Install cert-manager, add a `ClusterIssuer` (Let's Encrypt), and annotate the Ingress with `cert-manager.io/cluster-issuer` + a `tls:` block. Requires a real domain pointed at the EC2 (Route 53 or your registrar). Flip `CORS_ORIGIN`/`PUBLIC_API_BASE` to `https://…` and rebuild the web image.

## 8. Teardown (do this!)
```bash
# on the EC2
kubectl delete -k k8s/overlays/aws; kubectl -n payments delete secret app-secret
# from your laptop
aws ec2 terminate-instances --instance-ids <id>
# delete the RDS instance and ElastiCache cluster in the console, then:
aws ec2 delete-security-group --group-id "$APP"
aws ec2 delete-security-group --group-id "$DATA"
```
Confirm the AWS Billing console shows nothing running.
