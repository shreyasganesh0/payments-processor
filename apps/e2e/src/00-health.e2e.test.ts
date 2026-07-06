import { describe, it, expect } from 'vitest';
import { get } from './support/client';

// Infrastructure precondition (not a functional requirement, but it proves the
// stack is wired): liveness is a bare process check; readiness gates on real
// dependencies (Postgres). Also the reference example of the client pattern.
describe('Health', () => {
  it('GET /health/live → 200 { status: "ok" }', async () => {
    const res = await get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready → 200 with postgres up', async () => {
    const res = await get<{ status: string }>('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
