import {
  Injectable, ConsoleLogger, type LoggerService, type Type, Scope,
} from '@nestjs/common';
import chalk from 'chalk';
import { Command, type CommandMetadata } from 'nest-commander';

import {} from '@nestjs/common';
// Example dependency to be injected
// Define available themes with hex colors for each log level
export const THEME_MAP: Record<string, LoggerTheme> = {
  'Fire & Ember': {
    verbose: '#FFDDC1', // Pale Peach
    debug: '#FFBB88', // Soft Orange
    log: '#FF9955', // Bright Orange (mapped to 'log')
    warn: '#FF7700', // Deep Orange
    error: '#CC3300', // Fiery Red
    fatal: '#990000', // Dark Crimson
  },
  'Deep Ocean': {
    verbose: '#CCF2FF', // Pale Cyan
    debug: '#99E6FF', // Sky Blue
    log: '#66D9FF', // Bright Aqua
    warn: '#33B5E5', // Deep Teal
    error: '#0077B6', // Dark Blue
    fatal: '#00334D', // Navy Black
  },
  'Cyberpunk Glow': {
    verbose: '#B8FFD9', // Mint Glow
    debug: '#66FFCC', // Neon Teal
    log: '#00FF99', // Bright Green
    warn: '#FFCC00', // Electric Yellow
    error: '#FF0066', // Neon Red
    fatal: '#990033', // Dark Magenta
  },
  'Solar Eclipse': {
    verbose: '#EAE6CA', // Soft Beige
    debug: '#CDC5A5', // Dusty Olive
    log: '#AFA07A', // Muted Gold
    warn: '#8A6F4E', // Burnt Bronze
    error: '#653D28', // Deep Brown
    fatal: '#3D1F14', // Almost Black Brown
  },
  'Alien Bioluminescence': {
    verbose: '#DAFFE6', // Glowing Mint
    debug: '#A1FFC9', // Bright Green
    log: '#5DFFA3', // Luminous Lime
    warn: '#FFEE58', // Radioactive Yellow
    error: '#FF5733', // Toxic Red-Orange
    fatal: '#8B0000', // Dark Red Core
  },
  'Ice & Glacier': {
    verbose: '#E0F7FA', // Frost White
    debug: '#B2EBF2', // Sky Blue Ice
    log: '#80DEEA', // Shimmering Aqua
    warn: '#4DD0E1', // Deep Arctic Teal
    error: '#0097A7', // Glacial Blue
    fatal: '#004D40', // Frozen Abyss
  },
  'Toxic Wasteland': {
    verbose: '#F7FFD1', // Pale Yellow-Green
    debug: '#D0FF92', // Toxic Green
    log: '#9EE35F', // Radioactive Lime
    warn: '#F4D03F', // Neon Yellow
    error: '#DC7633', // Rust Orange
    fatal: '#8B0000', // Nuclear Red
  },
  'Royal Kingdom': {
    verbose: '#FFF5E6', // Ivory Cream
    debug: '#FFD699', // Rich Gold
    log: '#CC9933', // Burnished Bronze
    warn: '#996600', // Royal Amber
    error: '#663300', // Regal Burgundy
    fatal: '#330000', // Blackened Red
  },
};

export const THEMES = Object.values(THEME_MAP);

export const DefaultLoggerTheme: string = 'Alien Bioluminescence';
export type ThemedCommandMetadata = { theme: LoggerTheme } & CommandMetadata;

export function ThemedCommand(params: ThemedCommandMetadata): ClassDecorator {
  const { theme, ...commandParams } = params;

  return function (target: Function) {
    // Apply the original @Command decorator
    Command(commandParams)(target as Type<any>);

    // Make the class injectable
    Injectable()(target as Type<any>);

    // Modify the class prototype to inject the logger
    Object.defineProperty(target.prototype, 'logger', {
      get() {
        if (!this._logger) {
          this._logger = new ThemeLogger(theme);
        }
        return this._logger;
      },
      enumerable: false, // Hide from iteration
      configurable: false, // Prevent modifications
    });
  };
}

export type LoggerTheme = {
  verbose: `#${string}`; // Pale Peach
  debug: `#${string}`; // Soft Orange
  log: `#${string}`; // Bright Orange (mapped to 'log')
  warn: `#${string}`; // Deep Orange
  error: `#${string}`; // Fiery Red
  fatal: `#${string}`; // Dark Crimson
};

@Injectable({ scope: Scope.TRANSIENT })
export class ThemeLogger extends ConsoleLogger implements LoggerService {
  private theme: LoggerTheme;

  constructor(theme: LoggerTheme = THEME_MAP[DefaultLoggerTheme]) {
    super();
    this.theme = theme;
  }

  // Helper to apply theme color to message
  private applyThemeColor(level: string, message: any): string {
    const themeColors = this.theme;
    const colorHex =
      themeColors[level as keyof typeof themeColors] || '#FFFFFF'; // Default to white if level not found
    return chalk.hex(colorHex)(`[${level.toUpperCase()}] ${message}`);
  }

  log(message: any, context?: string): void;
  log(message: any, ...optionalParams: [...any, string?]): void;
  log(message: any, ...optionalParams: any[]) {
    const themedMessage = this.applyThemeColor('log', message);
    super.log(themedMessage, ...optionalParams);
  }

  error(message: any, stackOrContext?: string): void;
  error(message: any, stack?: string, context?: string): void;
  error(message: any, ...optionalParams: [...any, string?, string?]): void;
  error(message: any, ...optionalParams: any[]) {
    const themedMessage = this.applyThemeColor('error', message);
    super.error(themedMessage, ...optionalParams);
  }

  warn(message: any, context?: string): void;
  warn(message: any, ...optionalParams: [...any, string?]): void;
  warn(message: any, ...optionalParams: any[]) {
    const themedMessage = this.applyThemeColor('warn', message);
    super.warn(themedMessage, ...optionalParams);
  }

  debug(message: any, context?: string): void;
  debug(message: any, ...optionalParams: [...any, string?]): void;
  debug(message: any, ...optionalParams: any[]) {
    const themedMessage = this.applyThemeColor('debug', message);
    super.debug(themedMessage, ...optionalParams);
  }

  verbose(message: any, context?: string): void;
  verbose(message: any, ...optionalParams: [...any, string?]): void;
  verbose(message: any, ...optionalParams: any[]) {
    const themedMessage = this.applyThemeColor('verbose', message);
    super.verbose(themedMessage, ...optionalParams);
  }

  fatal(message: any, context?: string): void;
  fatal(message: any, ...optionalParams: [...any, string?]): void;
  fatal(message: any, ...optionalParams: any[]) {
    const themedMessage = this.applyThemeColor('fatal', message);
    // Since ConsoleLogger doesn't have fatal, we'll use error
    super.error(themedMessage, ...optionalParams);
  }

  // Optional: Method to change theme at runtime
  setTheme(theme: LoggerTheme): void {
    this.theme = theme;
  }
}
