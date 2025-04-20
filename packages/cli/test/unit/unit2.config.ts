/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Ensure Vitest doesn't conflict with Jest
    globals: false,
    environment: 'node',
    outputFile: `${process.env.VITEST_ARTIFACT_DIR}/unit-coverage.json`,
    includeSource: ['src/**/*.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '.idea/**', '.git/**'],
    // Ensure proper setup for decorator metadata
    deps: {
      interopDefault: true,
    },
    setupFiles: ['./test/vitest.setup.ts'],
  },
});
