#!/usr/bin/env bash
# Beat 4 - recovery after healing the bank. Flip chaos back to always_authorize
# while the payment is mid-retry, then run this with that payment's id.
# Usage: demo/beat4.sh [paymentId]
source "$(dirname "$0")/lib.sh"

PID="$(pick_payment "${1:-}")"
header "Beat 4 - recovery after healing the bank  (payment $PID)"

sql "Bank chaos state: should now read always_authorize" \
  "SELECT mode, updated_at FROM bank_config;"

sql "Full trail: the RETRYING attempts, then the COMPLETED hop once the bank recovered - every reason recorded" \
  "SELECT from_status, to_status, metadata->>'reason' AS reason, metadata->>'attempt' AS attempt, occurred_at FROM payment_events WHERE payment_id='$PID' ORDER BY occurred_at;"

sql "Final state + version (one CAS hop per version bump)" \
  "SELECT id, status, version FROM payments WHERE id='$PID';"

logs_for "$PID"

point "The point: healed mid-flight - the very next attempt succeeds, and the audit log preserves every reason along the way (no history rewritten)."
