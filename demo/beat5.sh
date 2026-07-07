#!/usr/bin/env bash
# Beat 5 - crash recovery = exactly-once effect. Kill the worker, submit a
# payment, restart the worker, let it settle, then run this with that id.
#   docker compose kill worker ; (submit) ; docker compose up -d worker
# Usage: demo/beat5.sh [paymentId]
source "$(dirname "$0")/lib.sh"

PID="$(pick_payment "${1:-}")"
header "Beat 5 - crash recovery = exactly-once effect  (payment $PID)"

sql "Reached a terminal state despite the worker dying mid-flight" \
  "SELECT id, status, version, updated_at FROM payments WHERE id='$PID';"

sql "EXACTLY ONE terminal transition - no double-complete despite at-least-once redelivery" \
  "SELECT to_status, count(*) AS transitions FROM payment_events WHERE payment_id='$PID' AND to_status IN ('COMPLETED','FAILED') GROUP BY to_status;"

point "Recovery in the logs: BullMQ redelivery (fast path) and/or the reaper (durable backstop)"
echocmd "docker compose logs --since $SINCE worker relay | grep -E '$PID|reap'"
$DC logs --since "$SINCE" worker relay 2>/dev/null | grep -E "$PID|reap" \
  || echo "(none - widen with SINCE=2h)"

sql "Outbox: the completion event was published once - not lost, not duplicated" \
  "SELECT id, event_type, published_at IS NOT NULL AS published, webhook_dispatched_at IS NOT NULL AS dispatched FROM outbox WHERE aggregate_id='$PID' ORDER BY created_at;"

point "The point: at-least-once delivery + an idempotent consumer (CAS + stable per-payment bank key) = exactly-once EFFECT. One terminal event, one charge."
