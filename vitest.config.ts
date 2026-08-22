import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
