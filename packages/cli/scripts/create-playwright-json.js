/**
 * Script to ensure Playwright tests are run and their JSON report is properly formatted
 * for the coverage dashboard
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Paths for reports
const reportDir = path.join(rootDir, 'test', 'playwright-report');
const reportsDir = path.join(rootDir, 'test', 'reports');
const playwrightJsonPath = path.join(reportDir, 'playwright-report.json');
const dashboardReportFile = path.join(reportsDir, 'playwright-results.json');

// Create reporting directories if they don't exist
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

try {
  // Check if tests have already been run (the JSON report exists)
  if (!fs.existsSync(playwrightJsonPath)) {
    console.log('Playwright report not found, running E2E tests...');
    execSync('npx playwright test --output=test/playwright-report', {
      cwd: rootDir,
      stdio: 'inherit' // Show the test output in the console
    });
  } else {
    console.log('Playwright report found, using existing results');
  }
  
  // Ensure the JSON report exists after running the tests
  if (fs.existsSync(playwrightJsonPath)) {
    // Extract the list of test files from the report
    const playwrightData = JSON.parse(fs.readFileSync(playwrightJsonPath, 'utf8'));
    const testFiles = new Set();
    
    // Extract all unique test file paths from the report
    if (playwrightData.suites) {
      for (const suite of playwrightData.suites) {
        if (suite.file) {
          testFiles.add(suite.file);
        }
      }
    }
    
    console.log(`Found ${testFiles.size} test files: ${Array.from(testFiles).join(', ')}`);
    
    // Create paths information for the dashboard
    const pathsFile = path.join(reportsDir, 'e2e-paths-covered.json');
    const pathsData = {
      paths: Array.from(testFiles).map(file => `test/e2e/${file}`)
    };
    
    fs.writeFileSync(pathsFile, JSON.stringify(pathsData, null, 2));
    console.log(`Created E2E paths file at ${pathsFile}`);
    
    // Copy the JSON report to the expected location for the dashboard
    fs.copyFileSync(playwrightJsonPath, dashboardReportFile);
    console.log(`Copied Playwright JSON report to ${dashboardReportFile}`);
  } else {
    throw new Error('Playwright tests did not generate a JSON report');
  }
  
} catch (error) {
  console.error('Failed to run Playwright tests or process results:', error);
  process.exit(1);
} 