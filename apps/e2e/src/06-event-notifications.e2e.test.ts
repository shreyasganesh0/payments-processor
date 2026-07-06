import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { post, get, del } from './support/client';
import { waitForDelivery } from './support/poll';
import { resetBank } from './support/bank';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';

// ── Assignment requirement: EVENT NOTIFICATIONS ──────────────────────────────
// "Clients should be able to receive payment status updates through webhooks."
// Proves: endpoint registration returns a signing secret exactly once (and the
// list never leaks it); a payment's status changes fan out to delivery records;
// and an unreachable receiver drives the delivery through retries into the DLQ
// (status 'dead') rather than being lost or retried forever.
//
// Note: the HMAC signature is sent on the wire as `x-webhook-signature` but the
// dispatcher runs inside the container network, unreachable from this host — so
// on-wire signature verification stays with the external receiver harness
// (plan §Part 5). Here we prove the delivery lifecycle the API exposes.
const UNREACHABLE = 'https://e2e-sink.invalid/webhook'; // .invalid → NXDOMAIN, fails fast

describe('Event Notifications (webhooks)', () => {
  let endpointId: string;

  beforeAll(async () => {
    await resetBank(); // payments must complete so status-change events fire
  });
  afterAll(async () => {
    if (endpointId) await del(`/v1/webhook-endpoints/${endpointId}`);
  });

  it('registers an endpoint and returns the secret exactly once', async () => {
    const res = await post<{ id: string; url: string; secret: string; active: boolean }>(
      '/v1/webhook-endpoints',
      { url: UNREACHABLE },
    );

    expect(res.status).toBe(201);
    expect(res.body.url).toBe(UNREACHABLE);
    expect(res.body.active).toBe(true);
    // The secret is the HMAC signing key — a 32-byte hex string.
    expect(res.body.secret).toMatch(/^[0-9a-f]{64}$/);
    endpointId = res.body.id;

    // The list must NOT echo the secret back.
    const list = await get<Array<{ id: string; secret?: string }>>('/v1/webhook-endpoints');
    const mine = list.body.find((e) => e.id === endpointId);
    expect(mine).toBeDefined();
    expect(mine).not.toHaveProperty('secret');
  });

  it('rejects a malformed endpoint URL → 400', async () => {
    const res = await post('/v1/webhook-endpoints', { url: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it(
    'a payment status change produces a signed delivery that DLQs on a dead receiver',
    async () => {
      // Endpoint is registered (from the first test) and points nowhere.
      const submit = await post('/v1/payments', aValidPayment(), { idempotencyKey: idempotencyKey() });
      expect(submit.status).toBe(202);

      // The status change fans out to a delivery for our endpoint...
      const { hit } = await waitForDelivery(endpointId, ['pending', 'failed', 'dead', 'delivered'], {
        timeout: 20_000,
      });
      expect(hit.endpointId).toBe(endpointId);

      // ...which, against an unreachable receiver, exhausts its retry budget
      // (MAX_WEBHOOK_ATTEMPTS with exponential backoff, ~20–25s) and lands in
      // the DLQ instead of retrying forever or vanishing.
      const dead = await waitForDelivery(endpointId, 'dead', { timeout: 75_000 });
      expect(dead.hit.status).toBe('dead');
      expect(dead.hit.attempts).toBeGreaterThanOrEqual(5);
      expect(dead.hit.lastError).toBeTruthy();
    },
    // The test's own budget must exceed the two poll windows above; the global
    // 15s testTimeout is far too short for a retry-budget-exhaustion assertion.
    100_000,
  );

  it('an endpoint can be deleted (deactivated) → 204', async () => {
    const created = await post<{ id: string }>('/v1/webhook-endpoints', { url: UNREACHABLE });
    const res = await del(`/v1/webhook-endpoints/${created.body.id}`);
    expect(res.status).toBe(204);

    const list = await get<Array<{ id: string }>>('/v1/webhook-endpoints');
    expect(list.body.find((e) => e.id === created.body.id)).toBeUndefined();
  });
});
