import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'node_modules.pnpm-backup/**', 'dist/**', 'dist-server/**']
  }
});
