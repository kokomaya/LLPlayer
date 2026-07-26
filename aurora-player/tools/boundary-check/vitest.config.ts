import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'boundary-check',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // A meta-test that shells out to ESLint; the first run builds the Nx graph.
    testTimeout: 120_000,
  },
});
