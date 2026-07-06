import { describe, it, expect, afterAll } from 'vitest';
import { post, get } from './support/client';
import { waitForStatus } from './support/poll';
import { setBankMode, resetBank } from './support/bank';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';

// ── Assignment requirement: ASYNCHRONOUS PROCESSING ──────────────────────────
// "Submitted payments should NOT be processed synchronously. The system should
//  support: queue-based processing, external bank API integrations, retry
//  handling."
// Proves: (1) submit returns immediately in PENDING — the bank call is off the
// request path; (2) the payment is later driven to a terminal state by the queue
// worker; (3) transient bank failures are retried until they succeed, while a
// terminal decline fails fast without retrying.
describe('Asynchronous Processing', () => {
  afterAll(async () => {
    await resetBank();
  });

  it('does NOT process synchronously — 202 PENDING is returned before completion', async () => {
    await resetBank();
    const res = await post<{ id: string; status: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });

    // The response is the acknowledgement, not the result: still PENDING here.
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('PENDING');

    // ...and only becomes terminal afterwards, off the request path.
    const final = await waitForStatus(res.body.id, ['COMPLETED', 'FAILED'], { timeout: 15_000 });
    expect(final.status).toBe('COMPLETED');
  });

  it('retry handling: transient bank errors are retried, then the payment recovers', async () => {
    // Bank errors twice (retryable) before authorizing → the worker must retry
    // rather than give up, ending in COMPLETED with RETRYING recorded.
    await setBankMode({ mode: 'fail_n_then_authorize', failN: 2 });

    const submit = await post<{ id: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });

    const final = await waitForStatus(submit.body.id, 'COMPLETED', { timeout: 20_000 });
    expect(final.status).toBe('COMPLETED');

    const events = await get<Array<{ toStatus: string }>>(
      `/v1/payments/${submit.body.id}/events`,
    );
    expect(events.body.map((e) => e.toStatus)).toContain('RETRYING');
  });

  it('terminal errors fail fast: a declined payment goes to FAILED without retrying', async () => {
    await setBankMode({ mode: 'always_decline' });

    const submit = await post<{ id: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });

    const final = await waitForStatus(submit.body.id, 'FAILED', { timeout: 15_000 });
    expect(final.status).toBe('FAILED');

    // A non-retryable decline should not have bounced through RETRYING.
    const events = await get<Array<{ toStatus: string }>>(
      `/v1/payments/${submit.body.id}/events`,
    );
    expect(events.body.map((e) => e.toStatus)).not.toContain('RETRYING');
  });
});
