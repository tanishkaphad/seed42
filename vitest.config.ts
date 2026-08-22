import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 45000,
    hookTimeout: 45000,
  },
});
