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
  
  // Ensure the coverage-final.json file is in the root of the reports directory for easy reference
  const unitJsonSrc = path.join(unitCoverageSrc, 'coverage-final.json');
  if (fs.existsSync(unitJsonSrc)) {
    fs.copyFileSync(unitJsonSrc, path.join(reportsDir, 'unit-coverage-final.json'));
  }
}

// Copy the integration test coverage
const integrationCoverageSrc = path.join(rootDir, 'test', 'coverage', 'integration');
const integrationCoverageDest = path.join(reportsDir, 'integration-coverage');
if (fs.existsSync(integrationCoverageSrc)) {
  console.log('Copying integration test coverage...');
  copyDir(integrationCoverageSrc, integrationCoverageDest);
  
  // Ensure the coverage-final.json file is in the root of the reports directory for easy reference
  const integrationJsonSrc = path.join(integrationCoverageSrc, 'coverage-final.json');
  if (fs.existsSync(integrationJsonSrc)) {
    fs.copyFileSync(integrationJsonSrc, path.join(reportsDir, 'integration-coverage-final.json'));
  }
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
    
    // Extract path coverage information from Playwright results
    try {
      const playwrightData = JSON.parse(fs.readFileSync(playwrightJsonSrc, 'utf8'));
      const testedPaths = new Set();
      
      // Extract paths from test titles and spec files
      if (playwrightData.suites) {
        playwrightData.suites.forEach(suite => {
          if (suite.specs) {
            suite.specs.forEach(spec => {
              testedPaths.add(spec.file);
              if (spec.tests) {
                spec.tests.forEach(test => {
                  testedPaths.add(test.title);
                });
              }
            });
          }
          
          if (suite.tests) {
            suite.tests.forEach(test => {
              testedPaths.add(test.title);
            });
          }
        });
      }
      
      // Write the paths to a file
      const pathsArray = Array.from(testedPaths);
      fs.writeFileSync(
        path.join(reportsDir, 'e2e-paths-covered.json'), 
        JSON.stringify({ paths: pathsArray }, null, 2)
      );
      console.log(`Extracted ${pathsArray.length} tested paths from E2E tests`);
    } catch (err) {
      console.warn('Failed to extract path coverage from Playwright results:', err.message);
    }
  } else {
    console.warn('Playwright JSON report not found at:', playwrightJsonSrc);
  }
} else {
  console.warn('E2E test reports directory not found at:', e2eReportSrc);
}

// Create a metadata file with information about when the reports were generated
const metadata = {
  generatedAt: new Date().toISOString(),
  reportTypes: ['unit', 'integration', 'e2e'],
  availableReports: []
};

if (fs.existsSync(path.join(reportsDir, 'unit-coverage-final.json'))) {
  metadata.availableReports.push('unit');
}

if (fs.existsSync(path.join(reportsDir, 'integration-coverage-final.json'))) {
  metadata.availableReports.push('integration');
}

if (fs.existsSync(path.join(reportsDir, 'playwright-results.json'))) {
  metadata.availableReports.push('e2e');
}

fs.writeFileSync(
  path.join(reportsDir, 'coverage-metadata.json'),
  JSON.stringify(metadata, null, 2)
);

console.log('Combined reports available in test/reports/ directory'); 