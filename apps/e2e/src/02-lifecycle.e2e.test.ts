import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { post, get } from './support/client';
import { waitForStatus } from './support/poll';
import { resetBank } from './support/bank';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';

// ── Assignment requirement: PAYMENT LIFECYCLE ────────────────────────────────
// "A payment can move through: PENDING, PROCESSING, COMPLETED, FAILED, RETRYING."
// Proves: a payment starts PENDING and, driven asynchronously by the worker,
// advances through PROCESSING to the terminal COMPLETED — a legal state-machine
// walk, observed only from the outside.
describe('Payment Lifecycle', () => {
  beforeAll(async () => {
    // Deterministic happy path regardless of any chaos a prior file left on.
    await resetBank();
  });
  afterAll(async () => {
    await resetBank();
  });

  it('a new payment starts in PENDING', async () => {
    const res = await post<{ status: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });

    expect(res.body.status).toBe('PENDING');
  });

  it('advances PENDING → PROCESSING → COMPLETED', async () => {
    const submit = await post<{ id: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });

    const final = await waitForStatus(submit.body.id, 'COMPLETED', { timeout: 15_000 });
    expect(final.status).toBe('COMPLETED');

    // The audit trail must show the transitions actually walked through
    // PROCESSING on the way (not a direct PENDING → COMPLETED jump).
    const events = await get<Array<{ toStatus: string }>>(
      `/v1/payments/${submit.body.id}/events`,
    );
    const path = events.body.map((e) => e.toStatus);
    expect(path).toContain('PROCESSING');
    expect(path.at(-1)).toBe('COMPLETED');
  });

  it('every payment status is one of the five legal states', async () => {
    const legal = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING'];
    const res = await get<{ data: Array<{ status: string }> }>('/v1/payments?limit=50');

    for (const p of res.body.data) {
      expect(legal).toContain(p.status);
    }
  });
});
