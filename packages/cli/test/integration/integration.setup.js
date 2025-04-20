// Register ts-node to handle TypeScript files
require('ts-node/register');

// Add environment variables for tests
process.env.NODE_ENV = 'test';
process.env.TESTING = 'true';
process.env.LLM_MODE = 'mock';
process.env.STOKED_WORKSPACE_ROOT = './.workspace';
process.env.STOKED_LOG_LEVEL = 'error';
process.env.ORC_WORKING_DIR = './.workspace';
process.env.ORC_LOG_LEVEL = 'error';

// Set timeout for integration tests
process.env.VITEST_TIMEOUT = '30000';

// Silence console.log during tests
const originalConsoleLog = console.log;
console.log = (...args) => {
  if (process.env.DEBUG) {
    originalConsoleLog(...args);
  }
};

// Restore console.log after tests
process.on('exit', () => {
  console.log = originalConsoleLog;
});

// Global cleanup function
globalThis.cleanup = () => {
  console.log = originalConsoleLog;
};

// Mock random for consistent test results
Math.random = () => 0.5; 