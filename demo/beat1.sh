#!/usr/bin/env bash
# Beat 1 - async processing + full auditability.
# Usage: demo/beat1.sh [paymentId]   (defaults to the most recent payment)
source "$(dirname "$0")/lib.sh"

PID="$(pick_payment "${1:-}")"
header "Beat 1 - async processing + full auditability  (payment $PID)"

logs_for "$PID"

sql "Payment row: amount stored as integer cents (no floats); version = number of CAS transitions" \
  "SELECT id, status, amount_cents, version FROM payments WHERE id='$PID';"

sql "Append-only audit trail: one immutable row per state hop, each with a reason" \
  "SELECT from_status, to_status, metadata, occurred_at FROM payment_events WHERE payment_id='$PID' ORDER BY occurred_at;"

point "The point: UI reached COMPLETED - code guards every hop with a CAS - logs thread it by correlationId across api+worker - DB proves it (version bumps once per hop, one event per hop, append-only)."
