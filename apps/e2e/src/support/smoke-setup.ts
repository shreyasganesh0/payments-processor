import { API_BASE } from './config';

// Smoke setup: probe readiness only — NON-DESTRUCTIVE (no bank reset / canary),
// so it is safe to run against a live/production environment. Fails fast with an
// actionable message if the target is down.
export default async function setup() {
  const url = `${API_BASE}/health/ready`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`readiness returned ${res.status}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Smoke preflight failed: API not ready at ${url} (${reason}).`);
  }
}
