#!/usr/bin/env node
import { config } from 'dotenv';
import { Logger } from '@nestjs/common';
import { CliModule } from './modules/stoked/stoked.module.js';
import { CommandFactory } from 'nest-commander';
import { THEME_MAP, ThemeLogger } from './logger/theme.logger.js';

// Load environment variables from .env file
config();

// Define log level from environment or default to 'info'
const STOKED_LOG_LEVEL = process.env.STOKED_LOG_LEVEL || 'info';

// Silent error handlers for production
process.on('uncaughtException', (error) => {
  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Uncaught exception:', error);
  }
});

process.on('unhandledRejection', (reason) => {
  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Unhandled rejection:', reason);
  }
});

async function bootstrap() {
  try {
    // Create a custom logger that respects STOKED_LOG_LEVEL
    const logger = new Logger();

    // Map log levels to their numeric values for comparison
    const logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      verbose: 4,
    };
    const currentLevel =
      logLevels[STOKED_LOG_LEVEL as keyof typeof logLevels] || 0;

    // Disable logging methods based on current level
    if (currentLevel < logLevels.verbose) logger.verbose = () => {};
    if (currentLevel < logLevels.debug) logger.debug = () => {};
    if (currentLevel < logLevels.info) logger.log = () => {};
    if (currentLevel < logLevels.warn) logger.warn = () => {};
    // Run the CLI
    // @ts-ignore
    await CommandFactory.run(CliModule, {
      cliName: 'stoked',
      usePlugins: true,
      enablePositionalOptions: true,
      logger: STOKED_LOG_LEVEL === 'debug' ? new ThemeLogger(THEME_MAP['Deep Ocean']) : false,
      errorHandler: (err: any) => {
        // Silently handle help display
        if (err?.code === 'commander.help' || err?.exitCode === 0) {
          return 0;
        }
        console.log(err);

        // Only show actual errors
        if (err instanceof Error && err.message) {
          console.error(err.message);
          console.error(err.stack);
        }

        return 1;
      },
    });
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message);
      console.error(e.stack);
    }
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  if (err instanceof Error) {
    console.error(err.message);
    console.error(err.stack);
  }
  console.error(err);

  process.exit(1);
});
