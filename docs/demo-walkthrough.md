# ACH Payment Processing Service — Live Walkthrough Runbook

*Verb convention: **RUN** a command · **CLICK/SHOW** something on screen · **SHOW** code (file + concept) · **SAY** the one-liner that names the invariant.*

---

## 1. Setup (pre-join)

**RUN** — warm the whole stack (postgres, redis, api, relay, worker, web), seeded with a few payments:

```
make demo
```

**RUN** — confirm services are up:

```
docker compose ps
```

**RUN** — verify the readiness probe actually pings Postgres (not a fake 200):

```
curl http://localhost:3000/health/ready
```

**Have open in tabs:** the console at `http://localhost:3001` (dashboard) and `http://localhost:3001/architecture`.

**Opening line — SAY:** "This is an ACH intake and lifecycle service. The design goal isn't fast settlement — real ACH settles over hours in NACHA batches — it's that once I return a `202`, that payment is durable and will reach a terminal state exactly once, even if the worker or broker dies mid-flight. Let me show you that, then walk the code that guarantees it."

---

## 2. Live demo choreography (6 beats, ~7–10 min)

| # | Action | SAY | Proves |
|---|---|---|---|
| **1** | **CLICK** submit on the dashboard form → **SHOW** the live payments table flip `PENDING → PROCESSING → COMPLETED` (2 s polling) → **CLICK** into the payment → **SHOW** the vertical audit timeline | "Submission returns `202` immediately; the queue and worker drive it. Every state change is an append-only event with a reason." | Async processing + full auditability |
| **2** | **CLICK** submit again with the **same `Idempotency-Key`** → **SHOW** still one row in the table | "Same key, same payload — I replay the stored `202` byte-for-byte. No second payment. The DB unique constraint is the arbiter, not an app-level check." | Duplicate prevention (dedupe) |
| **3** | **CLICK** to the chaos page → set bank `mode = always_error` → submit → **SHOW** the payment sitting in `RETRYING` with **growing gaps** between attempts in the timeline | "Bank is erroring. The worker backs off — `min(1000·2^(attempt−1), 30000)` with jitter — and re-enqueues. Retry budget is 5." | Retry + exponential backoff |
| **4** | **CLICK** chaos → set `mode = always_authorize` **while it's mid-retry** → **SHOW** it flip to `COMPLETED`, and **SHOW** the per-attempt reasons already recorded in the timeline | "I healed the bank mid-flight. It recovers on the next attempt, and the audit log shows every reason along the way." | Recovery + traceability |
| **5** | **(the money moment)** **RUN** `docker compose kill worker` → **CLICK** submit a payment → **RUN** `docker compose up -d worker` → **SHOW** it recover to a terminal state, exactly one charge | "Worker died mid-flight. On restart, BullMQ redelivers the in-flight job — that's the fast path. Behind that, the reaper re-drives anything still stuck. CAS plus a stable per-payment bank key mean the recovered attempt can't double-charge." | At-least-once delivery + idempotent consumer = **exactly-once effect** |
| **6** | **(pre-req: `make demo-webhooks`, see below)** **CLICK** to the webhooks page → **SHOW** signed `delivered` POSTs, a failing receiver climbing `attempts`, and a `dead` row in the DLQ | "Terminal events fan out to every active endpoint, each POST HMAC-signed. Five failed attempts and the delivery goes to the DLQ rather than retrying forever." | Event notifications + delivery durability |

**Webhooks pre-flight (Beat 6) — RUN before you present:** `make demo-webhooks` registers a working (`/ok`) + a failing (`/fail`) endpoint against a bundled test receiver, fires a payment, and waits until one delivery is `delivered` and one is `dead` — so the DLQ row already exists the moment you click to the webhooks page (no waiting through the ~30 s backoff live). It's a test-only harness: a stock `node:alpine` under the compose `webhooks-demo` profile, absent from the app image and every `k8s/` manifest, so it never reaches a CD/prod deploy.

**Money-moment caveat — SAY if asked why recovery isn't instant:** "Two nets are in play. BullMQ redelivery fires as soon as the worker is back — that's what you just saw. The reaper is the *durable backstop*: it only re-drives rows stuck past `REAPER_DEADLINE_MS`, which is 60 s. So if I'd also killed the broker, recovery would be bounded by that 60 s deadline, not instant — and that's by design, not a bug."

**Kill/restart commands (keep visible):**

```
docker compose kill worker
docker compose up -d worker
```

---

## 3. Code tour — the money path (10 stops, execution order)

Screen-share the files in this order so it reads top-to-bottom, not as a scramble.

| # | Open | Point at | SAY (ties to the guarantee) |
|---|---|---|---|
| **①** | `apps/api/src/payments/dto/create-payment.dto.ts` + `packages/shared/src/index.ts` | `amount` is a validated **string** (`@Matches(/^\d+(\.\d{1,2})?$/)`); `convAmountToUnits` parses once to integer cents with a `Number.isSafeInteger` guard | "Money never touches a float. It arrives as a string, gets rejected if it has sub-cent precision, and is stored as `amount_cents` BIGINT." |
| **②** | `apps/api/src/payments/payments.service.ts` (`insert_txn`) | the single `db.transaction` inserting **payment + idempotency_keys + outbox**; the `catch` on pg `23505` → read existing row → hash match replays, mismatch throws 409 | "Payment, idempotency record, and outbox event commit in one transaction. Nothing is published to Redis here — that's what kills the dual-write hazard." |
| **③** | `apps/api/src/payments/payments.controller.ts` | `@HttpCode(202)`, `Location` header, required `idempotency-key`, canonicalize-then-hash of the body, `payment_submit_duration_seconds` histogram, `correlationId = req.id` | "Accept fast, do zero external work on the hot path. The correlationId set here threads the entire lifecycle." |
| **④** | `apps/api/src/relay/relay.service.ts` (`poll_once`) | `isNull(publishedAt)` + `payment.submitted`, `.for('update', { skipLocked: true })`, `queue.add(..., { jobId: r.id })`, then mark `publishedAt` **after** publishing | "Publish-before-mark makes this at-least-once. `jobId = outbox id` lets BullMQ dedup. `SKIP LOCKED` lets me run multiple relays safely." |
| **⑤** | `apps/api/src/worker/payment.processor.ts` (txn 1) | `SELECT … FOR UPDATE`, `canTransition(...)`, conditional `UPDATE … SET status='PROCESSING', version=version+1 WHERE id=… AND status=<expected>`; **zero rows → return** | "This is the CAS state machine. If another worker already moved it, my update touches zero rows and I stop. That's what prevents a double transition." |
| **⑥** | `apps/api/src/bank/circuit-breaker.ts` · `apps/api/src/worker/backoff.ts` · `apps/api/src/bank/simulated-bank.adapter.ts` | `breaker.allow()`, `withTimeout(bank.authorize({... idempotencyKey: paymentId }), 2000)`; breaker opens after 5 consecutive failures, stays open 10 s, admits one half-open probe; backoff `min(1000·2^(attempt−1), 30000)` + jitter, budget 5 | "Timeout, breaker, backoff — three independent guards. The bank key is the payment id, stable across every retry, so a retried call is the same call to the bank." |
| **⑦** | `apps/api/src/worker/payment.processor.ts` (txn 2) | CAS `PROCESSING → COMPLETED\|FAILED` + audit event + an **`outbox` row** (`payment.completed`/`payment.failed`), all in one transaction | "The terminal transition and the webhook-triggering outbox row commit together — the notification can't be lost or double-emitted relative to the state change." |
| **⑧** | `apps/api/src/webhooks/webhooks-dispatcher.service.ts` + `apps/api/src/webhooks/webhook.processor.ts` | dispatcher claims terminal outbox (`webhook_dispatched_at IS NULL`, SKIP LOCKED), inserts one `webhook_deliveries` per active endpoint (`event_id = outbox id`); processor returns early if already `delivered`/`dead`, signs `HMAC-SHA256` over `${timestamp}.${rawBody}`, sends `x-webhook-id/-timestamp/-signature`, `attempts >= 5 → dead` | "Same outbox, second marker column, second consumer. Deliveries are idempotent and signed; the stable `event_id` lets the receiver dedupe; five strikes and it's DLQ'd." |
| **⑨** | `apps/api/src/relay/reaper.service.ts` | rows in `PROCESSING`/`RETRYING` older than `REAPER_DEADLINE_MS` (60 s) → CAS to `RETRYING` with event `reason: 'reaped'`, re-enqueue as `payment_reap` | "This is the durable backstop from the money moment — the net under queue redelivery." |
| **⑩** | `apps/api/src/common/problem-detail.filter.ts` | global `@Catch()` rendering `application/problem+json`; correlationId threading; Prometheus metrics (submit histogram, `bankAttempts` by outcome, queue depth, breaker state) | "Every error is RFC 7807, and one correlationId reconstructs a payment's full history across API, worker, and webhook logs." |

---

## 4. The `/architecture` page (~30 s per node)

**CLICK** to `http://localhost:3001/architecture`. Walk the edge labels in flow order; click each node to open its drawer (responsibilities, failure modes, ADR links):

`POST /v1/payments` → `txn: payment + outbox` → `poll outbox · SKIP LOCKED` → `publish · at-least-once` → `consume` → `authorize · idempotent` → `CAS + events` → `fan-out terminal events` → `enqueue delivery` → `signed POST · HMAC`

**SAY as you trace it:** "Each edge is one guarantee. The two that carry the whole design are `txn: payment + outbox` — one write, no dual-write hazard — and `authorize · idempotent` plus `CAS + events` — the pair that turns at-least-once into exactly-once effect."

---

## 5. Anticipated Q&A

| Q | A | ADR |
|---|---|---|
| Why async even if the bank were fast? | Sync couples my latency and availability to the bank, and I lose an accepted payment if I crash mid-call. Async decouples both. | 001 |
| Why isn't `UNIQUE(customer, reference)` enough? | A `reference` isn't intent — clients reuse and collide on it. The `Idempotency-Key` plus a payload hash is the real intent signal. | 002 |
| Name the dual-write failure modes. | Lost job (commit, fail to publish) and phantom job (publish, fail to commit). The outbox collapses both to one local transaction. | 003 |
| Two workers, one job — what stops a double charge? | Row lock (`FOR UPDATE`) + CAS update returning zero rows for the loser + a stable per-payment bank idempotency key. | 006 / 007 |
| Why not exactly-once *delivery*? | It's a myth. At-least-once delivery plus an idempotent consumer gives exactly-once *effect*, which is what actually matters. | 007 |
| Why BullMQ, not Kafka? | Right scale fit, native delayed jobs for backoff, and the queue is never a source of truth — Postgres is. | 004 |
| What does the outbox cost me? | Publish lag of roughly one poll interval, and unbounded table growth without a cleanup job. | 003 |
| Idempotency-key expiry? | No TTL yet — the table grows unbounded. It's the first gap I'd close, with a sweeper. | 002 |
| How does real NACHA batching slot in? | Behind `BankPort`. A batch adapter replaces the simulator without touching the pipeline. | 001 |
| How does this scale? | Read replicas for the GET path, HPA on queue depth, outbox partitioning. | — |
| Poison messages? | Retry budget exhausts to `FAILED` with a recorded reason; the breaker sheds load when the bank is down. | 006 / 007 |

---

## 6. Close

**RUN** — the CI pipeline runs the suite (`make test`), including the three concurrency scenarios (duplicate-submit race, competing workers, concurrent pollers) green.

**SAY the numbers** (full stack up, 10 conns, 30 s, warm; Ryzen 9 7940HS, local Docker): "`POST /v1/payments` is p50 7.3 ms, p99 12.8 ms at ~1,300 req/s with zero errors; `GET /v1/payments` is p99 9 ms at ~2,100 req/s. The submit path holds sub-50 ms *while* the relay and worker drain the backlog — the API's SLO is decoupled from downstream work by construction, which is the entire point of the design."
