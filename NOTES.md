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
  Horizontal scaling is *designed for* — `FOR UPDATE SKIP LOCKED`, BullMQ jobId
  dedup, and CAS make multiple relays/workers safe — but has not been load-tested
  at scale.

## Local topology

- API `:3000` · Web `:3001` · Worker metrics `:9101`
- Postgres `:5432` · Redis/Valkey `:6379`
- Credentials in local dev are all `payments` (user / password / database).

## Known gaps / not yet built

- **Formal load-test numbers** — the performance section in the README is
  preliminary; a proper autocannon run (fixed hardware, p50/p95/p99 + rps) is
  pending.
- **DLQ replay** — dead webhook deliveries need a manual/scripted replay path.
- **Idempotency-key TTL sweeper** and **outbox cleanup/partitioning** for
  long-running operation.
- **K8s manifests** (probes wired to the real health checks, HPA on queue depth)
  are a stretch, not built.
