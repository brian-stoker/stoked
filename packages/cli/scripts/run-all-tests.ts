#!/usr/bin/env node

/**
 * Script to run all tests in sequence.
 * Delegates artifact handling and detailed execution to individual test type scripts.
 */

import { execSync } from 'child_process';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Remove unused artifact imports
// import { createArtifactDir, getTimestamp, copyToArtifacts, TestType, updateLatestReference, copyDirectoryRecursive, ensureDirectoryExists } from './setup-test-artifacts.js';
import * as fs from 'fs';
import * as path from 'path';

function parseTestResults(json) {
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  const failedTests: string[] = [];
  const failedDescriptions: string[] = [];

  function processSuite(suite) {
    // Process specs in the suite
    suite.specs.forEach((spec) => {

      spec.tests.forEach((test) => {
        totalTests++;
        if (test.status === "passed") {
          passed++;
        } else if (test.status === "failed" || test.status === "unexpected") {
          failed++;
          // Add the failure description
          failedTests.push(spec.title);
          for(let error = 0; error < test.results?.length; error++) {
            failedDescriptions.push(test.results[error].error.message);
          }
        }
      });
    });

    // Recursively process nested suites
    suite.suites?.forEach(processSuite);
  }

  // Start processing from the top-level suites
  json.suites.forEach(processSuite);

  // Determine overall success
  const success = failed === 0;

  return { success, totalTests, passed, failed, failedTests, failedDescriptions };
}
/**
 * Defines the structure for the test results summary.
 */
interface VitestTestSummary {
  success: boolean;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number; // Added skipped count
  pending: number; // Added pending count
  //failedTests: Array<{ name: string; file?: string }>; // Include file name if available
  failedTests: string[];
  failedDescriptions: string[];
}

/**
 * Parses a Vitest JSON report object and returns a summary.
 *
 * @param vitestJsonReport The raw JSON object from Vitest's JSON reporter.
 * @returns A VitestTestSummary object.
 */
function parseVitestJsonResults(vitestJsonReport: any): VitestTestSummary {
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  //const failedTests: Array<{ name: string; file?: string }> = [];
  const failedTests: string[] = [];
  const failedDescriptions: string[] = [];

  // Check if the report structure is valid
  if (!vitestJsonReport || !Array.isArray(vitestJsonReport.testResults)) {
    console.warn('Invalid Vitest JSON report structure: Missing testResults array.');
    return {
      success: false,
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
      failedTests: [],
      failedDescriptions: [],
    };
  }

  // Iterate through each test file result
  vitestJsonReport.testResults.forEach((testFileResult: any) => {
    const testFilePath = testFileResult.name; // Get the file path

    if (testFileResult && Array.isArray(testFileResult.assertionResults)) {
      // Iterate through each assertion (test case) within the file
      testFileResult.assertionResults.forEach((assertion: any) => {
        totalTests++;

        switch (assertion.status) {
          case 'passed':
            passed++;
            break;
          case 'failed':
            failed++;
            // Construct full test name
            const fullTestName = [...(assertion.ancestorTitles || []), assertion.title].join(' > ');
            //failedTests.push({ name: fullTestName, file: testFilePath });
            failedTests.push(fullTestName);
            // Add failure messages
            if (Array.isArray(assertion.failureMessages)) {
              failedDescriptions.push(...assertion.failureMessages);
            }
            break;
          case 'pending':
             pending++;
             break;
          case 'skipped':
          case 'disabled': // Vitest might use 'disabled'
          case 'todo':     // Vitest might use 'todo'
             skipped++;
             break;
          default:
            // Handle other potential statuses if necessary
            break;
        }
      });
    }
  });

  // Determine overall success
  const success = failed === 0;

  return {
    success,
    totalTests,
    passed,
    failed,
    skipped,
    pending,
    failedTests,
    failedDescriptions,
  };
}

// Example Usage (assuming you have loaded the JSON report into a variable called 'vitestReport'):
// const summary = parseVitestJsonResults(vitestReport);
// console.log(summary);

/**
 * Main function to run all tests sequentially
 */
async function runAllTests(): Promise<void> {
  console.log('[Run All] Starting test run...');

  // Run tests in sequence
  let unitSuccess = await runUnitTests();
  let integrationSuccess = await runIntegrationTests();
  let e2eSuccess = await runE2eTests();

    // Get the directory of the current script
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliRootDir = path.resolve(__dirname, '..');
  const e2ePath = path.join(cliRootDir, 'test', 'reports', 'artifacts', 'e2e', 'latest');
  const e2eResults: any = JSON.parse(fs.readFileSync(path.join(e2ePath, 'results.json'), 'utf8'));
  const e2eData = parseTestResults(e2eResults);
  const unitPath = path.join(cliRootDir, 'test', 'reports', 'artifacts', 'unit', 'latest', 'stats');
  const unitResults: any = JSON.parse(fs.readFileSync(path.join(unitPath, 'results.json'), 'utf8'));
  const unitData = parseVitestJsonResults(unitResults);
  const integrationPath = path.join(cliRootDir, 'test', 'reports', 'artifacts', 'integration', 'latest', 'stats');
  const integrationResults: any = JSON.parse(fs.readFileSync(path.join(integrationPath, 'results.json'), 'utf8'));
  const integrationData = parseVitestJsonResults(integrationResults);

  const logRed = (message: string) => {
    console.error(`\x1b[31m${message}\x1b[0m`);
  }
  // Report test results summary
  console.log('\n========== [Run All] TEST RESULTS SUMMARY ==========');
  const unitFailed = () => {
    console.log(`Unit Tests:        ✅ ${unitData.passed} PASSED, ❌ ${unitData.failed} FAILED`);
    logRed('  Failed Tests:');
    unitData.failedTests.forEach((test) => {
      logRed(`    ${test}`);
    });
  }
  unitSuccess ? console.log(`Unit Tests:        ✅ PASSED`) : unitFailed();
  
  const integrationFailed = () => {
    console.log(`Integration Tests: ✅ ${integrationData.passed} PASSED, ❌ ${integrationData.failed} FAILED`);
    logRed('  Failed Tests:');
    integrationData.failedTests.forEach((test) => {
      logRed(`    ${test}`);
    });
  }
  integrationSuccess ? console.log(`Integration Tests: ✅ PASSED`) : integrationFailed();
  const e2eFailed = () => {
    console.log(`E2E Tests:         ✅ ${e2eData.totalTests - e2eData.failed} PASSED, ❌ ${e2eData.failed} FAILED`);
    logRed('  Failed Tests:');
    e2eData.failedTests.filter(Boolean).forEach((test) => {
      logRed(`    ${test}`);
    });

  }
  e2eSuccess ? console.log(`E2E Tests:         ✅ PASSED`) : e2eFailed();

  // Exit with appropriate code
  if (!unitSuccess || !integrationSuccess || !e2eSuccess) {
    console.log('\n⚠️ [Run All] Some tests failed. Check logs for details.');
    process.exit(1);
  } else {
    console.log('\n✅ [Run All] All tests passed successfully!');
    process.exit(0);
  }
}

/**
 * Runs unit tests by calling the dedicated script
 */
async function runUnitTests(): Promise<boolean> {
  console.log('\n========== [Run All] STARTING UNIT TESTS ==========\n');
  try {
    // Execute the unit test orchestrator script
    execSync('pnpm run test:unit', { stdio: 'inherit' });
    return true;
  } catch (error) {
    // Error is usually indicated by non-zero exit code, already logged by the child script
    console.error('[Run All] Unit tests failed (see output above).');
    return false;
  }
}

/**
 * Runs integration tests by calling the dedicated script
 */
async function runIntegrationTests(): Promise<boolean> {
  console.log('\n========== [Run All] STARTING INTEGRATION TESTS ==========\n');
  try {
    // Execute the integration test orchestrator script
    execSync('pnpm run test:integration', { stdio: 'inherit' });
    return true;
  } catch (error) {
    // Error is usually indicated by non-zero exit code, already logged by the child script
    console.error('[Run All] Integration tests failed (see output above).');
    return false;
  }
}

/**
 * Runs e2e tests by calling the dedicated script
 */
async function runE2eTests(): Promise<boolean> {
  console.log('\n========== [Run All] STARTING E2E TESTS ==========\n');
  try {
    process.env.E2E_RESULTS = "0";
    // Execute the E2E test orchestrator script
    execSync('pnpm run test:e2e', { stdio: 'inherit' });
    return true;
  } catch (error) {
    // Error is usually indicated by non-zero exit code, already logged by the child script
    console.error('[Run All] E2E tests failed (see output above).');
    return false;
  }
}


// Run the main function
try {
  runAllTests().catch(err => {
    console.error('[Run All] Failed to run tests:', err);
    process.exit(1);
  });
} catch (error) {
  console.error('[Run All] Failed to run tests:', error);
  process.exit(1);
} 