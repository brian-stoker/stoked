import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: './test/playwright-report' }],
    ['json', { outputFile: './test/playwright-report/playwright-report.json' }],
    ['list']
  ],
  outputDir: './test/test-results',
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'cli',
      testMatch: /cli\.spec\.ts/,
    },
    {
      name: 'jsdocs',
      testMatch: /jsdocs\.spec\.ts/,
    },
  ],
}); 