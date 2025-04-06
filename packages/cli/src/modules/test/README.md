# Stoked Test Module

The Stoked Test module provides intelligent test generation capabilities for any repository using AI. This module analyzes existing codebases, detects test patterns and gaps, and automatically generates appropriate tests to improve coverage and reliability.

## Command Usage

```bash
stoked test {owner}/{repo} --include [packages] [options]
```

## Architecture

The test module has been designed with a modular, extensible architecture that builds on the foundation established by the JSDoc module.

### Directory Structure

```
src/modules/common/
  ├── repo-manager.service.ts      // Clone, analyze repos
  ├── code-analyzer.service.ts     // Analyze code structure & types
  ├── test-detection.service.ts    // Detect existing test frameworks
  ├── coverage-analyzer.service.ts // Analyze test coverage reports
  ├── llm-prompt-builder.service.ts // Shared prompt building logic
  └── batch-processing/            // Common batch processing logic

src/modules/test/
  ├── test.command.ts             // Main command entry point
  ├── test-analysis.command.ts    // Analyze existing tests
  ├── test-generation.command.ts  // Generate tests
  ├── types/                      // Type definitions
  |   ├── test-config.ts          // Test configuration types
  |   ├── test-coverage.ts        // Coverage report types
  |   └── test-framework.ts       // Framework detection types
  ├── frameworks/                 // Framework-specific handlers
  |   ├── jest.service.ts
  |   ├── cypress.service.ts
  |   ├── playwright.service.ts
  |   └── etc...
  └── strategies/                 // Test strategies by type
      ├── unit-test.strategy.ts
      ├── integration.strategy.ts
      ├── e2e.strategy.ts
      └── a11y.strategy.ts        // Accessibility testing
```

## Implementation Plan

The test module will be implemented in phases to ensure a focused, iterative approach.

### Phase 1: Analysis & Framework Detection

- Command structure & repo cloning (reuse from jsdocs)
- Test framework detection
  - Identify Jest, Mocha, Jasmine, Vitest, etc. for unit testing
  - Identify Cypress, Playwright, Selenium, etc. for E2E testing
- Coverage analysis
  - Parse coverage reports (lcov, istanbul, etc.)
  - Identify uncovered files and functions
- Baseline establishment
  - Set targets based on repo type (frontend, backend, library)
  - Generate report on current coverage vs. targets

### Phase 2: Ollama Test Generation

- Unit test generation with Ollama
  - Function-level test generation
  - Component-level test generation
- Simple flows first
  - Pure functions
  - Individual React/Vue components
- Framework-specific templates
  - Jest expect() assertions
  - React Testing Library patterns
  - Etc.

### Phase 3: Integration & E2E Tests

- Complex flow analysis
  - Identify API endpoints and their relationships
  - Map UI components to data flows
- Integration test generation
  - API endpoint testing
  - Service integration testing
- E2E test scaffolding
  - Page object models
  - Common user flows (login, register, etc.)
  - Accessibility testing

### Phase 4: OpenAI & Batch Processing

- Port to OpenAI API
  - Optimize prompts for test quality
  - Handle more complex scenarios
- Implement batching (reuse from jsdocs)
  - Process files in batches
  - Use same filePathIndices mapping system
- Performance optimizations
  - Parallelize test generation
  - Minimize token usage

## Key Features

### Repository Analysis

- Detect repository type (monorepo, single package)
- Identify technology stack (React, Vue, Node, etc.)
- Map code structure and dependencies

### Test Framework Detection

- Automatically detect existing test frameworks
- Analyze configuration files (jest.config.js, cypress.config.js, etc.)
- Determine test patterns in use

### Coverage Analysis

- Parse existing coverage reports
- Generate coverage baselines by file type
- Identify critical paths with inadequate coverage

### Test Generation Strategies

- **Unit Tests**: Function/component level tests
- **Integration Tests**: Service/API level tests
- **E2E Tests**: User flow tests
- **Accessibility Tests**: A11Y compliance tests

### LLM Integration

- Support for both Ollama (local) and OpenAI (cloud) backends
- Batch processing for efficient test generation
- Context-aware prompts based on code analysis

## Shared Components with JSDoc Module

The test module reuses several components from the JSDoc module to maintain consistency and avoid duplication:

- **Repository Management**: Cloning, file traversal, git operations
- **Batch Processing**: File handling, response mapping, error handling
- **LLM Service**: Abstract communication layer for different LLM providers
- **Command Structure**: CLI interface patterns and option handling

## Configuration Options

The test command supports various configuration options:

```bash
# Basic command
stoked test facebook/react --include packages/react-dom

# Specify test types
stoked test facebook/react --types unit,integration

# Set coverage targets
stoked test facebook/react --coverage-target 80

# Use local LLM
stoked test facebook/react --llm ollama

# Batch processing with OpenAI
stoked test facebook/react --llm openai --batch
```

## Testing Best Practices by Package Type

The module identifies the package type and follows these best practices for each:

### 1. Frontend (Web)

**Goal**: Ensure UI logic, interactivity, rendering, and integration with APIs behave correctly.

#### ✅ Types of Tests
- **Unit Tests**: For utility functions, hooks, component logic.
- **Component Tests**: Isolated rendering of components.
- **Integration Tests**: Interaction between components, or components + store/api.
- **E2E Tests**: Full workflows in the browser.

#### 🎯 Target Coverage
- 70–80% for UI-heavy apps.
- Focus on critical flows (auth, payment, onboarding).

#### 🧪 Tools
- **Unit/Integration**: Jest + React Testing Library
- **E2E**: Playwright or Cypress
- **CI**: GitHub Actions or CircleCI

#### 🧠 Best Practices
- Add tests alongside bug fixes or feature work.
- Use data-testid for stable selectors.
- Write tests for common user flows first.

### 2. Frontend (Mobile)

**Goal**: Validate rendering, logic, navigation, and platform-specific behavior.

#### ✅ Types of Tests
- **Unit Tests**: Business logic, utilities, Redux, etc.
- **Component Tests**: Visual correctness using snapshot or render tests.
- **Integration Tests**: Navigation, Redux/store interactions.
- **E2E Tests**: App behavior on device or simulator.

#### 🎯 Target Coverage
- 60–80%, depending on complexity and platforms.

#### 🧪 Tools
- **React Native**: Jest, React Native Testing Library
- **Flutter**: flutter_test, integration_test
- **E2E**: Detox (React Native), Appium

#### 🧠 Best Practices
- Avoid brittle snapshot tests—prefer assertion-based ones.
- Automate E2E flows for login, navigation, and key actions.

### 3. Frontend Lib (React Component Lib)

**Goal**: Guarantee components are isolated, accessible, and consistent across themes/states.

#### ✅ Types of Tests
- **Unit Tests**: Logic inside components or hooks.
- **Render Tests**: Visual rendering with different props/states.
- **Accessibility Tests**: aXe automated checks.

#### 🎯 Target Coverage
- 90%+ is ideal, since components are mostly isolated.

#### 🧪 Tools
- Jest + React Testing Library
- Storybook + Storyshots
- aXe-core or jest-axe

#### 🧠 Best Practices
- Snapshot + RTL render tests for visual assurance.
- Use stories as the source of truth and test them.
- Provide reusable test utilities (mock providers, etc.).

### 4. Backend API

**Goal**: Ensure endpoints, logic, auth, and data manipulation work as expected.

#### ✅ Types of Tests
- **Unit Tests**: Pure functions, services, helpers.
- **Integration Tests**: DB access, services, endpoint-to-db interactions.
- **E2E/API Tests**: REST/GraphQL contract testing.

#### 🎯 Target Coverage
- 70–85% for most services.
- Aim for high logic coverage, not just line coverage.

#### 🧪 Tools
- Jest or Vitest (Node)
- Supertest, MSW (mock fetch)
- Pact (contract testing)

#### 🧠 Best Practices
- Mock external services with MSW or similar.
- Run integration tests with a test DB container.
- Use factories or builders to create test data.

### 5. Backend Lib (NestJS)

**Goal**: Validate services, guards, interceptors, pipes, and modules.

#### ✅ Types of Tests
- **Unit Tests**: Providers, guards, services.
- **Integration Tests**: Modules working together.
- **E2E**: Testing REST endpoints or GraphQL.

#### 🎯 Target Coverage
- 80%+ is very doable.

#### 🧪 Tools
- Jest (built-in with Nest CLI)
- Supertest (for E2E)
- ts-mockito / jest-mock

#### 🧠 Best Practices
- Use Test.createTestingModule() for isolated modules.
- Use @nestjs/testing utilities for dependency injection.
- Prefer mocked services for unit tests.

### 6. General Lib (Lodash-style)

**Goal**: Ensure correctness and edge-case handling in pure functions.

#### ✅ Types of Tests
- **Unit Tests**: 100% focus here. Inputs/outputs.
- **Property-Based Tests**: Optional for deeper validation.

#### 🎯 Target Coverage
- >95% — these should be pure and deterministic.

#### 🧪 Tools
- Jest or Vitest
- fast-check (property-based testing)

#### 🧠 Best Practices
- Focus on edge cases and invalid inputs.
- Treat all exports as public contracts.

### General Methodology for Retroactive Coverage

1. Audit critical flows (auth, checkout, dashboards).
2. Add integration tests first to catch regressions.
3. Backfill unit tests on logic-heavy modules.
4. Use test coverage reports to identify gaps.
5. Establish testing as part of PR review criteria.

## Roadmap

- [ ] Initial repository analysis implementation
- [ ] Framework detection for major test libraries
- [ ] Basic unit test generation with Ollama
- [ ] Coverage analysis and reporting
- [ ] Integration test generation
- [ ] E2E test scaffolding
- [ ] Batch processing with OpenAI
- [ ] Advanced test scenarios (error cases, edge cases)
- [ ] Accessibility testing
- [ ] Performance testing templates

## Development Guidelines

When contributing to the test module, please follow these guidelines:

1. Keep framework-specific logic in dedicated service files
2. Use dependency injection for services to maintain testability
3. Follow the Strategy pattern for different test generation approaches
4. Maintain backward compatibility with existing test frameworks
5. Prioritize integration with existing test suites over replacement
6. Document prompt templates and expected outputs

## Next Steps

The immediate next steps for developing this module are:

1. **Create the RepoManagerService**:
   - Extract repository cloning code from JSDoc module
   - Add repo type detection (frontend, backend, library, etc.)
   - Implement package.json and framework config file analysis

2. **Implement TestDetectionService**:
   - Add detection for common testing frameworks
   - Parse configuration files to extract test patterns
   - Create pattern recognizers for test files/directories

3. **Create CoverageAnalyzerService**:
   - Add parsers for common coverage report formats (lcov, istanbul, etc.)
   - Implement coverage gap analysis
   - Create visualizations for coverage data

4. **Implement UnitTestGenerator**:
   - Create a basic unit test generator for Ollama
   - Focus on pure function testing first
   - Add framework-specific templates 