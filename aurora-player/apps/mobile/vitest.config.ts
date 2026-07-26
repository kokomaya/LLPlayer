import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'mobile',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        // On-device React Native bindings — validated on a device, not in CI.
        'src/ui/**',
        'src/**/*.example.*',
        // Pure type/port declarations (no runtime code to cover).
        'src/adapters/native-video-surface.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
