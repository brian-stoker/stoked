# Log Module

The Log module provides a flexible and themed logging system for the application.

## Features

- Themed logging with color support
- Multiple log levels
- Custom themes
- Global logging interception
- Console method overrides

## Usage

### Basic Logging

```typescript
import { ThemeLogger, THEMES } from './theme.logger';

const logger = new ThemeLogger();

// Set a theme
logger.setTheme(THEMES['Solar Eclipse']);

// Log messages
logger.debug('Debug message');
logger.log('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

### Global Logging

```typescript
import { logger } from './global-logger';

// Use the global logger
logger.debug('Global debug message');
logger.error('Global error message');
```

### Console Overrides

The module automatically overrides console methods:

```typescript
console.log('This will use the themed logger');
console.error('This will use the themed logger');
console.warn('This will use the themed logger');
console.info('This will use the themed logger');
```

## Available Themes

The module includes several pre-defined themes:

- Solar Eclipse
- Deep Ocean
- Cyberpunk Glow
- Fire & Ember
- Alien Bioluminescence
- Ice & Glacier
- Toxic Wasteland
- Royal Kingdom

## Log Levels

Supported log levels:

- verbose: Detailed debugging information
- debug: Debugging information
- log: General information
- warn: Warning messages
- error: Error messages
- fatal: Critical errors

## Global Interception

The module can intercept:

- process.stdout
- process.stderr
- console.log
- console.error
- console.warn
- console.info

## Best Practices

1. Use appropriate log levels
2. Choose themes that match your module's purpose
3. Include meaningful context in log messages
4. Handle sensitive information appropriately
5. Use structured logging for complex data
6. Monitor log output for issues
