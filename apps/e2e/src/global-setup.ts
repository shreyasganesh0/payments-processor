import { API_BASE } from './support/config';

// Runs once before the whole suite. If the stack is down, every test would
// otherwise hang on a dead socket until timeout; instead we probe readiness
// once and fail immediately with an actionable message.
export default async function setup() {
  const url = `${API_BASE}/health/ready`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`readiness returned ${res.status}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `E2E preflight failed: API not ready at ${url} (${reason}).\n` +
        `Start the stack first:  make up   (or set E2E_API_BASE to a running instance).`,
    );
  }
}
