import { describe, it, expect } from 'vitest';
import { post } from './support/client';
import { expectProblem } from './support/problem';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';

// ── Assignment requirement: PAYMENT SUBMISSION API ───────────────────────────
// "A client should be able to submit an ACH payment request containing:
//  customerId, sourceAccount, destinationAccount, amount, reference."
// Proves: the five fields are accepted, the request is ACCEPTED (202, async) with
// a Location to the new resource, money is parsed to integer cents at the
// boundary, and every rejection is an RFC 7807 problem document.
describe('Payment Submission API', () => {
  it('accepts the five documented fields → 202 + Location + PENDING', async () => {
    const res = await post<{ id: string; status: string }>(
      '/v1/payments',
      {
        customerId: 'C12345',
        sourceAccount: 'VA10001',
        destinationAccount: 'EXT98765',
        amount: '250.00',
        reference: 'PMT-1001',
      },
      { idempotencyKey: idempotencyKey() },
    );

    expect(res.status).toBe(202);
    expect(res.headers.get('location')).toBe(`/v1/payments/${res.body.id}`);
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(res.body.status).toBe('PENDING');
  });

  it('parses the decimal amount to exact integer cents (no float drift)', async () => {
    const res = await post<{ amountCents: number }>(
      '/v1/payments',
      aValidPayment({ amount: '250.00' }),
      { idempotencyKey: idempotencyKey() },
    );

    expect(res.status).toBe(202);
    expect(res.body.amountCents).toBe(25000);
  });

  it('requires the Idempotency-Key header → 400 problem+json', async () => {
    const res = await post('/v1/payments', aValidPayment()); // no key

    expectProblem(res, { status: 400 });
  });

  it.each([
    ['non-numeric amount', { amount: 'abc' }],
    ['negative amount', { amount: '-5.00' }],
    ['too many decimals', { amount: '12.345' }],
    ['empty customerId', { customerId: '' }],
  ])('rejects %s → 400 problem+json', async (_label, override) => {
    const res = await post('/v1/payments', aValidPayment(override), {
      idempotencyKey: idempotencyKey(),
    });

    expectProblem(res, { status: 400 });
  });
});
