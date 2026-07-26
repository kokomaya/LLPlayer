import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'plugins',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index (barrel), the reusable contract, and the real-ASR `.example`
      // provider (needs a model + native/network runtime — see
      // whisper/*.example.ts) are excluded; the contract is exercised by the
      // offline provider that runs it, and the real engine is validated off-CI.
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
