import { describe, it, expect, beforeEach } from 'vitest';
import { SimulatedBankAdapter } from './simulated-bank.adapter';
import { BankAuthorizeRequest } from './bank.types';

const req = (idempotencyKey: string): BankAuthorizeRequest => ({
  paymentId: idempotencyKey,
  amountCents: 1000,
  currency: 'USD',
  idempotencyKey,
});

describe('SimulatedBankAdapter — bank idempotency key', () => {
  let bank: SimulatedBankAdapter;

  beforeEach(() => {
    bank = new SimulatedBankAdapter();
    bank.setConfig({ latencyMs: 0, mode: 'always_authorize' });
  });

  it('charges exactly once for repeated calls with the same key', async () => {
    const a = await bank.authorize(req('K1'));
    const b = await bank.authorize(req('K1'));
    expect(bank.getCharges()).toBe(1);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: 'authorized', bankRef: 'bank_K1' });
  });

  it('charges separately for distinct keys', async () => {
    await bank.authorize(req('K1'));
    await bank.authorize(req('K2'));
    await bank.authorize(req('K3'));
    expect(bank.getCharges()).toBe(3);
  });

  it('honors the cached authorization even if the mode later flips to decline', async () => {
    const first = await bank.authorize(req('K1')); // authorized + charged
    bank.setConfig({ mode: 'always_decline' });
    const second = await bank.authorize(req('K1')); // same key => cached, not re-evaluated
    expect(second).toEqual(first);
    expect(second.status).toBe('authorized');
    expect(bank.getCharges()).toBe(1);
  });

  it('does not charge on transient errors, and dedups heal-then-redelivery to one charge', async () => {
    // This is the timeout/retry ambiguity made safe: fail, heal on retry, then a
    // redelivery of the SAME key must not double-charge.
    bank.setConfig({ mode: 'fail_n_then_authorize', failN: 1 });

    const r1 = await bank.authorize(req('K1')); // transient error — no charge, not cached
    expect(r1.status).toBe('error');
    expect(bank.getCharges()).toBe(0);

    const r2 = await bank.authorize(req('K1')); // heals => authorized + charge
    expect(r2.status).toBe('authorized');
    expect(bank.getCharges()).toBe(1);

    const r3 = await bank.authorize(req('K1')); // redelivery of same key => cached, still one charge
    expect(r3).toEqual(r2);
    expect(bank.getCharges()).toBe(1);
  });
});
