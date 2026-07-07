import { describe, it, expect } from 'vitest';
import { options } from './support/client';
import { WEB_ORIGIN, API_BASE } from './support/config';

// CORS is enforced by BROWSERS, not by server-side HTTP clients — so an ordinary
// black-box test can't observe a CORS misconfiguration. But the *preflight* is
// plain HTTP: send an OPTIONS with an Origin and read Access-Control-Allow-Origin.
// This catches the classic deploy footgun (CORS_ORIGIN not matching the web's
// public origin → the browser blocks every API call) at the HTTP level, with no
// browser. It runs against any environment via E2E_WEB_ORIGIN.
describe('CORS', () => {
  it(`preflight from the web origin (${WEB_ORIGIN}) is allowed`, async () => {
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

  it('a foreign origin is not allowed (CORS is scoped, not wildcard)', async () => {
    const res = await options('/v1/payments', {
      headers: {
        origin: 'http://evil.example.com',
        'access-control-request-method': 'POST',
      },
    });

    const allow = res.headers.get('access-control-allow-origin');
    expect(allow).not.toBe('http://evil.example.com');
    expect(allow).not.toBe('*');
  });
});

// The OTHER end of the handshake: the web bundle inlines NEXT_PUBLIC_API_BASE at
// build time (ADR-013), so it can silently drift from the API's real public origin
// even when CORS is correct. There is no runtime env to read — the value is baked
// into the served JS. So we fetch the actual bundle the browser would run and grep
// for the API origin. This catches the "rebuilt web image against the wrong API URL"
// footgun without a browser, in any environment (WEB_ORIGIN + API_BASE = E2E_API_BASE).
describe('web bundle API base', () => {
  it(`the served bundle points at the API origin (${API_BASE})`, async () => {
    const rootRes = await fetch(WEB_ORIGIN);
    expect(rootRes.ok).toBe(true);
    const html = await rootRes.text();

    const chunkPaths = [
      ...new Set(
        [...html.matchAll(/\/_next\/static\/chunks\/[A-Za-z0-9._/-]+\.js/g)].map(
          (m) => m[0],
        ),
      ),
    ];
    expect(chunkPaths.length).toBeGreaterThan(0);

    const bundle = (
      await Promise.all(
        chunkPaths.map((p) => fetch(`${WEB_ORIGIN}${p}`).then((r) => r.text())),
      )
    ).join('\n');

    // The baked NEXT_PUBLIC_API_BASE must equal the API's public origin — otherwise
    // the browser fetches the wrong host (or a CORS-mismatched one) and every call
    // fails, exactly the "Failed to fetch" symptom this guards against.
    expect(bundle).toContain(API_BASE);
  });
});
