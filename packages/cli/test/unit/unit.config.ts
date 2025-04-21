import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTimestamp } from '../../scripts/setup-test-artifacts.ts';

// Get current directory equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Debugging Start ---
console.log(`[Unit Config] process.env.ARTIFACT_TIMESTAMP: ${process.env.ARTIFACT_TIMESTAMP}`);
// --- Debugging End ---

// Get the timestamp (but don't create another directory - let the npm script handle it)
const timestamp = process.env.ARTIFACT_TIMESTAMP || getTimestamp();
const artifactDir = path.join(path.resolve(__dirname, '../../test/reports/artifacts/unit'), timestamp);

// --- Debugging Start ---
console.log(`[Unit Config] Using timestamp: ${timestamp}`);
console.log(`[Unit Config] Calculated artifactDir: ${artifactDir}`);
// --- Debugging End ---

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
    setupFiles: [path.resolve(__dirname, './unit.setup.js')],
    reporters: ['json'],
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
      json: path.join(artifactDir, 'stats', 'results.json')
    },
    root: path.resolve(__dirname, '../../')
  }
}); 