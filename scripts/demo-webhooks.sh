#!/usr/bin/env bash
#
# demo-webhooks.sh — TEST-ONLY. Sets up Beat 6 end to end against the running
# stack: registers one working (/ok) and one failing (/fail) webhook endpoint,
# starts the bundled receiver (compose `webhooks-demo` profile) with their
# secrets so it can verify signatures, fires a payment, and waits until one
# delivery is `delivered` and the other is `dead` (DLQ). Nothing here ships to
# prod: the receiver is a profile-gated node:alpine, absent from k8s/CD.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DC="docker compose"
API="${API:-http://localhost:3000}"
RECEIVER_HOST="${RECEIVER_HOST:-http://receiver.local:9099}"   # resolved inside the compose network

json_field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

echo "==> waiting for the API..."
until curl -sf "$API/health/live" >/dev/null 2>&1; do sleep 1; done

echo "==> registering webhook endpoints"
ok_resp="$(curl -s -X POST "$API/v1/webhook-endpoints"   -H 'content-type: application/json' -d "{\"url\":\"$RECEIVER_HOST/ok\"}")"
fail_resp="$(curl -s -X POST "$API/v1/webhook-endpoints" -H 'content-type: application/json' -d "{\"url\":\"$RECEIVER_HOST/fail\"}")"
export WEBHOOK_OK_SECRET="$(printf '%s' "$ok_resp"   | json_field secret)"
export WEBHOOK_FAIL_SECRET="$(printf '%s' "$fail_resp" | json_field secret)"
ok_id="$(printf '%s' "$ok_resp" | json_field id)"
fail_id="$(printf '%s' "$fail_resp" | json_field id)"
if [ -z "${WEBHOOK_OK_SECRET:-}" ] || [ -z "${WEBHOOK_FAIL_SECRET:-}" ]; then
  echo "!! registration failed. Responses:"; echo "  ok:   $ok_resp"; echo "  fail: $fail_resp"; exit 1
fi
echo "   ok   endpoint $ok_id -> $RECEIVER_HOST/ok"
echo "   fail endpoint $fail_id -> $RECEIVER_HOST/fail"

echo "==> starting the receiver (secrets passed so it verifies signatures)"
$DC --profile webhooks-demo up -d webhook-receiver

echo "==> forcing bank -> always_authorize so the payment completes"
curl -s -X PUT "$API/v1/admin/bank-config" -H 'content-type: application/json' -d '{"mode":"always_authorize"}' >/dev/null

echo "==> firing a payment"
curl -s -o /dev/null -X POST "$API/v1/payments" \
  -H 'content-type: application/json' -H "Idempotency-Key: demo-webhook-$(date +%s)" \
  -d '{"customerId":"C12345","amount":"77.00","sourceAccount":"VA10001","destinationAccount":"EXT98765","reference":"WEBHOOK-DEMO"}'

echo "==> waiting for one delivered + one dead (up to ~90s; /fail exhausts 5 attempts over backoff)"
for i in $(seq 1 45); do
  summary="$($DC exec -T postgres psql -U payments -d payments -tAc "SELECT status || ':' || count(*) FROM webhook_deliveries GROUP BY status ORDER BY status;" 2>/dev/null | paste -sd' ' -)"
  printf '\r   [%02ds] %s' "$((i*2))" "${summary:-<none>}"
  if $DC exec -T postgres psql -U payments -d payments -tAc "SELECT 1 FROM webhook_deliveries WHERE status='delivered' LIMIT 1;" 2>/dev/null | grep -q 1 \
  && $DC exec -T postgres psql -U payments -d payments -tAc "SELECT 1 FROM webhook_deliveries WHERE status='dead' LIMIT 1;" 2>/dev/null | grep -q 1; then
    echo; echo "==> done: a delivered row AND a dead (DLQ) row exist."
    break
  fi
  sleep 2
done
echo

echo "==> delivery outcomes:"
$DC exec -T postgres psql -U payments -d payments -c \
  "SELECT wd.status, e.url, wd.attempts, wd.last_error FROM webhook_deliveries wd JOIN webhook_endpoints e ON e.id = wd.endpoint_id ORDER BY wd.created_at DESC LIMIT 10;"

echo "next: open http://localhost:3001/webhooks  ·  receiver log: docker compose --profile webhooks-demo logs webhook-receiver  ·  inspect: demo/beat6.sh"
echo "stop the receiver when done: make demo-webhooks-down   (or it's swept by make down / make clean)"
