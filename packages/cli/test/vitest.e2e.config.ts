import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.e2e-spec.ts'],
    exclude: [
      'node_modules/**',
      '.workspace/**',
      'dist/**',
    ],
    setupFiles: ['./jest.setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      exclude: [
        'node_modules/',
        '.workspace/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      reportsDirectory: process.env.VITEST_COVERAGE_DIR || './test/coverage',
      enabled: true,
      all: true,
      clean: true,
      skipFull: false,
      extension: ['.ts'],
      include: ['src/**/*'],
      reportOnFailure: true
    },
    outputFile: {
      html: './test/reports/vitest-e2e-results.html',
      json: './test/reports/vitest-e2e-results.json'
    }
  }
}); 