# ADR-013: Configuration management

## Context
Runtime configuration (datastore URLs, API port, worker metrics port, CORS
origin) was scattered across five source files — some env-driven with hardcoded
fallbacks, some hardcoded outright — with no single place to change it. Before a
cloud deployment, where every value differs per environment and arrives from a
ConfigMap/Secret (or a PaaS env panel), this needs one source of truth.

## Options
- A plain typed config module read once from `process.env` with defaults +
  validation — no dependency, importable from the three Nest entrypoints and the
  drizzle CLI config.
- `@nestjs/config` — the idiomatic `ConfigModule` + `.env` + a validation schema
  + an injectable `ConfigService`.
- Leave as-is (env vars read ad hoc wherever needed).

## Decision
- A single plain typed `apps/api/src/config.ts` — a frozen object read once from
  the environment with local-dev defaults. In production the datastore URLs are
  required (throw on missing) rather than silently falling back to localhost.
- Every config touchpoint sources from it; a root `.env.example` documents every
  variable.

## Consequences
- One place to change any runtime value, and it maps 1:1 onto a K8s
  ConfigMap/Secret or a PaaS env config.
- No new dependency, and it works in non-Nest contexts — `drizzle.config.ts`
  imports it directly, which a Nest `ConfigService` could not support.
- The web app's `NEXT_PUBLIC_API_BASE` is deliberately NOT unified here: Next
  inlines it at build time, so it is a build-time decision (rebuild per
  environment). This is documented in `.env.example`.
- Production-required-URL validation fails fast on a missing `DATABASE_URL` /
  `REDIS_URL` instead of quietly connecting to localhost.

## Amendment — config as the single plug-n-play surface

Extended so future additions are localized:

- **`config.ts` owns behavioral tuning too**, grouped by concern with env names
  mirroring the group (`config.worker.maxRetries` ← `WORKER_MAX_RETRIES`). The
  previously-scattered constants (retry/backoff, breaker, poll intervals, webhook
  attempts, timeouts) now source their defaults from here; the `*.constants.ts`
  files keep only identifiers (DI tokens, queue names) and thin config-sourced
  aliases. One file to change any knob; unset env → the documented default.
- **Validation is collected then thrown once** at module load (`env`/`num` gained
  `required`/`oneOf`/`min`/`max`; a `bool` helper exists) — every problem at once,
  in every process, still dependency-free.
- **Providers are selected by config via a registry** (`common/provider-registry.ts`).
  `BANK_ADAPTER` (validated against `BANK_ADAPTERS`) picks the bank implementation
  in `bank.module.ts`; injection sites are untouched when it changes. Same recipe
  is the template for a future notifier/auth strategy.
- **Runtime-tunable config** follows the `bank_config` row + poll-sync pattern
  (ADR-012) — a value changeable without redeploy is a DB column + a typed field.
- **`.env` is the single local source**: `scripts/pipeline.sh` sources it and the
  root `.env.example` documents every variable. **Caveat:** `DATABASE_URL` /
  `REDIS_URL` legitimately differ per mode (localhost vs the `postgres`/`valkey`
  service hostnames in compose/k8s), so each mode still supplies its own — that is
  correct 12-factor per-environment config, not duplication. The DB password is
  the one value expressed twice (`DATABASE_URL` and `POSTGRES_PASSWORD`); they must
  match, and rotating it touches both.

### How to add … (the plug-n-play checklist)

- **a config value** → add a field in `config.ts` (with validation opts) + a line
  in `.env.example`. It is now readable in every process and every mode.
- **a pluggable provider** (e.g. a real bank adapter) → implement the port, add
  its key to the registry map + the `*_ADAPTERS` list, set the env var. No change
  at any injection site.
- **a runtime-tunable knob / feature flag** → add a column to the settings row +
  a typed field on the in-memory holder; the poll-sync propagates it.
- **a deployment target** → a new `k8s/overlays/<env>/` patching only the deltas;
  base + `.env` unchanged.
