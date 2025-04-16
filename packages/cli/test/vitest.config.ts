import { defineConfig } from 'vitest/config';
import path from 'path';
import { getTimestamp, createArtifactDir } from '../scripts/setup-test-artifacts.js';

// Create a timestamped directory for the artifacts
const timestamp = getTimestamp();
const artifactDir = createArtifactDir('unit', timestamp);

// Path relative to test directory
const relativeArtifactDir = path.relative(
  path.resolve('./test'),
  artifactDir
);

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
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      reportsDirectory: path.join(artifactDir, 'coverage'),
      enabled: true,
      all: true,
      clean: true,
      skipFull: false,
      extension: ['.ts'],
      include: ['src/**/*'],
      reportOnFailure: true
    },
    outputFile: {
      html: path.join(artifactDir, 'vitest-results.html'),
      json: path.join(artifactDir, 'vitest-results.json')
    }
  }
}); 