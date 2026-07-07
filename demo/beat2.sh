#!/usr/bin/env bash
# Beat 2 - idempotency / dedupe. Self-contained: fires the requests itself.
# Usage: demo/beat2.sh
source "$(dirname "$0")/lib.sh"

header "Beat 2 - idempotency / dedupe"

KEY="demo-idem-$(date +%s)"
BODY='{"customerId":"C12345","amount":"42.00","sourceAccount":"VA10001","destinationAccount":"EXT98765","reference":"IDEM-DEMO"}'
BODY_DIFF='{"customerId":"C12345","amount":"99.99","sourceAccount":"VA10001","destinationAccount":"EXT98765","reference":"IDEM-DEMO"}'

post_headers() { # <key> <body> -> response headers
  curl -s -D - -o /dev/null -X POST "$API/v1/payments" \
    -H 'Content-Type: application/json' -H "Idempotency-Key: $1" -d "$2"
}
status_of()   { printf '%s' "$1" | awk 'NR==1{print $2}'; }
location_of() { printf '%s' "$1" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}'; }

point "Same key ($KEY), same payload, submitted twice -> expect identical 202 + same Location"
echocmd "curl -si -X POST $API/v1/payments -H 'Idempotency-Key: $KEY' -d '<body>'   (x2)"
for n in 1 2; do
  h="$(post_headers "$KEY" "$BODY")"
  echo "  attempt $n -> HTTP $(status_of "$h")   Location: $(location_of "$h")"
done

point "Same key, DIFFERENT payload (amount 42.00 -> 99.99) -> expect 409 Conflict"
h="$(post_headers "$KEY" "$BODY_DIFF")"
echo "  -> HTTP $(status_of "$h")"

sql "DB truth: exactly one payment + one idempotency record for that key (42.00 -> 4200 cents)" \
  "SELECT p.id, p.amount_cents, p.status, k.request_hash, k.response_status FROM payments p JOIN idempotency_keys k ON k.payment_id = p.id WHERE k.idempotency_key = '$KEY';"

point "The point: no app-level pre-check - the UNIQUE(customer_id, idempotency_key) constraint is the arbiter. Same key+payload replays the stored 202; same key+different payload is a 409."
