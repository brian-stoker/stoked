# Config Module

The Config module provides a centralized configuration service for managing application settings and environment variables.

## Features

- Environment variable management
- Type-safe configuration access
- Default value handling
- Configuration validation

## Usage

### Basic Configuration Access

```typescript
import { ConfigService } from './config.service';

const configService = new ConfigService();

// Get a configuration value
const value = configService.get('KEY');
```

### Type-Safe Configuration

```typescript
// Get a string value
const stringValue = configService.getString('STRING_KEY');

// Get a number value
const numberValue = configService.getNumber('NUMBER_KEY');

// Get a boolean value
const booleanValue = configService.getBoolean('BOOLEAN_KEY');
```

### Default Values

```typescript
// Get a value with a default
const value = configService.get('KEY', 'default-value');
```

## Environment Variables

The module supports the following environment variables:

- `NODE_ENV`: The current environment (development, production, test)
- `PORT`: The port the application runs on
- `HOST`: The host the application runs on
- `API_PREFIX`: The prefix for all API routes
- `VERSION`: The application version
- `DESCRIPTION`: The application description
- `AUTHOR`: The application author
- `LICENSE`: The application license

## Configuration Validation

The module validates configuration values to ensure they are of the correct type and format. Invalid configurations will throw appropriate errors.

## Logging

Configuration operations are logged using the 'Forest Green' theme for consistent visibility.

## Best Practices

1. Always use the type-safe methods when possible
2. Provide default values for optional configurations
3. Use environment variables for sensitive data
4. Validate configurations early in the application lifecycle

## Commands

### Repository Management

The following commands are available for managing Git repository priorities:

- `stoked config repo` - Lists all repositories by priority
- `stoked config repo -p high` - Shows only high priority repositories
- `stoked config repo --top` - Shows only the single highest priority repository
- `stoked config repo owner/name` - Shows priority for a specific repository
- `stoked config repo owner/name -p high` - Sets high priority for a repository
- `stoked config repo remove owner/name` - Removes a repository from config

### Other Configuration

The Config module also provides commands for managing other configuration settings:

- `stoked config set <key> <value>` - Set a configuration value
- `stoked config get <key>` - Get a configuration value
- `stoked config list` - List all configuration values
- `stoked config reset` - Reset all configuration to defaults

## Implementation Details

The Config module stores configuration data in a YAML file located in the user's home directory. This includes:

- Git repository priorities
- API keys and tokens
- User preferences

The configuration is loaded when the application starts and is updated as commands are executed that modify settings.
