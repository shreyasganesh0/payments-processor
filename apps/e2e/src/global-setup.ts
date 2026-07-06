import { API_BASE } from './support/config';

// Runs once before the whole suite. Two gates, because /health/ready only covers
// the API (Postgres) — the relay + worker are separate processes with no health
// endpoint, so on a cold stack the first tests would fire before the pipeline is
// warm and flake on tight timeouts:
//   1. API readiness — fail fast with an actionable message if the stack is down.
//   2. A CANARY payment driven to COMPLETED — proves the FULL async pipeline
//      (relay → worker → bank) is live AND warms it (JIT, pools, first bank sync).
//      It also resets the bank to authorize, so a stack left in a chaos mode by a
//      previous run starts clean.
const SETTLE_MS = Number(process.env.BANK_SYNC_MS ?? 2000) + 500;

async function json(res: Response) {
  return (await res.json()) as Record<string, string>;
}

export default async function setup() {
  const readyUrl = `${API_BASE}/health/ready`;
  try {
    const res = await fetch(readyUrl);
    if (!res.ok) throw new Error(`readiness returned ${res.status}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `E2E preflight failed: API not ready at ${readyUrl} (${reason}).\n` +
        `Start the stack first:  make up   (or set E2E_API_BASE to a running instance).`,
    );
  }

  // reset the bank to the deterministic authorize mode, then let the worker poll it
  await fetch(`${API_BASE}/v1/admin/bank-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'always_authorize', latencyMs: 200 }),
  });
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  // canary: submit one payment and wait for the pipeline to drive it terminal
  const submit = await fetch(`${API_BASE}/v1/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': `e2e-canary-${Date.now()}` },
    body: JSON.stringify({
      customerId: 'e2e-canary',
      amount: '1.00',
      sourceAccount: 'CANARY',
      destinationAccount: 'CANARY',
      reference: 'e2e-canary',
    }),
  });
  if (submit.status !== 202) {
    throw new Error(`E2E canary submit returned ${submit.status} (expected 202) — API not accepting payments.`);
  }
  const { id } = await json(submit);

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const p = await json(await fetch(`${API_BASE}/v1/payments/${id}`));
    if (p.status === 'COMPLETED') return;
    if (p.status === 'FAILED') throw new Error('E2E canary FAILED — bank not authorizing on a fresh stack?');
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    'E2E canary did not complete in 30s — the relay/worker are not processing. ' +
      'Is the FULL stack up (make up), not just the API?',
  );
}
