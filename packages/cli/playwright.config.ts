import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  globalSetup: './test/e2e/global-setup.ts',
  reporter: [
    ['html', { outputFolder: './test/playwright-report' }],
    ['json', { outputFile: './test/playwright-report/playwright-report.json' }],
    ['list']
  ],
  outputDir: './test/test-results',
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry',
    baseURL: 'http://localhost:11434', // Ollama host for testing
  },
  timeout: 60000, // Increased timeout for slow tests
  projects: [
    {
      name: 'cli',
      testMatch: /cli\.spec\.ts/,
    },
    {
      name: 'jsdocs',
      testMatch: /jsdocs\.spec\.ts/,
      timeout: 90000, // Longer timeout for JSDoc tests
    },
  ],
}); 