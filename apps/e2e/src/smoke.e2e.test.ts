import { describe, it, expect } from 'vitest';
import { get, post, options } from './support/client';
import { waitForStatus } from './support/poll';
import { aValidPayment } from './support/fixtures';
import { idempotencyKey } from './support/keys';
import { API_BASE, WEB_ORIGIN } from './support/config';

// ── Post-deploy SMOKE / synthetic check ──────────────────────────────────────
// The minimal NON-DESTRUCTIVE proof that a DEPLOYED environment is healthy: the
// API is up, a golden-path payment completes, CORS is correct for the console
// origin, and the served web bundle points at the right API. Unlike the full e2e
// suite it never touches the bank chaos config, so it is safe against live/prod
// (the synthetic-transaction pattern). Parameterized by host — never a baked IP:
//   make smoke HOST=13.220.187.75.nip.io            (http)
//   make smoke HOST=payments.example.com SCHEME=https
describe(`smoke: ${API_BASE}`, () => {
  it('health: live + ready', async () => {
    expect((await get('/health/live')).status).toBe(200);
    const ready = await get<{ status: string }>('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ok');
  });

  it('golden path: a payment is accepted (202 PENDING) and reaches COMPLETED', async () => {
    const res = await post<{ id: string; status: string }>('/v1/payments', aValidPayment(), {
      idempotencyKey: idempotencyKey(),
    });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('PENDING');

    const final = await waitForStatus(res.body.id, ['COMPLETED', 'FAILED'], { timeout: 30_000 });
    expect(final.status).toBe('COMPLETED');
  });

  it(`CORS: preflight from the console origin (${WEB_ORIGIN}) is allowed`, async () => {
    const res = await options('/v1/payments', {
      headers: {
        origin: WEB_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,idempotency-key',
      },
    });
    expect([200, 204]).toContain(res.status);
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
  });

  it(`web bundle: the served JS points at the API origin (${API_BASE})`, async () => {
    const html = await (await fetch(WEB_ORIGIN)).text();
    const chunks = [
      ...new Set(
        [...html.matchAll(/\/_next\/static\/chunks\/[A-Za-z0-9._/-]+\.js/g)].map((m) => m[0]),
      ),
    ];
    expect(chunks.length).toBeGreaterThan(0);
    const bundle = (
      await Promise.all(chunks.map((p) => fetch(`${WEB_ORIGIN}${p}`).then((r) => r.text())))
    ).join('\n');
    expect(bundle).toContain(API_BASE);
  });
});
