#!/usr/bin/env node
/**
 * Simple debug script for ESM CLI - zero console manipulation
 */

import { CommandFactory } from 'nest-commander';
import { CliModule } from '../dist/cli.module.js';

// Basic error handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

// Main function
async function main() {
  try {
    // Output start
    console.log('Starting CLI...');
    console.log('Arguments:', process.argv.slice(2));
    
    // Run the CLI with the provided arguments
    console.log('Initializing CommandFactory...');
    await CommandFactory.run(CliModule, {
      cliName: 'stoked',
      usePlugins: true,
      enablePositionalOptions: true,
      logger: {
        log: (msg) => console.log(`[LOG] ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`),
        warn: (msg) => console.warn(`[WARN] ${msg}`),
        debug: (msg) => console.debug(`[DEBUG] ${msg}`),
      }
    });
    
    console.log('CLI completed successfully');
  } catch (error) {
    console.error('Error running CLI:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Execute
main();