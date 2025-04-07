/**
 * Script to combine coverage reports from different test types
 * This is used to avoid shell compatibility issues across platforms
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Ensure the reports directory exists
const reportsDir = path.join(rootDir, 'test', 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

/**
 * Copy a directory recursively
 */
function copyDir(src, dest) {
  // Create the destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Get all files in the source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      copyDir(srcPath, destPath);
    } else {
      // Copy files
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy the unit test coverage
const unitCoverageSrc = path.join(rootDir, 'test', 'coverage', 'unit');
const unitCoverageDest = path.join(reportsDir, 'unit-coverage');
if (fs.existsSync(unitCoverageSrc)) {
  console.log('Copying unit test coverage...');
  copyDir(unitCoverageSrc, unitCoverageDest);
}

// Copy the integration test coverage
const integrationCoverageSrc = path.join(rootDir, 'test', 'coverage', 'integration');
const integrationCoverageDest = path.join(reportsDir, 'integration-coverage');
if (fs.existsSync(integrationCoverageSrc)) {
  console.log('Copying integration test coverage...');
  copyDir(integrationCoverageSrc, integrationCoverageDest);
}

// Copy the E2E test reports
const e2eReportSrc = path.join(rootDir, 'test', 'playwright-report');
const e2eReportDest = path.join(reportsDir, 'e2e-coverage');
if (fs.existsSync(e2eReportSrc)) {
  console.log('Copying E2E test reports...');
  copyDir(e2eReportSrc, e2eReportDest);
  
  // Copy the Playwright JSON report specifically
  const playwrightJsonSrc = path.join(e2eReportSrc, 'playwright-report.json');
  const playwrightJsonDest = path.join(reportsDir, 'playwright-results.json');
  
  if (fs.existsSync(playwrightJsonSrc)) {
    console.log('Copying Playwright JSON report...');
    fs.copyFileSync(playwrightJsonSrc, playwrightJsonDest);
  } else {
    console.warn('Playwright JSON report not found at:', playwrightJsonSrc);
  }
} else {
  console.warn('E2E test reports directory not found at:', e2eReportSrc);
}

console.log('Combined reports available in test/reports/ directory'); 