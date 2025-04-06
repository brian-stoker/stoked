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
      reportsDirectory: './coverage'
    }
  },
}); 