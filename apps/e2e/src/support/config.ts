// Where the black-box suite points. This is a CLIENT-side target, so — like the
// web app's NEXT_PUBLIC_API_BASE — it deliberately lives OUTSIDE the server
// config module (ADR-013 keeps client base URLs separate). Every test reads the
// running stack through this one value; no hard-coded host scattered across files.
//
//   local (default):   http://localhost:<PORT>   — honors the unified PORT var
//   remote / k8s:       E2E_API_BASE=http://api.payments.local make e2e
const port = process.env.PORT ?? '3000';
export const API_BASE = process.env.E2E_API_BASE ?? `http://localhost:${port}`;
