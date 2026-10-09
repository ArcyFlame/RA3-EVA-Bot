import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 2,
    setupFiles: ['./tests/setup-env.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
