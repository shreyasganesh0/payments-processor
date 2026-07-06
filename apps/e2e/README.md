# @apps/e2e — black-box acceptance suite

HTTP-driven tests that hit the **running** stack (no mocks, no DB access). Each
file maps to one functional requirement from the assignment, so running a file
proves that requirement in isolation; `full-flow` exercises them together.

## Requirement → test file

| Assignment requirement | File |
|---|---|
| Payment Submission API | `src/01-submission.e2e.test.ts` |
| Payment Lifecycle | `src/02-lifecycle.e2e.test.ts` |
| Asynchronous Processing (queue + bank + retry) | `src/03-async-processing.e2e.test.ts` |
| Duplicate Requests (idempotency + concurrency) | `src/04-duplicate-requests.e2e.test.ts` |
| Status Retrieval | `src/05-status-retrieval.e2e.test.ts` |
| Event Notifications (webhooks) | `src/06-event-notifications.e2e.test.ts` |
| Audit-ability | `src/07-auditability.e2e.test.ts` |
| _(infra) health probes_ | `src/00-health.e2e.test.ts` |
| **End-to-end narrative (happy + failure + recovery)** | `src/full-flow.e2e.test.ts` |

## Run

```bash
make up            # start the stack first (needs Docker)
make e2e           # whole suite

# one requirement in isolation (vitest filters by filename substring):
pnpm --filter @apps/e2e test 04-duplicate
pnpm --filter @apps/e2e test full-flow
```

Target a non-default stack (e.g. a cluster) with `E2E_API_BASE`:

```bash
E2E_API_BASE=http://api.payments.local make e2e
```

## Notes

- Runs sequentially (`fileParallelism: false`) — the concurrency and chaos tests
  need a single shared view of the database.
- A global preflight fails fast with an actionable message if the stack is down.
- Chaos tests flip the simulated bank via `PUT /v1/admin/bank-config` and wait
  one 2s sync interval; each resets the bank to `always_authorize` afterward.
- Webhook on-wire HMAC verification needs a receiver reachable from the
  dispatcher container, so it stays with the external receiver harness; here we
  assert the delivery lifecycle the API exposes (fan-out → retry → DLQ).
