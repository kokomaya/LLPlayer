import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'dictionary',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index (barrel), the reusable contract, and the online `.example`
      // provider (needs network + an API key — see providers/*.example.ts) are
      // excluded; they are validated by the adapters that run the contract, or
      // on a real network off-CI.
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
