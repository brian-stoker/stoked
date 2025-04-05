#!/usr/bin/env node

/**
 * Debug helper for JSDoc processing with detailed timing information
 * This file uses .mjs extension to ensure it's always treated as ESM
 */

// Enable source maps for debugging
import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

// Import the logger from dist (compiled) directory instead of src
import { ThemeLogger, THEMES } from '../dist/logger/theme.logger.js';
import fs from 'fs';
import path from 'path';

// Create a global logger instance
const logger = new ThemeLogger();
logger.setTheme(THEMES['Solar Eclipse']);

// Get CLI arguments
const args = process.argv.slice(2);
logger.log('JSDoc Debug helper running with args:', args);

// Add a package filter if specified in the args
let packageFilter;
const includeIndex = args.indexOf('--include');
if (includeIndex !== -1 && args.length > includeIndex + 1) {
  packageFilter = args[includeIndex + 1];
  logger.log(`Filtering for package: ${packageFilter}`);
}

// Setup debug directory
const workspaceDir = process.env.WORKSPACE_DIR || './.workspace';
const debugDir = path.join(workspaceDir, 'debug');

// Ensure debug directory exists
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true });
}

// Create timing log file
const timestamp = new Date().toISOString().replace(/:/g, '-');
const timingLogFile = path.join(debugDir, `timing-${timestamp}.json`);
const detailedLogFile = path.join(debugDir, `detailed-timing-${timestamp}.log`);

// Initialize timing data structure
const timingData = {
  startTime: Date.now(),
  endTime: null,
  totalRuntime: null,
  fileTimings: {},
  llmServiceTimings: [],
  summary: {
    totalFiles: 0,
    processedFiles: 0,
    failedFiles: 0,
    totalLlmTime: 0,
    totalProcessingTime: 0,
    averageFileTime: 0,
    averageLlmTime: 0
  }
};

// Function to log timing data
function logTimingData() {
  timingData.endTime = Date.now();
  timingData.totalRuntime = timingData.endTime - timingData.startTime;
  
  // Calculate summary statistics
  const processedFiles = Object.keys(timingData.fileTimings).length;
  timingData.summary.totalFiles = processedFiles;
  timingData.summary.processedFiles = processedFiles;
  
  let totalProcessingTime = 0;
  let totalLlmTime = 0;
  
  Object.values(timingData.fileTimings).forEach(timing => {
    totalProcessingTime += timing.totalTime || 0;
    totalLlmTime += timing.llmServiceTime || 0;
  });
  
  timingData.summary.totalProcessingTime = totalProcessingTime;
  timingData.summary.totalLlmTime = totalLlmTime;
  timingData.summary.averageFileTime = processedFiles > 0 ? totalProcessingTime / processedFiles : 0;
  timingData.summary.averageLlmTime = processedFiles > 0 ? totalLlmTime / processedFiles : 0;
  
  // Write to log files
  fs.writeFileSync(timingLogFile, JSON.stringify(timingData, null, 2));
  
  // Create detailed log
  let detailedLog = `JSDoc Timing Report (${new Date().toISOString()})\n`;
  detailedLog += `===========================================================\n\n`;
  detailedLog += `Total runtime: ${(timingData.totalRuntime / 1000).toFixed(2)}s\n`;
  detailedLog += `Files processed: ${processedFiles}\n`;
  detailedLog += `Total processing time: ${(totalProcessingTime / 1000).toFixed(2)}s\n`;
  detailedLog += `Total LLM service time: ${(totalLlmTime / 1000).toFixed(2)}s (${(totalLlmTime / totalProcessingTime * 100).toFixed(1)}%)\n\n`;
  
  // List files by processing time
  const sortedFiles = Object.entries(timingData.fileTimings)
    .sort(([, a], [, b]) => (b.totalTime || 0) - (a.totalTime || 0));
  
  detailedLog += `Top 10 slowest files:\n`;
  sortedFiles.slice(0, 10).forEach(([file, timing], index) => {
    detailedLog += `${index + 1}. ${file}: ${(timing.totalTime / 1000).toFixed(2)}s total, `;
    detailedLog += `LLM: ${(timing.llmServiceTime / 1000).toFixed(2)}s (${(timing.llmServiceTime / timing.totalTime * 100).toFixed(1)}%)\n`;
  });
  
  fs.writeFileSync(detailedLogFile, detailedLog);
  
  logger.log(`Timing data written to ${timingLogFile}`);
  logger.log(`Detailed timing log written to ${detailedLogFile}`);
}

// Preserve original console methods before overriding
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

// Override console methods to use our logger
console.log = function (...args) {
  if (args[0] && typeof args[0] === 'string') {
    // Capture JSDoc processing progress information
    const match = args[0].match(/Processing\s+(.+)\s+-\s+(.+)/);
    if (match) {
      const file = match[2];
      if (!timingData.fileTimings[file]) {
        timingData.fileTimings[file] = {
          startTime: Date.now(),
          endTime: null,
          totalTime: null,
          llmServiceTime: 0,
          fileCheckTime: 0,
          extractionTime: 0,
          fileWriteTime: 0
        };
      }
    }
    
    // Capture file timing details if this is a debug message
    const timingMatch = args[0].match(/Detailed timings for (.+):/);
    if (timingMatch) {
      const file = timingMatch[1];
      // Next few logs will have the timing details
      if (timingData.fileTimings[file]) {
        timingData.fileTimings[file].endTime = Date.now();
        timingData.fileTimings[file].totalTime = timingData.fileTimings[file].endTime - timingData.fileTimings[file].startTime;
      }
    }
    
    // Capture LLM timing
    const llmMatch = args[0].match(/LLM service call complete after (.+)s/);
    if (llmMatch) {
      const llmTime = parseFloat(llmMatch[1]) * 1000; // Convert to ms
      timingData.llmServiceTimings.push({
        timestamp: Date.now(),
        duration: llmTime
      });
      
      // Find the current file being processed
      const currentFiles = Object.keys(timingData.fileTimings).filter(file => 
        timingData.fileTimings[file].endTime === null
      );
      
      if (currentFiles.length === 1) {
        timingData.fileTimings[currentFiles[0]].llmServiceTime = llmTime;
      }
    }
  }
  
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

// Handle exit and cleanup
process.on('exit', () => {
  logTimingData();
});

// Handle termination signals
process.on('SIGINT', () => {
  logger.log('Process interrupted, saving timing data...');
  logTimingData();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.log('Process terminated, saving timing data...');
  logTimingData();
  process.exit(0);
});

// Run the CLI
(async () => {
  try {
    // Import modules
    const cliModule = await import('../dist/cli.module.js');
    const { CommandFactory } = await import('nest-commander');

    logger.log('Starting JSDoc processor with arguments:', args);
    logger.log(`LLM Timeout: ${process.env.LLM_TIMEOUT || 'default'} ms`);

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
    // Save timing data even when error occurs
    logTimingData();
    process.exit(1);
  }
})(); 