#!/usr/bin/env node

/**
 * Debug helper for CLI - ESM version
 * This file uses .mjs extension to ensure it's always treated as ESM
 */

// Enable source maps for debugging
import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

// Import the logger

// Create a global logger instance
const logger = new ConsoleLogger('DebugHelper');

// Get CLI arguments
const args = process.argv.slice(2);
logger.log('Debug helper running with args:', args);

// Preserve original console methods before overriding
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

// Override console methods to use our logger
console.log = function (...args) {
  logger.log(...args);
};

console.error = function (...args) {
  logger.error(...args);
};

console.warn = function (...args) {
  logger.warn(...args);
};

console.info = function (...args) {
  logger.log(...args);
};

// Important: Preserve original stdout/stderr write functions
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

// Track if we're currently writing to avoid recursion
let isWriting = false;

// Capture and ensure output is still visible for debugging
process.stdout.write = function (...writeArgs) {
  if (!isWriting) {
    isWriting = true;
    try {
      logger.debug(writeArgs[0]);
    } finally {
      isWriting = false;
    }
  }
  return originalStdoutWrite.apply(process.stdout, writeArgs);
};

process.stderr.write = function (...writeArgs) {
  if (!isWriting) {
    isWriting = true;
    try {
      logger.error(writeArgs[0]);
    } finally {
      isWriting = false;
    }
  }
  return originalStderrWrite.apply(process.stderr, writeArgs);
};

// Set up error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
  logger.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// Run the CLI
(async () => {
  try {
    // Import modules
    const cliModule = await import('../dist/cli.module.js');
    const { CommandFactory } = await import('nest-commander');

    logger.log('Starting CLI with arguments:', args);

    // Run the CLI with the arguments
    await CommandFactory.run(cliModule.CliModule, {
      cliName: 'stoked',
      usePlugins: true,
      enablePositionalOptions: true,
      // Always add your arguments directly to the command line
      argv: ['node', 'stoked', ...args],
    });
  } catch (error) {
    logger.error('Error running CLI:', error);
    process.exit(1);
  }
})();
