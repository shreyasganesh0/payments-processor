import { describe, it, expect } from 'vitest';
import { post } from './support/client';
import { expectProblem } from './support/problem';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';

// ── Assignment requirement: DUPLICATE REQUESTS ───────────────────────────────
// "Clients may accidentally submit the same payment request multiple times. The
//  system must prevent duplicate payment execution."
// Proves: the Idempotency-Key dedupes — a replay returns the stored response
// (one row), a reused key with a different body is a 409, and — the scenario
// that actually matters — many SIMULTANEOUS duplicates still create exactly one
// payment (the unique constraint, not an app-level check, does the work).
describe('Duplicate Requests', () => {
  it('same key + same payload replays the one stored payment', async () => {
    const key = idempotencyKey();
    const payload = aValidPayment();

    const first = await post<{ id: string }>('/v1/payments', payload, { idempotencyKey: key });
    const second = await post<{ id: string }>('/v1/payments', payload, { idempotencyKey: key });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.id).toBe(first.body.id); // replay of the original, nothing new created
  });

  it('same key + different payload → 409 problem+json', async () => {
    const key = idempotencyKey();
    const first = await post('/v1/payments', aValidPayment({ customerId: 'C-DUP', amount: '10.00' }), {
      idempotencyKey: key,
    });
    expect(first.status).toBe(202);

    const clash = await post('/v1/payments', aValidPayment({ customerId: 'C-DUP', amount: '999.00' }), {
      idempotencyKey: key,
    });
    expectProblem(clash, { status: 409 });
  });

  it('CONCURRENCY: 15 parallel identical submits create exactly one payment', async () => {
    const key = idempotencyKey();
    const payload = aValidPayment();

    // Fire them together — the race the dedupe design must survive.
    const results = await Promise.all(
      Array.from({ length: 15 }, () =>
        post<{ id: string }>('/v1/payments', payload, { idempotencyKey: key }),
      ),
    );

    // Every response is a 202 (one insert wins, the rest replay it).
    for (const r of results) expect(r.status).toBe(202);

    // Exactly one distinct payment id across all 15 responses.
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(1);
  });
});
