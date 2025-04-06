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
    
    // Run the CLI with the provided arguments
    await CommandFactory.run(CliModule, {
      cliName: 'stoked',
      usePlugins: true,
      enablePositionalOptions: true,
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