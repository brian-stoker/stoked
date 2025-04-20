#!/usr/bin/env node

/**
 * Script to run all tests in sequence.
 * Delegates artifact handling and detailed execution to individual test type scripts.
 */

import { execSync } from 'child_process';
import { join, resolve } from 'path';
// Remove unused artifact imports
// import { createArtifactDir, getTimestamp, copyToArtifacts, TestType, updateLatestReference, copyDirectoryRecursive, ensureDirectoryExists } from './setup-test-artifacts.js';
import * as fs from 'fs';
import * as path from 'path';


/**
 * Main function to run all tests sequentially
 */
async function runAllTests(): Promise<void> {
  console.log('[Run All] Starting test run...');

  // Run tests in sequence
  let unitSuccess = await runUnitTests();
  let integrationSuccess = await runIntegrationTests();
  let e2eSuccess = await runE2eTests();

  // Output completion message
  console.log('\n========== [Run All] TESTS COMPLETED ==========');

  // Report test results summary
  console.log('\n========== [Run All] TEST RESULTS SUMMARY ==========');
  console.log(`Unit Tests:        ${unitSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Integration Tests: ${integrationSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`E2E Tests:         ${e2eSuccess ? '✅ PASSED' : '❌ FAILED'}`);

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