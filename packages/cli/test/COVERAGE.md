# Test Coverage in Stoked

This project uses a structured approach to track test coverage across different test types based on the best practices outlined in [test_coverage_best_practices.md](./test_coverage_best_practices.md).

## Coverage Structure

We maintain separate coverage reports for each test type:

- **Unit Tests**: Coverage in `test/coverage/unit/`
- **Integration Tests**: Coverage in `test/coverage/integration/`
- **E2E Tests**: Reports in `test/playwright-report/`

This separation allows us to:
- Track coverage by test type
- Identify areas where we might be relying too heavily on one test type
- Ensure proper test pyramid implementation
- Target specific test types for improvement

## Coverage Commands

The following commands are available:

- `pnpm test:unit:cov` - Run unit tests and generate coverage in `test/coverage/unit/`
- `pnpm test:integration:cov` - Run integration tests and generate coverage in `test/coverage/integration/`
- `pnpm test:e2e:cov` - Run e2e tests and generate reports in `test/playwright-report/`
- `pnpm test:cov:gen` - Run all test coverage commands and provide paths to reports
- `pnpm test:cov:combined` - Run all tests and copy reports to a unified `test/reports/` directory
- `pnpm test:cov` - Run combined coverage and start a server to view all reports
- `pnpm test:ui` - Launch Vitest UI for interactive test exploration and coverage visualization

## Vitest UI

Vitest UI provides an interactive way to explore tests and view coverage:

1. Run `pnpm test:ui` to start the Vitest UI server
2. Open your browser to [http://localhost:51204/__vitest__](http://localhost:51204/__vitest__)
3. Navigate the test tree, run specific tests, and view coverage directly in the UI

## Combined View

While we maintain separate coverage metrics, we also provide a combined view for convenience:

1. The `test/reports/` directory contains:
   - `unit-coverage/` - Coverage from unit tests
   - `integration-coverage/` - Coverage from integration tests
   - `e2e-coverage/` - Results from E2E tests
   - Machine-readable results in JSON format for CI/CD integration

2. Running `pnpm test:cov` will:
   - Generate all coverage reports
   - Copy them to the appropriate directories
   - Start a web server with a navigation page

## Test Directory Structure

All test-related files are organized within the `test/` directory:

```
test/
├── coverage/          # Coverage reports
│   ├── unit/          # Unit test coverage
│   └── integration/   # Integration test coverage
├── e2e/               # End-to-end test files
├── integration/       # Integration test files
├── playwright-report/ # Playwright HTML reports
├── reports/           # Combined reports and navigation UI
├── test-results/      # Playwright test artifacts
└── unit/              # Unit test files
```

## Coverage Targets

We aim for the following coverage targets by test type:

| Test Type | Coverage Target | Notes |
|-----------|-----------------|-------|
| Unit      | 80%+            | Primary source of code coverage |
| Integration | 40-60%        | Focuses on component interactions |
| E2E       | Key workflows   | Not measured by % but by critical path coverage |

## Interpreting Results

When reviewing coverage:

1. **Look for holes in unit test coverage first** - These are the easiest to fix and provide the most reliable testing
2. **Check if integration tests are filling unit test gaps** - This might indicate areas where unit testing is difficult
3. **Ensure critical paths have E2E coverage** - Even with 100% unit and integration coverage, E2E tests provide value

## Future Improvements

We plan to further enhance our coverage reporting by:

1. Implementing coverage thresholds in CI/CD
2. Adding coverage badges to our documentation
3. Building visualization tools to highlight coverage by test type
4. Incorporating code quality metrics alongside coverage 