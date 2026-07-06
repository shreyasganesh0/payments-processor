import { randomUUID } from 'node:crypto';

// A fresh Idempotency-Key per submission. The API only needs a stable unique
// string per logical request; UUID is built into Node, so no dependency. The
// `e2e-` prefix makes test-generated keys obvious in the DB during a demo.
export const idempotencyKey = () => `e2e-${randomUUID()}`;
