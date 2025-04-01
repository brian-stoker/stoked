#!/usr/bin/env node

/**
 * Minimal debug helper for CLI - ESM version
 * This file uses .mjs extension to ensure it's always treated as ESM
 * This version doesn't override any console methods for pure output
 */

// Enable source maps for debugging
import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

// Get CLI arguments 
const args = process.argv.slice(2);
console.log('Debug helper running with args:', args);

// Set up basic error handlers
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Make the debug file executable
process.chmod?.(__filename, 0o755);

// Run the CLI
(async () => {
  try {
    // Import modules
    const cliModule = await import('../dist/cli.module.js');
    const { CommandFactory } = await import('nest-commander');
    
    console.log('Starting CLI with arguments:', args);
    
    // Run the CLI with the arguments
    await CommandFactory.run(cliModule.CliModule, {
      cliName: 'stoked',
      usePlugins: true,
      enablePositionalOptions: true,
      // Always add your arguments directly to the command line
      argv: ['node', 'stoked', ...args]
    });
  } catch (error) {
    console.error('Error running CLI:', error);
    process.exit(1);
  }
})(); 