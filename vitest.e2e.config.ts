import { defineConfig } from 'vitest/config'

// E2E Nimbus suite (story 6.3) — `npm run test:e2e`, the release gate.
// Files end in .e2e.ts so the unit config's *.test.ts include never picks
// them up; this config exists solely to run them.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts'],
    // one module drive shares engine/db/poller state — never parallelize files
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
