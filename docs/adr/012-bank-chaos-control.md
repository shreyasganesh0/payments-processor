# ADR-012: Cross-process bank chaos control

## Context
The chaos panel must let an operator change the simulated bank's behaviour at runtime (mode: authorize / decline / error / fail-n-then-authorize, latency, failN) to exercise the failure and recovery paths in a live demo. The simulated bank adapter is an in-memory singleton that lives in the **worker** process; the chaos control endpoint lives in the **API** process. The two share no memory, so the config has to travel through shared storage. This is sim/demo-only tooling — a real bank adapter is not "configured" this way — so it must not complicate the production processing path, and it must not break the adapter's DB-free unit tests.

## Options
- Adapter reads `bank_config` from Postgres on every `authorize()` — simplest data flow, but couples the adapter to the DB and breaks its in-memory unit tests (which run with no database).
- Keep the adapter in-memory and unit-testable; a worker-side sync service polls `bank_config` and pushes changes onto the adapter via `setConfig()` — decoupled, reuses the self-scheduling poll pattern already built for the relay/dispatcher, config applies within one tick.
- Push config to the worker over Redis pub/sub — lowest latency, but adds infrastructure the demo does not need.

## Decision
- Store the config in a single-row `bank_config` table in Postgres (`id = 'singleton'`), written by `PUT /v1/admin/bank-config` on the API.
- A `BankConfigSyncService` in the worker polls the row every 2s and applies changes via `adapter.setConfig()`, **change-detected on `updated_at`** so an unchanged config is not re-applied every tick.
- Leave the adapter itself in-memory and untouched, so its behaviour and unit tests stay DB-free.

## Consequences
- Reuses Postgres as the single shared store (consistent with the transactional outbox in ADR-003) — no new infrastructure for the demo.
- The adapter stays a pure in-memory simulator: its logic and tests are unchanged; only a separate poller mutates it, across the process boundary.
- Config changes are eventually applied (within one poll tick, ~2s) — acceptable for a human-driven chaos panel.
- The `updated_at` change-detection is load-bearing: `setConfig` resets the fail-n counter whenever `mode` is set, so re-applying the same config every tick would keep resetting it and `fail_n_then_authorize` would never heal. Applying only on change preserves the counter between ticks.
- Sim/demo-only: the production bank path never reads `bank_config`. A real adapter's configuration (credentials, endpoints, timeouts) would live in normal application config, not a runtime-mutable table exposed over an admin endpoint.
