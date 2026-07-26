import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'privacy',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The barrel and the reusable contracts are excluded: the barrel is
      // re-exports only, and the contracts are exercised by the tests that run
      // them (policy.test.ts / telemetry.test.ts). `.example` real-backend
      // sketches (http-telemetry-sink) are reference-only, validated off-CI.
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/contract/**',
        'src/**/*.example.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
