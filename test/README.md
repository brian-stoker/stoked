# Stoked Test Suite

This directory contains tests for the Stoked CLI application. The test suite is divided into several categories:

## Unit Tests

Unit tests are located in the `test/unit` directory and are organized to mirror the structure of the main application:

```
test/unit/
  ├── modules/
  │   ├── llm/           # Tests for LLM service
  │   ├── jsdocs/        # Tests for JSDoc commands
  │   └── test/          # Tests for Test commands
  └── utils/             # Tests for utility functions
```

Unit tests use Jest as the test runner and mock external dependencies to isolate the unit being tested.

## End-to-End (E2E) Tests

E2E tests are located in the `test/e2e` directory and test the CLI application as a whole:

```
test/e2e/
  ├── cli.spec.ts        # Tests for general CLI functionality
  └── jsdocs.spec.ts     # Tests for the JSDoc command
```

E2E tests use Playwright to run the CLI application and verify its behavior.

## Running Tests

You can run the tests using the following commands:

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run unit tests in watch mode
pnpm test:watch

# Run unit tests with coverage
pnpm test:cov

# Run unit tests with debugger attached
pnpm test:debug
```

### E2E Tests

```bash
# Run all E2E tests with Jest
pnpm test:e2e

# Run all Playwright E2E tests
pnpm test:pw

# Run only CLI Playwright tests
pnpm test:pw:cli

# Run only JSDoc Playwright tests
pnpm test:pw:jsdocs

# Run specific Playwright test by name
npx playwright test -g "test name"

# Run Playwright tests in debug mode
pnpm test:pw:debug
```

## Test Utilities

The `test/utils` directory contains utilities for testing:

- `cli-runner.ts` - Utility for running CLI commands in tests
- `mock-llm.ts` - Utility for mocking LLM service responses

## Environment Variables

The tests use environment variables to control behavior:

- `STOKED_WORKSPACE_ROOT` - Sets the root directory for workspaces and repositories
  - Our tests use a temporary directory for this to avoid permission issues
  - Default: `~/.stoked/.repos`

- `LLM_MODE` - Controls which LLM service to use (OLLAMA or OPENAI)
  - Default: `OLLAMA`

- `OLLAMA_MODEL` - Specifies which Ollama model to use
  - Default: `llama3.2:latest`

- `OLLAMA_HOST` - Specifies the Ollama server URL
  - Default: `http://localhost:11434`

## Guidelines for Writing Tests

When writing tests, please follow these guidelines:

1. **Test Organization**: Keep tests organized by module and command.
2. **Mocking External Services**: Use mocks for external services like Ollama and OpenAI.
3. **Test Isolation**: Each test should be isolated and not depend on the state from other tests.
4. **Use Temporary Directories**: Always use temporary directories for test data to avoid permission issues.
5. **Meaningful Assertions**: Make assertions that test the actual behavior, not just implementation details.
6. **Test Coverage**: Aim for high test coverage, especially for critical paths.
7. **Clear Test Names**: Use descriptive test names that explain what is being tested.

## Local Setup for E2E Tests

For E2E tests that require Ollama:

1. Install Ollama locally: `https://ollama.com/`
2. Pull the necessary models: `ollama pull llama3.2`
3. Start the Ollama server: `ollama serve`

For tests that require a GitHub API key, set the environment variable:

```bash
export GITHUB_TOKEN=your-token
``` 