import { defineConfig } from 'vitest/config';

// Smoke config: runs ONLY the smoke suite with a health-only (non-destructive)
// setup — distinct from the full e2e run (which resets the bank + drives a
// canary), so `make smoke` is safe to point at a live/production environment.
export default defineConfig({
  test: {
    include: ['src/smoke.e2e.test.ts'],
    globalSetup: ['./src/support/smoke-setup.ts'],
    fileParallelism: false,
    testTimeout: 35_000,
    hookTimeout: 35_000,
    reporters: 'verbose',
  },
});
