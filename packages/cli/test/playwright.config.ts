import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { getTimestamp, createArtifactDir } from '../scripts/setup-test-artifacts.js';

// Create a timestamped directory for the artifacts
const timestamp = getTimestamp();
const artifactDir = createArtifactDir('e2e', timestamp);

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: path.join(artifactDir, 'playwright-report') }],
    ['json', { outputFile: path.join(artifactDir, 'playwright-report.json') }],
    ['list']
  ],
  outputDir: path.join(artifactDir, 'test-results'),
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry'
  },
  timeout: 60000, // Increased timeout for slow tests
  projects: [
    {
      name: 'cli',
      testMatch: /cli\.spec\.ts/,
    },
    {
      name: 'docs',
      testMatch: /docs\.spec\.ts/,
      timeout: 90000, // Longer timeout for JSDoc tests
    },
  ],
}); 