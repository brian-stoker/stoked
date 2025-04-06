
# Test Coverage by Type: Best Practices

## ✅ Is it common to separate coverage by test type?

**Short answer:**  
- **Not commonly done by default**, especially in smaller or mid-size projects.  
- **Large-scale apps and orgs do separate it**, especially where test types are clearly separated in structure (monorepos, layered apps, microservices).

---

## ✅ Is it a best practice?

**Yes — when practical.**  
It helps **triage gaps**, **improve test quality**, and **align coverage with testing goals**.

| Test Type       | Why Separate Coverage Matters                                                                 |
|------------------|-----------------------------------------------------------------------------------------------|
| **Unit Tests**     | Should cover the majority of logic quickly. Helps ensure isolated correctness.              |
| **Integration Tests** | Should validate system components interacting together (e.g., service + DB).              |
| **E2E Tests**       | High cost, low volume. Focused on user flows, not total coverage.                          |
| **Combined coverage** | Can mask holes (e.g., E2E hits code but no unit tests → false sense of coverage).        |

---

## 🧠 Benefits of Tracking Separately

1. **Expose redundant or missing tests**  
   High unit test coverage but no integration? You might miss real-world bugs.

2. **Highlight flaky reliance on E2E**  
   If E2E is inflating overall coverage, you're in a brittle place.

3. **Guide test effort priorities**  
   If logic is only covered via integration tests, you can refactor to improve unit coverage.

---

## 🔧 How to Track Coverage Per Test Type

### 🗂️ File Structure Strategy

Structure your tests like:

```
src/
  components/
    Button.tsx
    __tests__/
      Button.unit.test.tsx
      Button.integration.test.tsx
tests/
  e2e/
    login.spec.ts
```

Then split test runs:

```bash
# Unit test coverage
jest --config=jest.unit.config.js --coverage --coverageDirectory=coverage/unit

# Integration test coverage
jest --config=jest.int.config.js --coverage --coverageDirectory=coverage/integration

# E2E (Playwright/Cypress) coverage
playwright test --coverage-dir=coverage/e2e
```

Then merge reports using:

- [`istanbul-combine`](https://github.com/istanbuljs/istanbuljs/tree/master/packages/istanbul-combine)
- [`nyc report`](https://github.com/istanbuljs/nyc#nyc-report)

This creates both **per-type** and **overall** reports.

---

## 🚨 Gotchas

- Don’t **over-index** on numbers.  
  > 90% E2E coverage isn’t as valuable as 60% clean unit + 20% integration + 10% E2E.

- Don’t ignore **test quality**.  
  Coverage is not correctness.

- Avoid duplicating effort across layers.  
  > You want a **pyramid**, not an **ice cream cone** 🍦.

---

## 📈 Ideal Testing Coverage Pyramid

| Layer        | Volume       | Coverage Contribution | Purpose                          |
|--------------|--------------|------------------------|----------------------------------|
| Unit         | 🟩🟩🟩🟩🟩         | High                   | Fast validation of logic         |
| Integration  | 🟨🟨            | Medium                 | System interactions              |
| E2E          | 🟥              | Low                    | Critical business workflows only |

---

## 🧰 Recommended Tools

- **Codecov**, **Coveralls**  
  Track multiple coverage sources, merge reports, visualize.

- **Jest Projects**  
  Supports multiple configurations (e.g., for unit/integration).

- **Nx**, **Turborepo**  
  Ideal for per-package or per-type instrumentation in monorepos.

---

Let us know if you'd like example configs for `jest`, `nyc`, or monorepo test layouts.
