#!/usr/bin/env node

// This is a helper script for debugging specific commands
// Usage: node debug.js <command> [args...]
// Example: node debug.js config repo

// Enable source maps for debugging
import 'source-map-support/register.js';

// Forward all arguments to the ts-main.ts entry point
const args = process.argv.slice(2);
console.log('Running command with args:', args);

// Set these args as global so they can be accessed
global.__CLI_ARGS = args;

// Add unhandled error handlers for better debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Import the ts-main.ts file
import('./ts-main.js').catch((err) => {
  console.error('Error running the CLI:', err);
  process.exit(1);
});
