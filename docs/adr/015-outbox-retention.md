# ADR-015: Outbox retention via time partitioning

## Context
Outbox rows are transient plumbing: written in the payment transaction, claimed once
by the relay (`published_at`) or the webhook dispatcher (`webhook_dispatched_at`), then
never read again — both pollers only scan rows where their marker `IS NULL`. Nothing
deletes them, so the table grows unbounded: index bloat and slower `IS NULL` poll scans
over a pile of dead rows. Unlike `payment_events`, the outbox is not an audit log — a
finished row duplicates facts already recorded in `payments`/`payment_events`, so it is
safe to delete.

## Decision
Range-partition `outbox` by `created_at` (one partition per UTC day) and drop partitions
older than `OUTBOX_RETENTION_DAYS` (default 7). The primary key becomes `(id, created_at)`
because Postgres requires every unique constraint on a partitioned table to include the
partition key; `id` is a ULID so this widening changes nothing semantically. A relay-side
`OutboxCleanupService` runs a self-scheduling tick that (a) creates the next 7 days of
partitions ahead of time so inserts always have a home, and (b) drops day-partitions whose
whole range is older than the retention window. A `DEFAULT` partition is an insert-safety
net for any row outside the pre-created window.

## Why partitioning, not a batched DELETE
`DROP TABLE partition` is O(1) metadata vs. row-by-row `DELETE` churn and bloat. Partition
retention is a poor fit for `idempotency_keys` (the partition key would have to join the
unique constraint, weakening dedup) and forbidden on `payment_events` (append-only audit,
invariant #5). The outbox has neither constraint — it is the one table where partition-drop
is both safe and free.

## Safety
Retention (7 days) is far larger than processing latency (relay poll ~1s, webhook
dispatcher poll ~5s), so any partition old enough to drop is guaranteed fully processed —
dropping it can never discard an unpublished row. The cleanup only drops partitions matching
`outbox_pYYYYMMDD`; the `DEFAULT` partition is never dropped.

## Consequences
- PK widened to `(id, created_at)`.
- A small partition-maintenance loop lives in the relay process, alongside the reapers.
- Existing outbox rows are dropped by the migration (transient data, acceptable).
- Retention is a knob: `OUTBOX_RETENTION_DAYS` must stay well above processing latency.
