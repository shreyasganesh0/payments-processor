#!/usr/bin/env bash
# Run ON the EC2 (by the CD workflow, or by hand): roll the payments deployments
# to an image that is ALREADY imported into k3s. Usage: rollout.sh <image-ref>
set -euo pipefail
IMG="${1:?usage: rollout.sh <image-ref>}"
NS=payments
REPO_DIR="${PP_REPO_DIR:-$HOME/payments-processor}"

# migrate with the new image (the Job carries the ConfigMap+Secret + drizzle SQL)
kubectl -n "$NS" delete job migrate --ignore-not-found >/dev/null
sed -E "s#(ghcr\.io/[^/]+/)?payments-processor-app:[^[:space:]\"]+#$IMG#g" \
  "$REPO_DIR/k8s/20-migrate-job.yaml" | kubectl -n "$NS" apply -f -
kubectl -n "$NS" wait --for=condition=complete job/migrate --timeout=150s

# roll the app deployments to the new image (imagePullPolicy IfNotPresent → local)
for d in api relay worker web; do kubectl -n "$NS" set image "deploy/$d" "$d=$IMG"; done
kubectl -n "$NS" rollout status deploy/api --timeout=150s
kubectl -n "$NS" rollout status deploy/web --timeout=150s
echo "rolled out $IMG"
