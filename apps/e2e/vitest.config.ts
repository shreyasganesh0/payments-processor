import { defineConfig } from 'vitest/config';

// Black-box suite: it talks to the RUNNING compose stack over HTTP, so it is not
// a normal parallel unit run. Two deliberate choices:
//   - no file parallelism: the concurrency scenarios (duplicate submits,
//     redelivery) depend on ordering; parallel files would race each other
//     against one shared database. `fileParallelism: false` forces one worker.
//   - a global setup that fails fast if the stack is down, instead of every
//     test hanging on a dead connection.
export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    globalSetup: ['./src/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    reporters: 'verbose',
  },
});
