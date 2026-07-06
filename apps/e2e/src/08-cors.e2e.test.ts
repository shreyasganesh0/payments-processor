import { describe, it, expect } from 'vitest';
import { options } from './support/client';
import { WEB_ORIGIN } from './support/config';

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
