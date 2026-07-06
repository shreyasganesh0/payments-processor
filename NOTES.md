# NOTES — assumptions & known gaps

A running log of the assumptions this build makes and the things deliberately
left for later. Kept separate from the ADRs (which record *decisions*); this
records *context and edges*.

## Assumptions

- **The bank is simulated.** There is no real ACH/NACHA integration. A real
  provider slots behind the existing `BankPort` (`apps/api/src/bank`); the
  simulator lets us exercise authorize / decline / error / timeout paths.
- **Single-currency amounts.** Money is stored in integer minor units (cents,
  `BIGINT`) and only converted at the API boundary. No FX / multi-currency
  conversion is modelled; `currency` is carried but defaults to USD.
- **Amounts fit a JS safe integer** (~$90T), enforced by a `Number.isSafeInteger`
  guard at the boundary (ADR-005).
- **Idempotency keys are client-supplied** and scoped per `(customer_id, key)`.
  There is no key expiry/TTL sweeper yet, so the idempotency table grows
  unbounded over time.
- **Delivery is at-least-once; consumers are idempotent** (CAS state machine +
  per-payment bank key), which yields effectively-once processing. This is a
  deliberate dual-write-over-2PC tradeoff (ADR-003, ADR-007).
- **`correlationId` is an opaque, log-only value.** It is accepted from an
  inbound header if present, else minted. It is internal-facing observability
  only and is never treated as a security/authorization boundary (ADR-009).
- **The chaos / bank-config control is sim/demo-only.** `bank_config` and
  `/v1/admin/bank-config` exist to drive the simulator during a demo; the
  production bank path never reads them (ADR-012). The admin endpoint is
  unauthenticated in this build.
- **Webhook receivers must be idempotent** (dedupe on the stable event id) and
  verify the HMAC signature. Posting to user-supplied URLs means a hardened
  system must block internal/metadata IPs (SSRF) — acknowledged, out of scope
  (ADR-008).
- **Dashboard liveness is 2s polling**, not real-time (ADR-011).
- **One process per role locally** (api / relay / worker via `scripts/pipeline.sh`).
  Horizontal scaling is verified N-safe (see **Horizontal scaling** below); run
  replicas locally with `RELAYS=2 WORKERS=2 scripts/pipeline.sh up`.

## Local topology

- API `:3000` · Web `:3001` · Worker metrics `:9101`
- Postgres `:5432` · Redis/Valkey `:6379`
- Credentials in local dev are all `payments` (user / password / database).

## Horizontal scaling

Every role runs N-wide with no correctness change — coordination is through
Postgres/Redis, not process count. Run replicas locally with
`RELAYS=2 WORKERS=2 scripts/pipeline.sh up`. Verified:

- **API × N** — 12 parallel same-key submits split across two API instances →
  1 payment, 1 idempotency row (`UNIQUE(customer_id, key)` serializes across all
  instances).
- **Relay × N + Worker × N** — 20 payments through 2 relays + 2 workers → all
  completed with exactly 2 events each (no double-publish, no double-process):
  the relay claims outbox rows with `FOR UPDATE SKIP LOCKED` and BullMQ dedups on
  `jobId = outbox.id`; the worker's CAS finalizes each payment once.
- **Worker × N, forced double-delivery** — 4 distinct-jobId jobs for one payment
  across 2 workers → single effect (COMPLETED, one COMPLETED event, one bankRef).
  The CAS + per-payment bank key guarantee exactly-once.

### What changes as N grows
- **Metrics port** — each worker binds a fixed metrics port. In K8s each pod has
  its own network namespace, so `:9101` is fine per-pod; N workers on one host
  collide, so the local supervisor offsets it per instance (9101, 9102, …).
- **Circuit breaker is per-worker (in-memory)** — the bank can see up to N× the
  failure threshold before every worker's breaker opens. Acceptable (each sheds
  its own load); a Redis-backed shared breaker would be tighter.
- **Poll load** — N relays/dispatchers/reapers each poll on their interval; SKIP
  LOCKED shares the work, not the reads. A tuning knob (interval × N), not
  correctness.
- **Connection counts** — PG and Redis connections scale with replicas.

### What does not change
Correctness. The guards — `SKIP LOCKED`, `UNIQUE` constraints, the CAS state
machine, `jobId` dedup, and the per-payment bank key — keep every role safe at
any N (ADR-003/006/007). Per-payment ordering was never guaranteed and still
isn't.

## Known gaps / not yet built

- **DLQ replay** — dead webhook deliveries need a manual/scripted replay path.
- **Idempotency-key TTL sweeper** and **outbox cleanup/partitioning** for
  long-running operation.
- **K8s manifests** (probes wired to the real health checks, HPA on queue depth)
  are a stretch, not built.
