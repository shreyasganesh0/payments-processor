#!/usr/bin/env bash
# Rotate the RDS master password AND re-sync it to the running k8s app-secret, so
# the app keeps working after the change. Generates a strong URL-safe password by
# default (override by exporting PP_DB_PASSWORD to a specific value).
#
# It:
#   1. verifies the RDS instance is available
#   2. sets the new master password (--apply-immediately)
#   3. recreates the cluster's app-secret over SSH and restarts api/worker/relay
#   4. prints the new password — SAVE IT (it's your new PP_DB_PASSWORD)
#
# Prereqs: an AWS profile with rds:ModifyDBInstance + ec2:DescribeInstances
# (the pp-deploy user has these), ~/pp-key.pem, and the stack up.
# Usage:  AWS_PROFILE=pp-deploy scripts/aws/rotate-db-password.sh
set -euo pipefail
export AWS_PAGER=""

DBID="${PP_DB_ID:-pp-postgres}"
TAG="${PP_EC2_TAG:-pp-k3s}"
KEY="${PP_SSH_KEY:-$HOME/pp-key.pem}"
# URL-safe + RDS-safe by construction (hex has no @ / : ? # + = or spaces)
NEW="${PP_DB_PASSWORD:-$(openssl rand -hex 24)}"

say() { printf '\n=== %s ===\n' "$1"; }

say "checking RDS instance $DBID"
RDS=$(aws rds describe-db-instances --db-instance-identifier "$DBID" \
  --query 'DBInstances[0].Endpoint.Address' --output text 2>/dev/null) \
  || { echo "  RDS '$DBID' not found — nothing to rotate. (Stack down? then there's nothing using the old password.)"; exit 1; }
STATUS=$(aws rds describe-db-instances --db-instance-identifier "$DBID" \
  --query 'DBInstances[0].DBInstanceStatus' --output text)
echo "  status=$STATUS endpoint=$RDS"
[ "$STATUS" = available ] || { echo "  instance is '$STATUS', not 'available' — try again shortly"; exit 1; }

say "rotating the RDS master password (apply-immediately)"
aws rds modify-db-instance --db-instance-identifier "$DBID" \
  --master-user-password "$NEW" --apply-immediately >/dev/null
echo "  submitted; letting it apply..."
sleep 15
aws rds wait db-instance-available --db-instance-identifier "$DBID"
echo "  RDS password changed."

say "locating the app box (tag $TAG)"
IP=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$TAG" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text 2>/dev/null)
if [ -z "$IP" ] || [ "$IP" = None ]; then
  echo "  no running '$TAG' instance — RDS is rotated, but no cluster to update."
  echo "  when you next bring the stack up, use the new password below as PP_DB_PASSWORD."
else
  [ -f "$KEY" ] || { echo "  missing SSH key $KEY — can't update the cluster secret"; exit 1; }
  SSH="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -i $KEY ubuntu@$IP"
  say "re-syncing k8s app-secret on $IP + restarting app"
  $SSH "kubectl -n payments delete secret app-secret --ignore-not-found >/dev/null; \
    kubectl -n payments create secret generic app-secret \
      --from-literal=DATABASE_URL='postgres://payments:$NEW@$RDS:5432/payments?sslmode=no-verify' \
      --from-literal=POSTGRES_PASSWORD='$NEW' >/dev/null; \
    kubectl -n payments rollout restart deploy/api deploy/worker deploy/relay >/dev/null; \
    kubectl -n payments rollout status deploy/api --timeout=150s"
  echo "  cluster secret updated + app reconnected."
fi

cat <<DONE

========================================================================
  ROTATED. Save this new password in your password manager NOW:

      $NEW

  Reuse it for deploys:   export PP_DB_PASSWORD='$NEW'
========================================================================
DONE
