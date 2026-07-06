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

Prerequisites: Docker (plus Node ≥ 22.13 + pnpm 11 for the dev workflow).

**One command** builds and runs the whole stack — Postgres, Valkey, migrations,
API, relay, worker, and the console — seeded with a few payments:

```bash
make demo          # or: docker compose up -d --build
```

Open **http://localhost:3001**. The API is on `:3000` (`/health/live`,
`/health/ready`, `/metrics`); the worker exposes metrics on `:9101/metrics`.
`make down` stops the stack; `make clean` also drops the data volume.

**Dev workflow** (hot reload, roles on the host):

```bash
docker compose up -d postgres valkey     # datastores only
pnpm install
cd apps/api && DATABASE_URL=postgres://payments:payments@localhost:5432/payments npx drizzle-kit migrate && cd ../..
scripts/pipeline.sh up                     # api + relay + worker
pnpm --filter @apps/web dev                # console on :3001
```

**Kubernetes** — manifests for a cluster deploy (a Deployment per role with
`replicas: N`, a migration Job, ConfigMap/Secret, Ingress, and an HPA that scales
the worker on queue depth) live in [`k8s/`](k8s/).

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
nothing external. Measured with the **full stack running** (api + relay + worker
+ Postgres + Valkey), 10 concurrent connections, 30s, warm:

- `POST /v1/payments` (real inserts, unique key per request) — **p50 7.3 ms ·
  p95 10.7 ms · p99 12.8 ms** at ~1,300 req/s, 0 errors.
- `GET /v1/payments` — **p50 4 ms · p95 8 ms · p99 9 ms** at ~2,100 req/s.

Environment: AMD Ryzen 9 7940HS, local Docker, single node per role. The submit
path stays well under the 50 ms target *even while* the relay and worker are
draining the resulting backlog. Reproduce with `make load` (or
`node scripts/loadtest.mjs post|get`) against a running stack.

## Out of scope & what I'd do next

- SSE for sub-second dashboard liveness (the `payment_events` stream already
  models the feed).
- A real NACHA-batching bank adapter behind the existing bank port.
- Idempotency-key TTL sweeper; outbox partitioning/cleanup; read replicas for GETs.
- Wire the HPA's queue-depth metric through a live Prometheus Adapter (manifests
  in `k8s/` are ready; the adapter is a cluster prerequisite).
