import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'desktop',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        // On-device Tauri/libmpv bindings — validated via `tauri dev`, not in CI.
        'src/ui/**',
        'src/**/*.example.*',
        // Pure type/port declarations (no runtime code to cover).
        'src/adapters/desktop-video-surface.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
