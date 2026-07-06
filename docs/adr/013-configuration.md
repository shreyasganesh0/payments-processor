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
