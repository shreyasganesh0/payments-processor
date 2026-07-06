## Context
External clients need to be notified of payment events (completed / failed). Delivery
must be reliable (retried until acknowledged), authenticated (the receiver must be able
to verify the payload came from us), and must not hammer a down receiver forever.
Webhooks are a SECOND consumer of the outbox, alongside the payments-processing relay
which already drains it via `published_at`.

## Decision
- Outbox-sourced fan-out, same philosophy as [ADR-007]: the DB row is the source of
  truth, the queue is only a trigger.
- The worker emits terminal events (`payment.completed` / `payment.failed`) into the
  outbox transactionally, in the same txn as the state finalize.
- A fan-out dispatcher (a relay-twin) polls the outbox for webhook-worthy events not yet
  dispatched and, for each ACTIVE endpoint, inserts one `webhook_deliveries` row, then
  marks the event dispatched. One event -> N deliveries in a single transaction.
- Independent progress markers: the payments relay keeps `outbox.published_at`; webhooks
  use a new `outbox.webhook_dispatched_at`. The two consumers never collide.
- Per-delivery state lives in `webhook_deliveries` (status pending/delivered/failed/dead,
  attempts, next_attempt_at, last_error). A BullMQ 'webhooks' queue only schedules; the
  row is the source of truth. The DLQ is `status = 'dead'`.
- Delivery is signed with HMAC-SHA256 over the RAW request body, keyed by the endpoint's
  secret, sent in a signature header together with a timestamp (receiver rejects stale
  timestamps to block replay). Receiver compares with a timing-safe function.
- Retries use exponential backoff + jitter, reusing `computeBackoffMs` from Part 4. After
  the retry budget is exhausted the delivery goes to the DLQ (`status = 'dead'`).
- The stable event id sent to the receiver is the OUTBOX event id (ULID); every retry of
  a delivery reuses it so the receiver can deduplicate. (at-least-once + idempotent
  receiver = effectively-once, same as ADR-007.)

## Alternatives rejected
- A single shared `published_at` marker: a webhook event fans out to N endpoints, so one
  boolean "published" flag cannot represent N independent deliveries.
- Having the existing payments relay also enqueue webhook jobs: couples bank-processing
  to webhook concerns; the two paths retry and fail independently.
- Sourcing webhooks from `payment_events` instead of the outbox: the outbox is the chosen
  event-publication channel; `payment_events` is the internal audit log.

## Failure Windows
- Crash between the fan-out insert (delivery rows committed) and enqueueing the delivery
  jobs -> deliveries sit `pending` with no job. Same dual-write-vs-2PC tradeoff as
  ADR-007; the reaper re-enqueues `pending` deliveries past a deadline.

## Consequences
- Receivers must be idempotent (dedupe on the stable event id) because delivery is
  at-least-once; duplicates happen on network blips / retries.
- The DLQ needs a manual (or scripted) replay path for permanently failed deliveries.
- A leaked endpoint secret is isolated to one endpoint; rotation = create a new endpoint.
- We POST to user-supplied URLs, so a hardened system must block internal / metadata IPs
  (SSRF). Acknowledged; out of scope for this build.
