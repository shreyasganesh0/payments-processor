import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { post, get, del } from './support/client';
import { waitForStatus, waitForDelivery } from './support/poll';
import { setBankMode, resetBank } from './support/bank';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';

// ── FULL FLOW: the whole system in one narrative ─────────────────────────────
// The demo choreography end-to-end, touching every functional requirement in a
// single run: submit → async processing → lifecycle to COMPLETED → auditable
// trail → webhook fan-out; then the failure path (chaos → terminal FAILED);
// then recovery of the bank. If this passes, the pieces work together, not just
// in isolation.
describe('Full flow (happy path + failure path)', () => {
  let endpointId: string;

  beforeAll(async () => {
    await resetBank();
    const ep = await post<{ id: string }>('/v1/webhook-endpoints', {
      url: 'https://e2e-sink.invalid/full-flow',
    });
    endpointId = ep.body.id;
  });
  afterAll(async () => {
    if (endpointId) await del(`/v1/webhook-endpoints/${endpointId}`);
    await resetBank();
  });

  it('happy path: submit → COMPLETED → audited → webhook dispatched', async () => {
    // 1. Submit — accepted asynchronously.
    const submit = await post<{ id: string; status: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });
    expect(submit.status).toBe(202);
    expect(submit.body.status).toBe('PENDING');
    const id = submit.body.id;

    // 2. Lifecycle drives it to COMPLETED off the request path.
    const final = await waitForStatus(id, 'COMPLETED', { timeout: 15_000 });
    expect(final.status).toBe('COMPLETED');

    // 3. The transition is auditable, ordered, correlation-tagged.
    const events = await get<
      Array<{ toStatus: string; fromStatus: string | null; correlationId: string | null }>
    >(`/v1/payments/${id}/events`);
    expect(events.body.map((e) => e.toStatus)).toContain('PROCESSING');
    expect(events.body.at(-1)?.toStatus).toBe('COMPLETED');
    expect(new Set(events.body.map((e) => e.correlationId)).size).toBe(1);

    // 4. The status change fanned out to a webhook delivery for our endpoint.
    const { hit } = await waitForDelivery(endpointId, ['pending', 'failed', 'dead', 'delivered'], {
      timeout: 15_000,
    });
    expect(hit.endpointId).toBe(endpointId);
  });

  it('failure path: a declined payment ends in FAILED', async () => {
    await setBankMode({ mode: 'always_decline' });

    const submit = await post<{ id: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });
    const final = await waitForStatus(submit.body.id, 'FAILED', { timeout: 15_000 });
    expect(final.status).toBe('FAILED');
  });

  it('recovery: the bank heals and new payments complete again', async () => {
    await resetBank();

    const submit = await post<{ id: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });
    const final = await waitForStatus(submit.body.id, 'COMPLETED', { timeout: 15_000 });
    expect(final.status).toBe('COMPLETED');
  });
});
