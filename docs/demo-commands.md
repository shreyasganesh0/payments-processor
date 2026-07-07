> NOTE: DB queries use the paymentId (copy from the browser URL /payments/<id>); Log greps use the correlationId. They are DIFFERENT ULIDs that share a time-prefix -- don't mix them up. Always replace the whole <...> placeholder (brackets included) before running, or bash treats < as an input redirect.

# part 1 -start up

make up

docker compose ps

curl http://localhost:3000/health/ready

# part 2 - payment lifecycle and async processing

## Demo
1. Submit on the dashboard (amount e.g. 12.50) -> returns immediately (202) and shows a correlationId.
2. Watch the row land and settle on COMPLETED (2s poll; PROCESSING is too fast to see live -- the timeline proves it).
3. Click into the payment -> timeline shows PENDING -> PROCESSING -> COMPLETED, each with a reason + timestamp (async lifecycle + append-only audit).
4. Copy the correlationId -> paste into the Log cmd (api 202 -> worker PROCESSING -> worker COMPLETED, one thread).
5. Copy the paymentId (URL or table) -> paste into the Db cmd (version=2 + two append-only event rows).

## UI (React/Next data-flow only)
- apps/web/src/lib/usePolling.ts:20-36 -- poll engine: immediate + setInterval (28-29); pauses when tab hidden (visibilityState 24, visibilitychange listener 30); useRef guard avoids resetting the interval each render (15-18).
- apps/web/src/app/page.tsx:11,33 -- POLL_MS=2000; usePolling(refresh, POLL_MS); refresh -> listPayments (20-22).
- apps/web/src/app/payments/[id]/page.tsx:12,57 -- same 2s poll for one payment + its events (the timeline).
- apps/web/src/lib/api.ts:14-15 -- get() with cache: 'no-store' (Next.js trick: bypass the App Router fetch cache so every poll hits the API fresh). listPayments 22-33, listEvents 39-41.

## Backend (async CAS pipeline + audit)
- apps/api/src/relay/relay.service.ts:45-73 -- poll_once: claim unpublished payment.submitted outbox FOR UPDATE SKIP LOCKED (54), queue.add(..., { jobId: row.id }) (66), mark publishedAt AFTER publish (73) = at-least-once.
- apps/api/src/worker/payment.processor.ts:48-88 -- txn1: SELECT ... FOR UPDATE (51), canTransition (54), CAS SET status='PROCESSING' ... WHERE status=<expected> (57), payment transition log (76) + append-only paymentEvents insert (79).
- apps/api/src/worker/payment.processor.ts:242-245 -- txn2: terminal CAS PROCESSING -> COMPLETED + audit event.
- apps/api/src/payments/payments.controller.ts:63-92 -- GET endpoints the UI polls (list 63-76, detail 57-61, events 78-92).

## Log cmd
docker compose logs --since 3m api worker | grep <correlationId>

## Db cmd
docker compose exec postgres psql -U payments -d payments -c "SELECT id, status, amount_cents, version FROM payments WHERE id='<paymentId>';"

docker compose exec postgres psql -U payments -d payments -c "SELECT from_status, to_status, metadata, occurred_at FROM payment_events WHERE payment_id='<paymentId>' ORDER BY occurred_at;"

# part3 - idempotency and dedup

## Demo
1. Open the submit form -- note the Idempotency key field. Submit once -> one row appears.
2. Without touching the key, click Submit again -> table stays at one row, result says "replay".
3. (optional) Change the amount, keep the same key -> Submit -> form surfaces a 409.
4. Copy the correlationId -> paste into the Log cmd (idempotent replay, or different payload warn).
5. Run the Db cmd -> one payment + one idempotency row; the duplicate created zero new rows.

## UI (React/Next data-flow only)
- apps/web/src/components/SubmitPaymentForm.tsx:51 -- idempotencyKey = useState(randomId): one key per form mount, NOT regenerated after submit (77) -> resubmitting replays.
- SubmitPaymentForm.tsx:77 -- submitPayment(input, idempotencyKey) sends it; :177-178,183 -- key is an editable field + "generate new key" button (183).
- apps/web/src/lib/id.ts:5 -- randomId(): crypto.randomUUID with a getRandomValues fallback for non-secure origins.
- apps/web/src/lib/api.ts:117-141 -- submitPayment: POST with idempotency-key header (125), reads x-correlation-id off the response (140).

## Backend (dedupe = DB unique constraint + 23505 catch)
- apps/api/src/payments/payments.controller.ts:35 -- required Idempotency-Key (else 400); 37-38 canonicalize(dto) -> sha256 requestHash; @HttpCode(202) (24); Location header (47).
- apps/api/src/payments/payments.service.ts:37-70 -- one txn: insert payments (38) + idempotency_keys (48) + outbox (67); nothing published to Redis here (no dual-write).
- payments.service.ts:85-112 -- catch pg 23505 (85) -> read existing key (87) -> hash mismatch -> 409 + warn (95-101) -> else replay stored 202 + info log (104-105).
- Arbiter: UNIQUE(customer_id, idempotency_key) -- the DB rejects the dup, no app pre-check.

## Log cmd
docker compose logs --since 3m api | grep -E "idempotent replay|different payload"
# pipeline mode: grep -E "idempotent replay|different payload" .run/api.log

## Db cmd
# the idempotency record (paste the live key, or use LIKE 'demo-idem-%' for beat2.sh)
docker compose exec postgres psql -U payments -d payments -c "SELECT k.idempotency_key, p.id, p.amount_cents, p.status, k.request_hash, k.response_status FROM idempotency_keys k JOIN payments p ON p.id=k.payment_id WHERE k.idempotency_key='<key>';"

# prove a duplicate added NOTHING (paste the paymentId)
docker compose exec postgres psql -U payments -d payments -c "SELECT (SELECT count(*) FROM payments WHERE id='<paymentId>') AS payment_rows, (SELECT count(*) FROM idempotency_keys WHERE payment_id='<paymentId>') AS idem_rows, (SELECT count(*) FROM outbox WHERE aggregate_id='<paymentId>') AS outbox_rows;"

# part4 - retry, backoff, and recovery

## Demo
1. Go to /chaos, set bank mode = always_error, click Apply (takes up to ~2s to reach the worker via bank_config sync).
2. Submit a payment on the dashboard.
3. Click into it -> timeline shows repeated RETRYING events with growing gaps between them (backoff). Budget = 5, then FAILED.
4. Copy the correlationId -> Log cmd shows RETRYING transitions with reason bank_unavailable + climbing attempt.
5. Copy the paymentId -> Db cmd shows the retry ladder + the gap-doubling proof + current bank_config.
   -- Recovery (heal mid-flight) --
6. While it is still RETRYING, set /chaos mode = always_authorize, Apply. Within ~2s + the next backoff attempt it flips PROCESSING -> COMPLETED.
7. Timeline shows the RETRYING attempts THEN COMPLETED, every reason preserved (no history rewritten). Stable per-payment bank key = the recovered call is the same call (no double charge).

## UI (React/Next data-flow only)
- apps/web/src/app/chaos/page.tsx:5,68 -- getBankConfig on a poll (usePolling 68); :70-74 apply() calls updateBankConfig({ mode, latencyMs, failN }).
- chaos/page.tsx:44-46 -- local mode/latencyMs/failN state driving the PUT.
- apps/web/src/lib/api.ts:64-85 -- updateBankConfig: PUT /v1/admin/bank-config; getBankConfig 60-62.
- Dashboard/detail polling (Beat 1's usePolling) surfaces the RETRYING flips.

## Backend (retry + backoff + cross-process chaos)
- apps/api/src/bank/bank-config-sync.service.ts:48-54 -- runs in the WORKER: polls bank_config every BANK_SYNC_MS (2s) and pushes mode/latency onto the sim via setConfig (52). This is how a chaos toggle reaches the worker.
- apps/api/src/worker/payment.processor.ts:96,132 -- withTimeout(bank.authorize, 2000) (96); timeout -> RETRY reason bank_timeout (132).
- payment.processor.ts:142-233 -- RETRY branch: count prior RETRYING events (145-151); count >= MAX_RETRIES (5) -> FAILED (155); else CAS -> RETRYING + event (194-224) and re-enqueue with delay: computeBackoffMs(attempt) (233).
- apps/api/src/worker/backoff.ts:7-8 -- min(1000*2^(attempt-1), 30000) + full jitter (exp/2 + random*exp/2).
- apps/api/src/bank/circuit-breaker.ts + processor:91,138 -- breaker.allow() short-circuits to RETRY when open (91-93); breaker.record() each attempt (138).
- RECOVERY: processor:100 -- bank.authorize idempotencyKey: paymentId is STABLE across retries (recovered call == same call, no double charge); :106-110 authorized -> COMPLETE; :245-283 txn2 CAS -> COMPLETED + audit event + outbox payment.completed.

## Log cmd
docker compose logs --since 3m worker | grep <paymentId> | grep -iE "RETRY|transition"

## Db cmd
# the retry ladder (reason + attempt climb)
docker compose exec postgres psql -U payments -d payments -c "SELECT to_status, metadata->>'reason' AS reason, metadata->>'attempt' AS attempt, occurred_at FROM payment_events WHERE payment_id='<paymentId>' AND to_status='RETRYING' ORDER BY occurred_at;"

# backoff proven: gap between attempts grows (roughly doubles, cap 30s)
docker compose exec postgres psql -U payments -d payments -c "SELECT occurred_at, occurred_at - lag(occurred_at) OVER (ORDER BY occurred_at) AS gap FROM payment_events WHERE payment_id='<paymentId>' AND to_status='RETRYING' ORDER BY occurred_at;"

# current chaos state
docker compose exec postgres psql -U payments -d payments -c "SELECT mode, latency_ms, fail_n, updated_at FROM bank_config;"

# recovery: full trail (retries THEN COMPLETED) + final state
docker compose exec postgres psql -U payments -d payments -c "SELECT from_status, to_status, metadata->>'reason' AS reason, metadata->>'attempt' AS attempt, occurred_at FROM payment_events WHERE payment_id='<paymentId>' ORDER BY occurred_at;"

# part5 - crash recovery = exactly-once effect

## Demo
1. sudo docker compose kill worker -- kill the worker mid-flight.
2. Submit a payment -> it sits in PENDING/PROCESSING (relay publishes the job, but no worker to consume).
3. sudo docker compose up -d worker -- bring it back.
4. It recovers to a terminal state: BullMQ redelivers the in-flight job (fast path); the reaper re-drives anything stuck past 60s (durable backstop).
5. Copy paymentId -> Log cmd: relay published event (enqueue) -> job dequeued (consume, attemptsMade rises on redelivery) -> transition to terminal.
6. Db cmd: terminal state reached, and EXACTLY ONE COMPLETED/FAILED transition = one charge.
Timing note: kill+restart the worker quickly and recovery is BullMQ redelivery (near-instant); the reaper (60s) only matters if the broker also died.

## UI (React/Next data-flow only)
- No new UI -- Beat 1's usePolling shows the payment stranded, then flipping to terminal on recovery.

## Backend (at-least-once delivery + idempotent consumer = exactly-once effect)
- apps/api/src/relay/relay.service.ts:58-66 -- logs 'relay published event' (outboxId = jobId, eventType = job name) then queue.add(..., { jobId: row.id }): jobId = outbox id, so BullMQ dedups a redelivered job.
- apps/api/src/worker/payment.processor.ts:47-50 -- logs 'job dequeued' (jobId, name, attemptsMade) at process() entry: attemptsMade rises on redelivery = at-least-once made visible.
- apps/api/src/relay/reaper.service.ts:50-107 -- reap_once: PROCESSING/RETRYING older than REAPER_DEADLINE_MS (60s) FOR UPDATE SKIP LOCKED (62-65); CAS stranded PROCESSING -> RETRYING event reason 'reaped' (78-92); re-enqueue payment_reap (105).
- apps/api/src/worker/payment.processor.ts:48-88 -- CAS state machine: a redelivered/reaped job already processed hits a zero-row CAS and returns (idempotent); stable bank key (100) = no double charge.

## Log cmd
docker compose logs --since 5m relay worker | grep -E "<paymentId>|reap" | grep -E "relay published event|job dequeued|transition"

## Db cmd
# terminal state reached despite the crash
docker compose exec postgres psql -U payments -d payments -c "SELECT id, status, version, updated_at FROM payments WHERE id='<paymentId>';"

# EXACTLY ONE terminal transition (the exactly-once proof)
docker compose exec postgres psql -U payments -d payments -c "SELECT to_status, count(*) FROM payment_events WHERE payment_id='<paymentId>' AND to_status IN ('COMPLETED','FAILED') GROUP BY to_status;"

# outbox published once, not lost or duplicated
docker compose exec postgres psql -U payments -d payments -c "SELECT id, event_type, published_at IS NOT NULL AS published, webhook_dispatched_at IS NOT NULL AS dispatched FROM outbox WHERE aggregate_id='<paymentId>' ORDER BY created_at;"

# part6 - webhooks: signed fan-out + dead-letter (DLQ)

## Setup
make demo-webhooks   # registers /ok + /fail endpoints, starts the bundled receiver, fires a payment, waits for 1 delivered + 1 dead

## Demo
1. make demo-webhooks -- one command sets it all up (test-only receiver, compose 'webhooks-demo' profile; not in the app image or k8s).
2. Open /webhooks -> table shows both endpoints, the delivered row, and the failing one climbing attempts to dead.
3. Receiver log -> signed POSTs arriving (signature VALID, event_id stable across redelivery, /fail attempts 1..5).
4. Log cmd -> dispatcher 'webhook delivery created' -> processor 'webhook delivery attempt' (ok / last_error).
5. Db cmd -> webhook_deliveries: one delivered, one dead (attempts=5, last_error).

## UI (React/Next data-flow only)
- apps/web/src/app/webhooks/page.tsx:11,37 -- usePolling(refresh, 2000) polls listDeliveries + listEndpoints (25-26).
- webhooks/page.tsx:44-51 -- register() -> createEndpoint(url); :41 secret shown ONCE (only response that exposes it).
- apps/web/src/lib/api.ts:87-106 createEndpoint (POST /v1/webhook-endpoints); 43-54 listDeliveries; 56-58 listEndpoints.

## Backend (fan-out + signed delivery + DLQ)
- apps/api/src/webhooks/webhooks-dispatcher.service.ts:45-91 -- poll outbox payment.completed/failed (50-55), ALL active endpoints (59-60), 1 delivery per event x endpoint + 'webhook delivery created' log (63-77), mark dispatched (80), enqueue webhook.deliver (86-88). Poll every WEBHOOK_POLL_MS (5s). NOTE: global fan-out -- every active endpoint gets every terminal event (no per-customer scoping).
- apps/api/src/webhooks/webhook.processor.ts:23-122 -- early-return if delivered/dead (30); envelope (37-42); HMAC-SHA256 over `${timestamp}.${rawBody}` (44-47); POST x-webhook-id/-timestamp/-signature (55-65); 'webhook delivery attempt' log (74-83); 2xx -> delivered (85-91); else attempts+1: >=5 -> dead/DLQ (96-104), else failed + backoff re-enqueue (106-120).
- apps/api/src/webhooks/webhooks.controller.ts:15-20 -- POST register; secret returned ONCE.

## Log cmd
docker compose logs --since 5m worker | grep -iE "webhook delivery"
docker compose --profile webhooks-demo logs webhook-receiver

## Db cmd
docker compose exec postgres psql -U payments -d payments -c "SELECT id, url, active FROM webhook_endpoints ORDER BY created_at DESC;"
docker compose exec postgres psql -U payments -d payments -c "SELECT wd.status, e.url, wd.attempts, wd.last_error FROM webhook_deliveries wd JOIN webhook_endpoints e ON e.id=wd.endpoint_id ORDER BY wd.created_at DESC LIMIT 10;"
