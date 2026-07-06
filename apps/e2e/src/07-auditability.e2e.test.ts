import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { post, get } from './support/client';
import { waitForStatus } from './support/poll';
import { resetBank } from './support/bank';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';

// ── Assignment requirement: AUDIT-ABILITY ────────────────────────────────────
// "All payment state changes must be traceable."
// Proves: GET /v1/payments/:id/events returns the ordered transition log for a
// payment — every state change recorded, each carrying from/to and a correlation
// id, forming an unbroken chain from the first transition to the terminal state,
// and stable across reads (append-only).
describe('Audit-ability', () => {
  let paymentId: string;
  let events: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    occurredAt: string;
    correlationId: string | null;
    metadata: unknown;
  }>;

  beforeAll(async () => {
    await resetBank();
    const submit = await post<{ id: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });
    paymentId = submit.body.id;
    await waitForStatus(paymentId, 'COMPLETED', { timeout: 15_000 });
    const res = await get<typeof events>(`/v1/payments/${paymentId}/events`);
    events = res.body;
  });
  afterAll(async () => {
    await resetBank();
  });

  it('records the state changes and ends at the terminal status', async () => {
    expect(events.length).toBeGreaterThanOrEqual(2);
    const path = events.map((e) => e.toStatus);
    expect(path).toContain('PROCESSING');
    expect(path.at(-1)).toBe('COMPLETED');
  });

  it('is ordered and forms an unbroken from→to chain', () => {
    const times = events.map((e) => new Date(e.occurredAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b)); // non-decreasing

    for (let i = 1; i < events.length; i++) {
      expect(events[i].fromStatus).toBe(events[i - 1].toStatus);
    }
  });

  it('every state change is traceable to one correlation id', () => {
    const cids = new Set(events.map((e) => e.correlationId));
    expect(cids.size).toBe(1); // one payment → one correlation id across all events
    expect([...cids][0]).toEqual(expect.any(String));
  });

  it('is append-only: the log is stable across reads', async () => {
    const again = await get<typeof events>(`/v1/payments/${paymentId}/events`);
    expect(again.body.map((e) => e.id)).toEqual(events.map((e) => e.id));
  });
});
