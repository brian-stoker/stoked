import { THEME_MAP, ThemeLogger } from './theme.logger.js';
import type { WriteStream } from 'node:tty';

// Create a singleton instance
const logger = new ThemeLogger();
logger.setTheme(THEME_MAP['Solar Eclipse']);

// Store original write functions
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

// Track if we're currently writing to avoid recursion
let isWriting = false;

type WriteFunction = {
  (buffer: Uint8Array | string): boolean;
  (str: string | Uint8Array, encoding: BufferEncoding): boolean;
  (
    str: string | Uint8Array,
    encoding?: BufferEncoding,
    cb?: (err?: Error) => void,
  ): boolean;
};

// Intercept stdout
process.stdout.write = function (
  str: string | Uint8Array,
  encoding?: BufferEncoding | ((err?: Error) => void),
  cb?: (err?: Error) => void,
): boolean {
  if (!isWriting) {
    isWriting = true;
    try {
      logger.debug(str.toString());
    } finally {
      isWriting = false;
    }
  }
  if (typeof encoding === 'function') {
    return originalStdoutWrite(str, encoding as (err?: Error) => void);
  }
  return originalStdoutWrite(str, encoding as BufferEncoding | undefined, cb);
} as WriteFunction;

// Intercept stderr
process.stderr.write = function (
  str: string | Uint8Array,
  encoding?: BufferEncoding | ((err?: Error) => void),
  cb?: (err?: Error) => void,
): boolean {
  if (!isWriting) {
    isWriting = true;
    try {
      logger.error(str.toString());
    } finally {
      isWriting = false;
    }
  }
  if (typeof encoding === 'function') {
    return originalStderrWrite(str, encoding as (err?: Error) => void);
  }
  return originalStderrWrite(str, encoding as BufferEncoding | undefined, cb);
} as WriteFunction;

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;

// Utility type for logger arguments
type LogArgs = [message: any, ...optionalParams: any[]];

// Wrapper functions that maintain correct typing
function log(...args: LogArgs): void {
  logger.log(args[0], ...args.slice(1));
}

function error(...args: LogArgs): void {
  logger.error(args[0], ...args.slice(1));
}

function warn(...args: LogArgs): void {
  logger.warn(args[0], ...args.slice(1));
}

function debug(...args: LogArgs): void {
  logger.debug(args[0], ...args.slice(1));
}

function verbose(...args: LogArgs): void {
  logger.verbose(args[0], ...args.slice(1));
}

function fatal(...args: LogArgs): void {
  logger.fatal(args[0], ...args.slice(1));
}

// Override console methods
console.log = function (...args: LogArgs): void {
  log(...args);
};

console.error = function (...args: LogArgs): void {
  error(...args);
};

console.warn = function (...args: LogArgs): void {
  warn(...args);
};

console.debug = function (...args: LogArgs): void {
  debug(...args);
};

// Export both the logger instance and wrapper functions
export {
  logger,
  log,
  error,
  warn,
  debug,
  verbose,
  fatal,
  // Export original console methods for restoration if needed
  originalConsoleLog,
  originalConsoleError,
  originalConsoleWarn,
  originalConsoleDebug
};
