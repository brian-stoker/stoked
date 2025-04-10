# Unit Test (utest) Module

## Overview

The Unit Test (utest) module provides specialized unit test generation capabilities focused on React components. It is designed to:

- Identify React components in a repository
- Generate comprehensive unit tests using LLMs
- Support multiple testing frameworks (React Testing Library, Jest, Enzyme)
- Create properly structured test files alongside components

## Relationship with Other Modules

This module functions as a specialized test generator:

- **Focused Scope**: Specifically targets React component unit testing
- **LLM Integration**: Uses AI to generate sophisticated test cases
- **Complementary**: Works alongside the main `test` module, which can invoke this module for unit test generation

## Usage

```bash
stoked utest owner/repo
```

### Options

- `-i, --include [packages]`: Generate tests only for specific packages (comma-separated)
- `-f, --framework [framework]`: Specify the testing framework to use (react-testing-library, jest, enzyme)
- `-t, --test`: Enable test mode (processes only a few files to verify functionality)
- `-d, --debug`: Enable debug mode with verbose logging

## Features

- **Framework Detection**: Automatically detects React components
- **Test Case Generation**: Creates comprehensive test cases for component functionality
- **Prop Testing**: Tests all component props including edge cases
- **Event Testing**: Tests event handlers and user interactions
- **Conditional Rendering**: Tests different rendering paths

## Configuration

The module can be configured through environment variables in the `.env` file:

```
# UTEST CONFIGURATION
UTEST_FRAMEWORK=react-testing-library  # Default testing framework
UTEST_TEST_MODE=false                  # Test mode for development
```

## Generated Tests

The generated tests follow best practices:

- Tests are placed alongside the component file with a `.test.tsx` extension
- Tests follow the Arrange-Act-Assert pattern
- Each test case has a clear purpose
- External dependencies are properly mocked
- Complete with imports and proper TypeScript types 