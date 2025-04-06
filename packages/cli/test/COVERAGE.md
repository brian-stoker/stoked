# Test Coverage in Stoked

This project uses a multi-faceted approach to track test coverage across different test types.

## Coverage Tools

- **Unit and Integration Tests**: Use Vitest with V8 coverage
- **E2E Tests**: Use Playwright with HTML reporting
- **Combined Reports**: We collect all reports in a single directory for easier access

## Coverage Commands

The following commands are available:

- `pnpm test:unit:cov` - Run unit tests and generate coverage (in `coverage/` directory)
- `pnpm test:integration:cov` - Run integration tests and generate coverage (in `coverage/` directory)
- `pnpm test:e2e:cov` - Run e2e tests and generate coverage (in `playwright-report/` directory)
- `pnpm test:cov` - Run all tests and generate separate coverage reports
- `pnpm test:cov:combined` - Run all tests and copy reports to the `reports/` directory
- `pnpm test:cov:view` - Run all tests, combine reports, and start a web server to view them

## How It Works

1. **Unit and Integration Tests**: Vitest runs with V8 coverage enabled and generates HTML reports in the `coverage/` directory.

2. **E2E Tests**: Playwright generates HTML reports in the `playwright-report/` directory.

3. **Combined Reports**: The `test:cov:combined` command copies all reports to the `reports/` directory, organizing them by test type:
   - `reports/unit-coverage/` - Coverage reports from unit tests
   - `reports/e2e-coverage/` - Coverage reports from E2E tests

## Viewing the Coverage Reports

You can view the coverage reports in several ways:

1. **Individual Reports**:
   - Unit/Integration tests: Open `coverage/index.html` in your browser
   - E2E tests: Open `playwright-report/index.html` in your browser

2. **Combined Reports**: 
   - Run `pnpm test:cov:combined` to gather all reports in the `reports/` directory
   - Run `pnpm test:cov:view` to start a web server that lets you browse all reports

## How Coverage Is Calculated

Coverage is calculated by tracking which lines of code are executed during tests:

- **Statement Coverage**: Percentage of statements executed
- **Branch Coverage**: Percentage of possible branches executed (e.g., both true/false in if statements)
- **Function Coverage**: Percentage of functions called
- **Line Coverage**: Percentage of lines executed

## Interpreting Coverage Results

While high coverage is generally good, it's important to understand that:

1. 100% coverage doesn't guarantee bug-free code - it just means all code was executed during tests
2. Quality of assertions matters more than coverage percentage
3. Some code (like error handling) might be difficult to cover completely

Focus on writing meaningful tests rather than just increasing coverage numbers.

## Future Improvements

In the future, we may consider implementing:

1. Coverage thresholds for CI/CD pipelines
2. More advanced report merging using tools like nyc or c8
3. Code coverage visualization in GitHub PRs 