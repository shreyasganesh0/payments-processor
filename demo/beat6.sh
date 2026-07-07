#!/usr/bin/env bash
# Beat 6 - webhooks: signed fan-out + dead-letter. Run `make demo-webhooks` first.
# Usage: demo/beat6.sh
source "$(dirname "$0")/lib.sh"

header "Beat 6 - webhooks: signed delivery + dead-letter (DLQ)"

sql "Registered endpoints -- terminal events fan out to every active one" \
  "SELECT id, url, active, created_at FROM webhook_endpoints ORDER BY created_at DESC;"

sql "Delivery outcomes -- expect one delivered (/ok) and one dead (/fail after 5 attempts)" \
  "SELECT wd.status, e.url, wd.attempts, wd.last_error, wd.event_id FROM webhook_deliveries wd JOIN webhook_endpoints e ON e.id = wd.endpoint_id ORDER BY wd.created_at DESC LIMIT 10;"

point "Dispatcher + processor logs (delivery created -> delivery attempt)"
echocmd "docker compose logs --since $SINCE worker | grep -iE 'webhook delivery'"
$DC logs --since "$SINCE" worker 2>/dev/null | grep -iE "webhook delivery" | tail -20 || echo "(none)"

point "The receiver's own view -- signed POSTs arriving, signature VALID, event_id stable, /fail attempts climbing"
echocmd "docker compose --profile webhooks-demo logs --since $SINCE webhook-receiver"
$DC --profile webhooks-demo logs --since "$SINCE" webhook-receiver 2>/dev/null | tail -20 || echo "(receiver not running -- run make demo-webhooks)"

point "The point: terminal events fan out to every active endpoint, each POST HMAC-signed; 5 failures -> DLQ (dead); event_id stable across redelivery."
