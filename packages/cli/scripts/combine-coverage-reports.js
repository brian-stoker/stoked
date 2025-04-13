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

console.log('======================================================');
console.log('Generating combined coverage reports');
console.log('======================================================');
console.log('Working directory:', rootDir);
console.log('Reports directory:', reportsDir);

/**
 * Copy a directory recursively
 */
function copyDir(src, dest) {
  try {
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
    return true;
  } catch (error) {
    console.error(`Error copying directory ${src} to ${dest}:`, error.message);
    return false;
  }
}

/**
 * Copy a file safely
 */
function copyFileSafe(src, dest) {
  try {
    if (!fs.existsSync(src)) {
      console.warn(`Warning: Source file ${src} does not exist.`);
      return false;
    }
    fs.copyFileSync(src, dest);
    return true;
  } catch (error) {
    console.error(`Error copying file ${src} to ${dest}:`, error.message);
    return false;
  }
}

/**
 * Parse JSON file safely
 */
function parseJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: JSON file ${filePath} does not exist.`);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error parsing JSON file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Write JSON file safely
 */
function writeJsonSafe(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing JSON file ${filePath}:`, error.message);
    return false;
  }
}

// Array to track which coverage reports were successfully processed
const processedReports = [];

// Copy the unit test coverage
const unitCoverageSrc = path.join(rootDir, 'test', 'coverage', 'unit');
const unitCoverageDest = path.join(reportsDir, 'unit-coverage');
if (fs.existsSync(unitCoverageSrc)) {
  console.log('Copying unit test coverage...');
  const success = copyDir(unitCoverageSrc, unitCoverageDest);
  
  // Ensure the coverage-final.json file is in the root of the reports directory for easy reference
  const unitJsonSrc = path.join(unitCoverageSrc, 'coverage-final.json');
  if (fs.existsSync(unitJsonSrc)) {
    copyFileSafe(unitJsonSrc, path.join(reportsDir, 'unit-coverage-final.json'));
    processedReports.push('unit');
  } else {
    console.warn('Unit test coverage JSON file not found at:', unitJsonSrc);
  }
} else {
  console.warn('Unit test coverage directory not found at:', unitCoverageSrc);
}

// Copy the integration test coverage
const integrationCoverageSrc = path.join(rootDir, 'test', 'coverage', 'integration');
const integrationCoverageDest = path.join(reportsDir, 'integration-coverage');
if (fs.existsSync(integrationCoverageSrc)) {
  console.log('Copying integration test coverage...');
  const success = copyDir(integrationCoverageSrc, integrationCoverageDest);
  
  // Ensure the coverage-final.json file is in the root of the reports directory for easy reference
  const integrationJsonSrc = path.join(integrationCoverageSrc, 'coverage-final.json');
  if (fs.existsSync(integrationJsonSrc)) {
    copyFileSafe(integrationJsonSrc, path.join(reportsDir, 'integration-coverage-final.json'));
    processedReports.push('integration');
  } else {
    console.warn('Integration test coverage JSON file not found at:', integrationJsonSrc);
  }
} else {
  console.warn('Integration test coverage directory not found at:', integrationCoverageSrc);
}

// Create a default paths file to prevent 404s
let e2ePathsGenerated = false;

// Copy the E2E test reports
const e2eReportSrc = path.join(rootDir, 'test', 'reports', 'e2e-coverage',)
const e2eReportDest = path.join(reportsDir, 'e2e-coverage');
if (fs.existsSync(e2eReportSrc)) {
  console.log('Copying E2E test reports...');
  const success = copyDir(e2eReportSrc, e2eReportDest);
  
  // Check for the Playwright JSON report
  const playwrightJsonSrc = path.join(e2eReportSrc, 'playwright-report.json');
  const playwrightJsonDest = path.join(reportsDir, 'playwright-results.json');
  
  if (fs.existsSync(playwrightJsonSrc)) {
    console.log('Copying Playwright JSON report...');
    copyFileSafe(playwrightJsonSrc, playwrightJsonDest);
    processedReports.push('e2e');
    
    // Extract path coverage information from Playwright results
    try {
      const playwrightData = parseJsonSafe(playwrightJsonSrc);
      if (playwrightData) {
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
        writeJsonSafe(
          path.join(reportsDir, 'e2e-paths-covered.json'), 
          { paths: pathsArray }
        );
        console.log(`Extracted ${pathsArray.length} tested paths from E2E tests`);
        e2ePathsGenerated = true;
      }
    } catch (err) {
      console.warn('Failed to extract path coverage from Playwright results:', err.message);
    }
  } else {
    console.warn('Playwright JSON report not found at:', playwrightJsonSrc);
    
    // Create a basic report based on the last run result
    const lastRunFile = path.join(e2eReportSrc, '.last-run.json');
    if (fs.existsSync(lastRunFile)) {
      try {
        const lastRunData = parseJsonSafe(lastRunFile);
        if (lastRunData) {
          console.log('Found .last-run.json file, generating a basic E2E report');
          
          // Create a basic report without executing external commands
          const basicReport = {
            stats: {
              startTime: new Date().toISOString(),
              duration: 0,
              expected: 0,
              skipped: 0,
              unexpected: lastRunData.status === 'passed' ? 0 : (lastRunData.failedTests?.length || 0),
              flaky: 0
            },
            suites: []
          };
          
          writeJsonSafe(playwrightJsonDest, basicReport);
          console.log('Created basic E2E report');
          processedReports.push('e2e-basic');
        }
      } catch (lastRunErr) {
        console.warn('Failed to parse .last-run.json:', lastRunErr.message);
      }
    }
  }
} else {
  console.warn('E2E test reports directory not found at:', e2eReportSrc);
}

// Create an empty paths file if one wasn't already generated to prevent 404 errors
if (!e2ePathsGenerated) {
  console.log('Creating empty E2E paths file...');
  writeJsonSafe(
    path.join(reportsDir, 'e2e-paths-covered.json'),
    { paths: ['No E2E paths found - run E2E tests to generate coverage'] }
  );
}

// Create a metadata file with information about when the reports were generated
const metadata = {
  generatedAt: new Date().toISOString(),
  reportTypes: ['unit', 'integration', 'e2e'],
  availableReports: processedReports,
  status: processedReports.length > 0 ? 'partial' : 'none'
};

if (processedReports.length === 3) {
  metadata.status = 'complete';
}

writeJsonSafe(
  path.join(reportsDir, 'coverage-metadata.json'),
  metadata
);

// Create status page to ensure the dashboard can display reports even with missing data
const statusTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Coverage Status</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2 {
      color: #2c3e50;
    }
    .status-card {
      margin-bottom: 20px;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .status-list {
      list-style-type: none;
      padding: 0;
    }
    .status-item {
      padding: 10px;
      margin-bottom: 5px;
      border-radius: 4px;
    }
    .success {
      background-color: #d4edda;
      color: #155724;
    }
    .warning {
      background-color: #fff3cd;
      color: #856404;
    }
    .error {
      background-color: #f8d7da;
      color: #721c24;
    }
  </style>
</head>
<body>
  <h1>Test Coverage Status</h1>
  <div class="status-card">
    <h2>Generated Reports (${processedReports.length}/${metadata.reportTypes.length})</h2>
    <ul class="status-list">
      <li class="status-item ${processedReports.includes('unit') ? 'success' : 'error'}">
        Unit Tests: ${processedReports.includes('unit') ? 'Available' : 'Not Available'}
      </li>
      <li class="status-item ${processedReports.includes('integration') ? 'success' : 'error'}">
        Integration Tests: ${processedReports.includes('integration') ? 'Available' : 'Not Available'}
      </li>
      <li class="status-item ${processedReports.includes('e2e') || processedReports.includes('e2e-basic') ? 'success' : 'error'}">
        E2E Tests: ${processedReports.includes('e2e') ? 'Available' : (processedReports.includes('e2e-basic') ? 'Basic Report Available' : 'Not Available')}
      </li>
    </ul>
    <p>Generated at: ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(reportsDir, 'coverage-status.html'), statusTemplate);

// Add a link to the coverage status page in the index.html
// Instead of modifying the existing index.html, let's update it only if necessary
const indexHtmlPath = path.join(reportsDir, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  console.log('Creating index.html file...');
  const basicIndex = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Coverage Reports</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2 {
      color: #2c3e50;
    }
    .links {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .link {
      display: inline-block;
      padding: 10px 15px;
      background-color: #3498db;
      color: white;
      text-decoration: none;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>Test Coverage Reports</h1>
  <div class="links">
    <a href="./coverage-status.html" class="link">Coverage Status</a>
    <a href="./coverage-dashboard.html" class="link">Coverage Dashboard</a>
    ${processedReports.includes('unit') ? '<a href="./unit-coverage/index.html" class="link">Unit Test Coverage</a>' : ''}
    ${processedReports.includes('integration') ? '<a href="./integration-coverage/index.html" class="link">Integration Test Coverage</a>' : ''}
    ${processedReports.includes('e2e') || processedReports.includes('e2e-basic') ? '<a href="./e2e-coverage/index.html" class="link">E2E Test Reports</a>' : ''}
  </div>
</body>
</html>`;
  fs.writeFileSync(indexHtmlPath, basicIndex);
}

console.log('======================================================');
console.log('Combined reports available in test/reports/ directory');
if (processedReports.length === 0) {
  console.log('⚠️  Warning: No coverage reports were processed');
} else if (processedReports.length < metadata.reportTypes.length) {
  console.log(`⚠️  Warning: Only ${processedReports.length}/${metadata.reportTypes.length} coverage reports were processed`);
} else {
  console.log('✅ All coverage reports successfully processed');
}
console.log('======================================================'); 