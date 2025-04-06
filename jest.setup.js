// Set up global fetch for tests
import nodeFetch from 'node-fetch';

// Set up fetch polyfill if not available
if (!globalThis.fetch) {
  globalThis.fetch = nodeFetch;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}

// Mock console methods to reduce test output noise if needed
// Uncomment these lines to reduce console output during tests
/*
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

console.log = jest.fn();
console.info = jest.fn();
console.debug = jest.fn();

// Restore console methods after tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.info = originalConsoleInfo;
  console.debug = originalConsoleDebug;
});
*/
