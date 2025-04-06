# Test Coverage in Stoked

This project uses a structured approach to track test coverage across different test types based on the best practices outlined in [test_coverage_best_practices.md](./test_coverage_best_practices.md).

## Coverage Structure

We maintain separate coverage reports for each test type:

- **Unit Tests**: Coverage in `coverage/unit/`
- **Integration Tests**: Coverage in `coverage/integration/`
- **E2E Tests**: Reports in `playwright-report/`

This separation allows us to:
- Track coverage by test type
- Identify areas where we might be relying too heavily on one test type
- Ensure proper test pyramid implementation
- Target specific test types for improvement

## Coverage Commands

The following commands are available:

- `pnpm test:unit:cov` - Run unit tests and generate coverage in `coverage/unit/`
- `pnpm test:integration:cov` - Run integration tests and generate coverage in `coverage/integration/`
- `pnpm test:e2e:cov` - Run e2e tests and generate reports in `playwright-report/`
- `pnpm test:cov` - Run all test coverage commands and provide paths to reports
- `pnpm test:cov:combined` - Run all tests and copy reports to a unified `reports/` directory
- `pnpm test:cov:view` - Run combined coverage and start a server to view all reports

## Combined View

While we maintain separate coverage metrics, we also provide a combined view for convenience:

1. The `reports/` directory contains:
   - `unit-coverage/` - Coverage from unit tests
   - `integration-coverage/` - Coverage from integration tests
   - `e2e-coverage/` - Results from E2E tests

2. Running `pnpm test:cov:view` will:
   - Generate all coverage reports
   - Copy them to the appropriate directories
   - Start a web server with a navigation page

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