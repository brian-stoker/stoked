/**
 * E2E test configuration for Playwright
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// **** Get Artifact Directory from Environment Variable ****
const artifactDir = process.env.CURRENT_E2E_ARTIFACT_DIR;

if (!artifactDir) {
  console.error('ERROR: CURRENT_E2E_ARTIFACT_DIR environment variable is not set.');
  console.error('This script should be run via the run-e2e-tests.ts orchestrator.');
  process.exit(1); // Exit if the crucial path is missing
}
console.log(`[Playwright Config] Using artifact directory: ${artifactDir}`);
// *********************************************************

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.TESTING = 'true';
process.env.LLM_MODE = 'mock';
process.env.STOKED_WORKSPACE_ROOT = './.workspace';
process.env.STOKED_LOG_LEVEL = 'error';
process.env.ORC_WORKING_DIR = './.workspace';
process.env.ORC_LOG_LEVEL = 'error';
// Ensure the artifact dir is explicitly set in the environment
process.env.CURRENT_E2E_ARTIFACT_DIR = artifactDir;

/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './',
  testMatch: /.*\.(e2e-spec|spec)\.ts$/,
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['list'], // Console output
    ['html', { outputFolder: path.join(artifactDir, 'html-report'), open: 'never' }], // Explicitly disable opening HTML report
    ['json', { outputFile: path.join(artifactDir, 'results.json') }], // JSON report in artifacts
  ],
  coverage: {
    provider: 'v8',
  },
  use: {
    trace: 'on-first-retry',
    baseURL: process.env.TEST_URL || 'http://localhost:3000',
  },
  outputDir: path.join(artifactDir, 'test-results'),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Isolate the expect implementations 
  expect: {
    timeout: 5000,
  },
  // Suppress console log output during tests
  quiet: !process.env.DEBUG,
});
