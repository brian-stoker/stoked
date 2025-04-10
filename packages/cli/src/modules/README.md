# Stoked CLI Modules

This directory contains the various modules that make up the Stoked CLI. Each module provides specific functionality and can be used independently or in combination with other modules.

## Core Modules

- **Config**: Configuration management for the CLI
- **LLM**: Language model integration (OpenAI, Ollama)
- **Logger**: Logging utilities with themed output
- **Repo**: Repository management (cloning, updating)

## AI-Powered Modules

### Documentation

The [`docs`](./docs/README.md) module provides automated code documentation capabilities. It uses LLMs to generate comprehensive documentation for your code, with a current focus on JavaScript/TypeScript JSDoc comments.

```bash
stoked docs owner/repo
```

### Testing

The CLI provides two complementary testing modules:

1. [`test`](./test/README.md): High-level test management and analysis
   - Analyzes repository structure
   - Detects frameworks and test patterns
   - Provides testing strategies
   
   ```bash
   stoked test owner/repo
   ```

2. [`utest`](./utest/README.md): Specialized unit test generation
   - Focused on React component testing
   - Generates comprehensive test cases
   - Supports multiple testing frameworks
   
   ```bash
   stoked utest owner/repo
   ```

### Agent

The [`agent`](./agent/README.md) module provides AI agent capabilities that can perform more complex tasks by chaining together multiple operations and reasoning about code.

```bash
stoked agent <task-description>
```

## Module Architecture

Modules follow these design principles:

1. **Modular**: Each module has a specific focus and can be used independently
2. **Composable**: Modules can work together to provide more complex functionality
3. **Configurable**: Modules can be configured via environment variables or CLI options
4. **Extensible**: New modules can be added easily

## Module Structure

Each module typically includes:

- **Command**: Implements the CLI command
- **Services**: Business logic for the module
- **Types**: TypeScript type definitions
- **Utilities**: Helper functions
- **README**: Documentation for the module 