# ACH Payment Processing Service

A backend service that accepts ACH payment requests and manages their lifecycle
asynchronously through a (simulated) banking partner. It is built to be
**resilient, observable, and safe to recover from failure** — the properties
that matter when banking systems are intermittently available and network
failures are routine.

It ships with an operations console (Next.js) so the full happy path and failure
path can be demonstrated without touching a terminal.

## What & why

A client submits a payment over HTTP. The API **accepts it (202) without
processing inline** and durably records it; a background pipeline then drives the
payment through its lifecycle and notifies the client via webhooks.

```
PENDING → PROCESSING → COMPLETED
                    ↘ FAILED
                    ↘ RETRYING → PROCESSING → …
```

The design's spine is a **transactional outbox**: the payment and an outbox event
are written in one database transaction, a relay publishes the event to a queue
*at least once*, and an idempotent worker consumes it. This avoids a distributed
transaction across Postgres and Redis while guaranteeing no payment is lost and
none is executed twice.

## Architecture

```mermaid
flowchart LR
  Client -->|POST /v1/payments| API
  API -->|txn: payment + outbox| PG[(Postgres)]
  Relay -->|poll outbox · SKIP LOCKED| PG
  Relay -->|publish · at-least-once| Redis[(Redis)]
  Redis -->|consume| Worker
  Worker -->|authorize · idempotent| Bank[Bank ext.]
  Worker -->|CAS + events| PG
  Dispatcher -->|fan-out terminal events| PG
  Dispatcher -->|enqueue delivery| Redis
  Worker -->|signed POST · HMAC| Receiver[Webhook receiver]
```

- **API** (`apps/api`, port 3000) — validates and accepts payments; writes the
  payment, outbox row, and idempotency record in one transaction.
- **Relay** — polls the outbox (`FOR UPDATE SKIP LOCKED`) and publishes to the
  queue, publish-before-mark (at-least-once).
- **Worker** — consumes jobs, drives the state machine with a compare-and-swap,
  calls the bank, and handles retries (exponential backoff + jitter), a retry
  budget, and a circuit breaker.
- **Dispatcher** — fans terminal events out to webhook deliveries and enqueues
  signed delivery jobs (HMAC), with retries and a dead-letter queue.
- **Postgres** — system of record (payments, `payment_events` audit trail,
  outbox, idempotency keys, webhook tables). **Redis / Valkey** — BullMQ queues.

An interactive version with per-component responsibilities, failure modes, and
links to the decisions lives at **`/architecture`** in the console.

## Quickstart

Prerequisites: Node ≥ 22.13, pnpm 11, Docker.

```bash
# 1. datastores (Postgres + Valkey)
docker compose up -d

# 2. dependencies
pnpm install

# 3. apply migrations
cd apps/api && DATABASE_URL=postgresql://payments:payments@localhost:5432/payments npx drizzle-kit migrate && cd ../..

# 4. start the pipeline (api + relay + worker) and the console
scripts/pipeline.sh up
pnpm --filter @apps/web dev
```

Open **http://localhost:3001**. The API is on `:3000` (`/health/live`,
`/health/ready`, `/metrics`); the worker exposes metrics on `:9101/metrics`.

> A single-command containerized stack (`docker compose` for every service +
> `make demo` with seed data) is a planned convenience — see *What I'd do next*.

## Demo script

1. **Submit** a payment from the console → watch it move `PENDING → PROCESSING →
   COMPLETED` live; open its **audit timeline**.
2. **Duplicate** — resubmit with the same Idempotency-Key → one payment, replay
   response.
3. **Chaos** — set the bank to *error* → the payment goes `RETRYING` with visibly
   growing backoff gaps in the timeline.
4. **Heal** the bank mid-retry → it completes; each attempt's reason is in the
   audit trail.
5. **Recovery** — kill the worker mid-flight, submit, restart → it recovers and
   completes with no duplicate bank effect (*at-least-once delivery, idempotent
   consumer*).
6. **Webhooks** — the deliveries view shows signed POSTs, retries against a dead
   receiver, and the dead-letter queue.

## API

- `POST /v1/payments` — submit (202 + `Location`); requires an `Idempotency-Key`.
- `GET /v1/payments?status=&cursor=&limit=` — keyset-paginated list.
- `GET /v1/payments/:id` — status.
- `GET /v1/payments/:id/events` — append-only audit trail.
- `POST|GET|DELETE /v1/webhook-endpoints` — manage webhook endpoints (secret
  returned once).
- `GET /v1/webhook-deliveries?status=&cursor=&limit=` — delivery attempts.
- `GET|PUT /v1/admin/bank-config` — chaos control for the simulated bank.

## Key decisions (ADRs)

Full write-ups in [`docs/adr`](docs/adr) (Context / Options / Decision /
Consequences).

- **001 — Sync vs async:** accept-then-process (202), process off a queue.
- **002 — Idempotency:** `Idempotency-Key` + `UNIQUE(customer, key)` + stored
  response; duplicates replay, not re-execute.
- **003 — Transactional outbox:** avoid a 2-phase commit across PG + Redis.
- **004 — Queue technology:** BullMQ on Redis/Valkey; the queue is not the source
  of truth.
- **005 — Money:** integer minor units (cents), never floats.
- **006 — State machine + ULID:** explicit transition map enforced in code *and*
  by a DB compare-and-swap.
- **007 — Delivery semantics:** at-least-once delivery + idempotent consumer =
  effectively-once; retry budget, backoff, circuit breaker.
- **008 — Webhook delivery:** outbox-sourced fan-out, HMAC signing, retries, DLQ.
- **009 — Observability:** correlation-id propagation, structured logs (pino),
  Prometheus metrics.
- **010 — Data access:** Drizzle ORM + migrations.
- **011 — Dashboard liveness:** 2s polling (SSE deferred).
- **012 — Bank chaos control:** DB-backed, poll-synced cross-process config.

## Testing

```bash
pnpm typecheck        # all packages
pnpm -r lint          # web
pnpm -r test          # unit tests
```

- **Unit:** money mapper, state-transition map, backoff calculator, circuit
  breaker, bank idempotency (`packages/shared` + `apps/api`).
- **Concurrency / fault-injection (verified end-to-end against a running stack):**
  parallel duplicate submissions → one payment; double job delivery → single bank
  effect; crash between DB commit and publish → outbox recovery; webhook retries →
  dead-letter.
- **CI** (GitHub Actions): install → typecheck → lint → test.

## Performance

Hot path budget: validation + one transaction (three inserts) + serialization —
nothing external. A preliminary local reading of `POST /v1/payments` was
p50 ≈ 3.3 ms / p95 ≈ 4.6 ms (local dev, warm). A formal autocannon run
(30s, p50/p95/p99 + rps, stated hardware) is pending and will be published here.

## Out of scope & what I'd do next

- One-command containerized stack + seed script (`make up | demo | test`).
- SSE for sub-second dashboard liveness (the `payment_events` stream already
  models the feed).
- A real NACHA-batching bank adapter behind the existing bank port.
- Idempotency-key TTL sweeper; outbox partitioning/cleanup; read replicas for GETs.
- K8s manifests (probes wired to the real health checks, HPA on queue depth).
