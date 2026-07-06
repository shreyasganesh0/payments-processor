import { describe, it, expect } from 'vitest';
import { post, get } from './support/client';
import { expectProblem } from './support/problem';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';

// ── Assignment requirement: STATUS RETRIEVAL ─────────────────────────────────
// "Clients should be able to retrieve payment status using an API."
// Proves: fetch one by id, list with cursor pagination and a status filter, and
// the not-found path is still a 7807 problem (not a bare 404 page).
describe('Status Retrieval', () => {
  it('fetches a single payment by id', async () => {
    const submit = await post<{ id: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });

    const res = await get<{ id: string; status: string }>(`/v1/payments/${submit.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(submit.body.id);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('amountCents');
  });

  it('lists payments as { data, nextCursor }', async () => {
    await post('/v1/payments', aValidPayment(), { idempotencyKey: idempotencyKey() });
    await post('/v1/payments', aValidPayment(), { idempotencyKey: idempotencyKey() });

    const res = await get<{ data: unknown[]; nextCursor: string | null }>('/v1/payments');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('nextCursor');
  });

  it('paginates by cursor: limit caps the page and yields a cursor', async () => {
    const page = await get<{ data: unknown[]; nextCursor: string | null }>('/v1/payments?limit=1');

    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.nextCursor).toEqual(expect.any(String));

    // The cursor advances to a different page (no overlap on the first item).
    const next = await get<{ data: Array<{ id: string }> }>(
      `/v1/payments?limit=1&cursor=${page.body.nextCursor}`,
    );
    expect(next.status).toBe(200);
    expect((page.body.data as Array<{ id: string }>)[0].id).not.toBe(next.body.data[0]?.id);
  });

  it('filters by status', async () => {
    const res = await get<{ data: Array<{ status: string }> }>('/v1/payments?status=COMPLETED');

    expect(res.status).toBe(200);
    for (const p of res.body.data) expect(p.status).toBe('COMPLETED');
  });

  it('rejects an out-of-range limit → 400 problem+json', async () => {
    expectProblem(await get('/v1/payments?limit=0'), { status: 400 });
  });

  it('unknown id → 404 problem+json', async () => {
    expectProblem(await get('/v1/payments/does-not-exist'), { status: 404 });
  });
});
