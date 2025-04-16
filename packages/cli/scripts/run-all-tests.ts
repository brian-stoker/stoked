#!/usr/bin/env node

/**
 * Script to run all tests and generate reports in timestamped directories
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, cpSync } from 'fs';
import { join, resolve } from 'path';
import { createArtifactDir, getTimestamp, updateLatestSymlink } from './setup-test-artifacts.js';

/**
 * Updates symlinks to the latest artifact directories for all test types
 * @param {string} timestamp Timestamp string for the current run
 */
function updateAllLatestSymlinks(timestamp: string): void {
  const types = ['unit', 'integration', 'e2e', 'all'];
  
  types.forEach(type => {
    updateLatestSymlink(type as any, timestamp);
  });
}

/**
 * Main function to run all tests and organize artifacts
 */
async function runAllTests(): Promise<void> {
  console.log('Starting test:all command...');
  
  // Get timestamp for this run
  const timestamp = getTimestamp();
  console.log(`Using timestamp: ${timestamp}`);
  
  // Create directories for each test type
  const unitDir = createArtifactDir('unit', timestamp);
  const integrationDir = createArtifactDir('integration', timestamp);
  const e2eDir = createArtifactDir('e2e', timestamp);
  const allDir = createArtifactDir('all', timestamp);
  
  // Base paths for reference
  const reportsDir = resolve(process.cwd(), 'test', 'reports');
  const artifactsDir = join(reportsDir, 'artifacts');
  
  console.log(`Test artifacts will be stored in: ${allDir}`);
  
  // Run tests in sequence
  let unitSuccess = await runUnitTests(unitDir, allDir);
  let integrationSuccess = await runIntegrationTests(integrationDir, allDir);
  let e2eSuccess = await runE2eTests(e2eDir, allDir);
  
  // Ensure latest symlinks are updated
  updateAllLatestSymlinks(timestamp);
  
  // Output completion message
  console.log('\n========== ALL TESTS COMPLETED ==========');
  console.log(`Test artifacts are available at:\n${allDir}`);
  console.log(`You can view the latest artifacts at:\n${join(artifactsDir, 'all', 'latest')}`);
  
  // Report test results summary
  console.log('\n========== TEST RESULTS SUMMARY ==========');
  console.log(`Unit Tests: ${unitSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Integration Tests: ${integrationSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`E2E Tests: ${e2eSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  
  // Exit with appropriate code
  if (!unitSuccess || !integrationSuccess || !e2eSuccess) {
    console.log('\n⚠️ Some tests failed. Check logs for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed successfully!');
    process.exit(0);
  }
}

/**
 * Runs unit tests and copies reports to artifact directories
 * @param {string} unitDir Directory for unit test artifacts
 * @param {string} allDir Directory for combined artifacts
 */
async function runUnitTests(unitDir: string, allDir: string): Promise<boolean> {
  console.log('\n========== RUNNING UNIT TESTS ==========\n');
  
  try {
    // Set environment variables for the test
    process.env.VITEST_REPORT_DIR = unitDir;
    process.env.VITEST_ARTIFACT_DIR = unitDir;
    
    // Run the unit tests with coverage using the defined script
    execSync('pnpm test:unit:cov', { 
      stdio: 'inherit'
    });
    
    // Copy coverage reports to the all directory if they exist
    const coverageDir = resolve(process.cwd(), 'coverage');
    if (existsSync(coverageDir)) {
      const unitCoverageDir = join(allDir, 'unit-coverage');
      
      // Create directory if it doesn't exist
      if (!existsSync(unitCoverageDir)) {
        mkdirSync(unitCoverageDir, { recursive: true });
      }
      
      // Copy files using platform-safe method
      try {
        cpSync(coverageDir, unitCoverageDir, { recursive: true });
        console.log(`Copied unit test coverage to ${unitCoverageDir}`);
      } catch (err) {
        console.error(`Failed to copy coverage reports: ${err}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Unit tests failed:', error);
    // Continue with other tests even if unit tests fail
    return false;
  }
}

/**
 * Runs integration tests and copies reports to artifact directories
 * @param {string} integrationDir Directory for integration test artifacts
 * @param {string} allDir Directory for combined artifacts
 */
async function runIntegrationTests(integrationDir: string, allDir: string): Promise<boolean> {
  console.log('\n========== RUNNING INTEGRATION TESTS ==========\n');
  
  try {
    // Set environment variables for the test
    process.env.VITEST_REPORT_DIR = integrationDir;
    process.env.VITEST_ARTIFACT_DIR = integrationDir;
    
    // Run the integration tests with coverage using the defined script
    execSync('pnpm test:integration:cov', { 
      stdio: 'inherit'
    });
    
    // Copy coverage reports to the all directory if they exist
    const coverageDir = resolve(process.cwd(), 'coverage');
    if (existsSync(coverageDir)) {
      const integrationCoverageDir = join(allDir, 'integration-coverage');
      
      // Create directory if it doesn't exist
      if (!existsSync(integrationCoverageDir)) {
        mkdirSync(integrationCoverageDir, { recursive: true });
      }
      
      // Copy files using platform-safe method
      try {
        cpSync(coverageDir, integrationCoverageDir, { recursive: true });
        console.log(`Copied integration test coverage to ${integrationCoverageDir}`);
      } catch (err) {
        console.error(`Failed to copy coverage reports: ${err}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Integration tests failed:', error);
    // Continue with other tests even if integration tests fail
    return false;
  }
}

/**
 * Runs e2e tests and copies reports to artifact directories
 * @param {string} e2eDir Directory for e2e test artifacts
 * @param {string} allDir Directory for combined artifacts
 */
async function runE2eTests(e2eDir: string, allDir: string): Promise<boolean> {
  console.log('\n========== RUNNING E2E TESTS ==========\n');
  
  try {
    // Set environment variables for the test
    process.env.E2E_ARTIFACT_DIR = e2eDir;
    process.env.PLAYWRIGHT_OUTPUT_DIR = join(e2eDir, 'playwright-report');
    
    // Run the e2e tests with coverage using the defined script
    execSync('pnpm test:e2e:cov', { 
      stdio: 'inherit'
    });
    
    // Copy Playwright report to the all directory
    const playwrightReportDir = join(e2eDir, 'playwright-report');
    if (existsSync(playwrightReportDir)) {
      const e2eCoverageDir = join(allDir, 'e2e-coverage');
      
      // Create directory if it doesn't exist
      if (!existsSync(e2eCoverageDir)) {
        mkdirSync(e2eCoverageDir, { recursive: true });
      }
      
      // Copy files using platform-safe method
      try {
        cpSync(playwrightReportDir, e2eCoverageDir, { recursive: true });
        console.log(`Copied e2e test results to ${e2eCoverageDir}`);
      } catch (err) {
        console.error(`Failed to copy e2e reports: ${err}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('E2E tests failed:', error);
    // Continue with other operations even if e2e tests fail
    return false;
  }
}

// Execute the main function
runAllTests().catch(error => {
  console.error('Failed to run tests:', error);
  process.exit(1);
}); 