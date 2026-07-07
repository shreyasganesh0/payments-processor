# Demo beat scripts

Companion to `docs/demo-walkthrough.md`. Each script gathers the **logs** and
**database** evidence for one beat so nothing is fumbled live. The UI and the
code you show by hand; these cover the two layers that are easy to forget.

## Use

Stack must be up (`make up` / `make demo`). Then, per beat:

```
demo/beat1.sh [paymentId]    # async + auditability   (defaults to latest payment)
demo/beat2.sh                # idempotency / dedupe    (self-contained, fires its own requests)
demo/beat3.sh [paymentId]    # retry + backoff         (set bank -> always_error first)
demo/beat4.sh [paymentId]    # recovery                (heal bank -> always_authorize first)
demo/beat5.sh [paymentId]    # crash = exactly-once    (kill/restart worker first)
```

Omit the id and the script uses the most recent payment.

## Knobs (env vars)

- `SINCE` — log lookback window (default `30m`). Widen with `SINCE=2h demo/beat3.sh`.
- `API` — API base URL (default `http://localhost:3000`).

## Manual bits each beat still needs

- **Beat 3/4:** set the bank mode on the chaos page (`/chaos`) before running.
- **Beat 5:** `docker compose kill worker` -> submit -> `docker compose up -d worker`.
- **Beat 6 (webhooks):** built separately as `make demo-webhooks`.
