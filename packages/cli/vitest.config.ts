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
      reporter: ['text', 'json', 'html', 'json-summary'],
      exclude: [
        'node_modules/',
        '.workspace/',
        'test/',
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
      include: ['src/**/*.ts'],
      reportOnFailure: true
    },
    outputFile: {
      html: './test/reports/vitest-results.html',
      json: './test/reports/vitest-results.json'
    }
  }
}); 