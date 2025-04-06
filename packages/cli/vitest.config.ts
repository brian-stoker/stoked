import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: [
      'node_modules/**',
      '.workspace/**',
      'dist/**',
      '**/*.e2e-spec.ts',
    ],
    setupFiles: ['./jest.setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.workspace/',
        'test/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      // The coverage directory will be set by the VITEST_COVERAGE_DIR environment variable
      // in the test:unit:cov and test:integration:cov scripts
      reportsDirectory: process.env.VITEST_COVERAGE_DIR || './coverage'
    }
  },
}); 