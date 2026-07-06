import { put } from './client';

// The simulated bank's mode lives in a DB row (bank_config) that the worker
// polls every BANK_SYNC_MS (ADR-012). So flipping it from a test means: PUT the
// config, then wait past one sync interval before the change is in effect. We
// read the same env var the worker uses (default 2000) + a small margin, so a
// tuned sync interval propagates here too instead of a hardcoded copy.
const SYNC_SETTLE_MS = Number(process.env.BANK_SYNC_MS ?? 2000) + 500;

export type BankMode =
  | 'always_authorize'
  | 'always_decline'
  | 'always_error'
  | 'fail_n_then_authorize';

export async function setBankMode(
  patch: { mode: BankMode; failN?: number; latencyMs?: number },
  { settle = true }: { settle?: boolean } = {},
) {
  const res = await put('/v1/admin/bank-config', patch);
  if (settle) await new Promise((r) => setTimeout(r, SYNC_SETTLE_MS));
  return res;
}

// Return the bank to the deterministic happy-path mode. Call in afterAll of any
// test that induced chaos, so later files start from a known state.
export const resetBank = () => setBankMode({ mode: 'always_authorize', latencyMs: 200 });
