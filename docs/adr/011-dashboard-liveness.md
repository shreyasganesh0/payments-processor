# ADR-011: Dashboard liveness

## Context
The dashboard must reflect server-side state changes (payment status transitions, webhook delivery outcomes, bank config) without the user manually refreshing. Processing is asynchronous, so a submitted payment moves through PENDING → PROCESSING → COMPLETED/RETRYING/FAILED over several seconds while the user watches. This decision was deferred at design time (leaning SSE) and settled at L7.3.

## Options
- Short polling — the client re-fetches the list/detail on a fixed interval (e.g. every 2s).
- Server-Sent Events (SSE) — the API pushes updates to the client over a long-lived HTTP stream.
- WebSockets — full bidirectional push.

## Decision
- Use 2s client-side short polling (a `usePolling` hook that pauses while the browser tab is hidden and refetches on refocus).
- SSE / WebSockets are deferred as a possible enhancement, not built.

## Consequences
- Simple: no new server infrastructure, no long-lived connection lifecycle to manage. It rides the existing stateless REST reads, so the API still scales horizontally behind a load balancer with no sticky sessions.
- Liveness latency is bounded by the poll interval (≤ 2s). The pipeline itself takes seconds, so 2s granularity is not the limiting factor for a human-watched ops dashboard.
- Each viewer adds a steady read load (roughly one list query per 2s). Acceptable at demo/dashboard scale, and those reads can be served from a read replica if needed; the tab-hidden pause avoids background waste.
- If sub-second liveness or a large number of concurrent viewers were required, SSE is the natural next step — the `payment_events` audit stream already models exactly what an SSE feed would carry, so the migration path is clear.
