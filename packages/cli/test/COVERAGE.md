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
- `pnpm test:all:cov` - Run all tests with coverage and serve the combined reports
- `pnpm test:ui` - Launch Vitest UI for interactive test exploration
- `pnpm test:ui:cov` - Launch Vitest UI with coverage enabled

## Vitest UI

Vitest UI provides an interactive way to explore tests and view coverage:

1. Run `pnpm test:ui` to start the Vitest UI server
2. Open your browser to [http://localhost:51204/__vitest__](http://localhost:51204/__vitest__)
3. Navigate the test tree, run specific tests, and view coverage directly in the UI

For coverage-enabled UI:
1. Run `pnpm test:ui:cov` to start the Vitest UI server with coverage
2. Open your browser to the URL shown in the terminal
3. Click the "Coverage" button to view coverage data

## Combined Coverage Dashboard

While we maintain separate coverage metrics, we also provide a combined view for convenience:

1. Run `pnpm test:all:cov` to run all tests and generate coverage reports
2. A local server will start automatically, serving the combined reports
3. Open your browser to the URL shown in the terminal (typically http://localhost:3000)
4. Navigate to the "Combined Coverage Dashboard" to see metrics from all test types

The combined dashboard shows:
- Unit test coverage metrics (lines, functions, branches)
- Integration test coverage metrics
- E2E test pass rate and coverage estimates

## Coverage Targets by Test Type

We aim for the following coverage targets:

- **Unit Tests**: 80%+ coverage
- **Integration Tests**: 70%+ coverage
- **E2E Tests**: 50%+ coverage of critical paths

## Interpreting Results

When reviewing coverage:

1. **Unit Tests**: Look for high coverage of individual functions and components
2. **Integration Tests**: Focus on coverage of interactions between components
3. **E2E Tests**: Ensure critical user flows are covered

## Future Improvements

- Implement coverage thresholds in CI/CD
- Add coverage badges to documentation
- Integrate Playwright code coverage with Vitest UI 