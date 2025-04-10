# Stoked Test Suite

This directory contains tests for the Stoked CLI application. The test suite is divided into three categories:

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

Unit tests use Vitest as the test runner and mock external dependencies to isolate the unit being tested.

## Integration Tests

Integration tests are located in the `test/integration` directory and test interactions between multiple components:

```
test/integration/
  ├── jsdocs.command.spec.ts    # Tests for JSDoc command interactions with dependencies
  └── ...                       # Other integration tests
```

Integration tests also use Vitest, but with fewer mocks, allowing some components to interact with their real dependencies.

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
pnpm test:unit

# Run unit tests in watch mode
pnpm test:watch

# Run unit tests with coverage
pnpm test:unit:cov

# Run unit tests with debugger attached
pnpm test:debug
```

### Integration Tests

```bash
# Run all integration tests
pnpm test:integration

# Run integration tests with coverage
pnpm test:integration:cov
```

### E2E Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run E2E tests with coverage report
pnpm test:e2e:cov

# Run only CLI tests
pnpm test:e2e:cli

# Run only JSDoc tests
pnpm test:e2e:jsdocs

# Run E2E tests in debug mode
pnpm test:e2e:debug
```

### Combined Test Commands

```bash
# Run all tests (unit, integration, and E2E)
pnpm test:full

# Generate coverage for all test types
pnpm test:cov
```

## Test Coverage

Coverage reports are generated in:
- Unit and integration test coverage: `coverage/` directory
- E2E test coverage: `playwright-report/` directory

## Guidelines for Writing Tests

When writing tests, please follow these guidelines:

1. **Test Type Selection**:
   - **Unit Tests**: For testing individual functions or classes in isolation
   - **Integration Tests**: For testing interactions between components
   - **E2E Tests**: For testing complete user workflows

2. **Mocking Strategy**:
   - **Unit Tests**: Mock all external dependencies
   - **Integration Tests**: Mock external systems, but use real internal dependencies
   - **E2E Tests**: Minimize mocking, use the real system where possible

3. **Test Organization**: Keep tests organized by module and command.

4. **Test Isolation**: Each test should be isolated and not depend on the state from other tests.

5. **Use Temporary Directories**: Always use temporary directories for test data to avoid permission issues.

6. **Meaningful Assertions**: Make assertions that test the actual behavior, not just implementation details.

7. **Clear Test Names**: Use descriptive test names that explain what is being tested.

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

## Local Setup for E2E Tests

For E2E tests that require Ollama:

1. Install Ollama locally: `https://ollama.com/`
2. Pull the necessary models: `ollama pull llama3.2`
3. Start the Ollama server: `ollama serve`

For tests that require a GitHub API key, set the environment variable:

```bash
export GITHUB_TOKEN=your-token
``` 