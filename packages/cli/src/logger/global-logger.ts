import { THEME_MAP, ThemeLogger } from './theme.logger.js';
import type { WriteStream } from 'node:tty';

// Create a global logger instance
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

// Override console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

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

export { logger };
