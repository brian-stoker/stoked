/**
 * Setup for E2E tests with Vitest
 */
import { beforeAll, afterAll } from 'vitest';

/**
 * Setup global variables for all E2E tests
 */
beforeAll(async () => {
  // Set up global test environment
  process.env.NODE_ENV = 'test';
  process.env.TESTING = 'true';
  process.env.LLM_MODE = 'mock';
  process.env.STOKED_WORKSPACE_ROOT = './.workspace';
  process.env.STOKED_LOG_LEVEL = 'error';
  process.env.ORC_WORKING_DIR = './.workspace';
  process.env.ORC_LOG_LEVEL = 'error';
});

/**
 * Clean up after all tests
 */
afterAll(async () => {
  // Global cleanup
});

/**
 * Suppress console logs during tests unless DEBUG is set
 */
const originalConsoleLog = console.log;
console.log = (...args) => {
  if (process.env.DEBUG) {
    originalConsoleLog(...args);
  }
};

process.on('exit', () => {
  console.log = originalConsoleLog;
}); 