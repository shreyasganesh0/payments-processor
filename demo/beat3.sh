#!/usr/bin/env bash
# Beat 3 - retry + exponential backoff. Point the bank at always_error first
# (chaos page), submit a payment, then run this with that payment's id.
# Usage: demo/beat3.sh [paymentId]
source "$(dirname "$0")/lib.sh"

PID="$(pick_payment "${1:-}")"
header "Beat 3 - retry + exponential backoff  (payment $PID)"

sql "Bank chaos state: the simulator is erroring" \
  "SELECT mode, latency_ms, fail_n, updated_at FROM bank_config;"

point "Worker logs: each failed attempt logs a RETRYING transition with reason + attempt #"
echocmd "docker compose logs --since $SINCE worker | grep '$PID' | grep -iE 'RETRY|transition'"
$DC logs --since "$SINCE" worker 2>/dev/null | grep "$PID" | grep -iE "RETRY|transition" \
  || echo "(none yet - give it a few seconds, or widen with SINCE=2h)"

sql "The retry ladder in the audit log: reason + attempt climb, budget = 5" \
  "SELECT to_status, metadata->>'reason' AS reason, metadata->>'attempt' AS attempt, occurred_at FROM payment_events WHERE payment_id='$PID' AND to_status='RETRYING' ORDER BY occurred_at;"

sql "Backoff, proven: the gap between successive attempts roughly doubles (capped at 30s)" \
  "SELECT occurred_at, occurred_at - lag(occurred_at) OVER (ORDER BY occurred_at) AS gap_from_prev FROM payment_events WHERE payment_id='$PID' AND to_status='RETRYING' ORDER BY occurred_at;"

point "The point: min(1000*2^(attempt-1), 30000) + jitter - and the growing 'gap_from_prev' column is that formula, measured straight out of the audit log."
