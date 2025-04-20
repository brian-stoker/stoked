/**
 * Script to combine coverage reports from different test types
 * This is used to avoid shell compatibility issues across platforms
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTimestamp, createArtifactDir, copyToArtifacts } from './setup-test-artifacts.ts';

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Create a timestamp that will be used for all test types
// If passed as an environment variable, use that instead
const timestamp: string = process.env.COMBINED_ARTIFACT_TIMESTAMP || getTimestamp();
const artifactDir: string = createArtifactDir('all', timestamp);

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
console.log('Artifacts directory:', artifactDir);

/**
 * Copy a directory recursively
 */
function copyDir(src: string, dest: string): boolean {
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
  } catch (error: any) {
    console.error(`Error copying directory ${src} to ${dest}:`, error.message);
    return false;
  }
}

/**
 * Copy a file safely
 */
function copyFileSafe(src: string, dest: string): boolean {
  try {
    if (!fs.existsSync(src)) {
      console.warn(`Warning: Source file ${src} does not exist.`);
      return false;
    }
    fs.copyFileSync(src, dest);
    return true;
  } catch (error: any) {
    console.error(`Error copying file ${src} to ${dest}:`, error.message);
    return false;
  }
}

/**
 * Parse JSON file safely
 */
function parseJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: JSON file ${filePath} does not exist.`);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error: any) {
    console.error(`Error parsing JSON file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Write JSON file safely
 */
function writeJsonSafe(filePath: string, data: any): boolean {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error: any) {
    console.error(`Error writing JSON file ${filePath}:`, error.message);
    return false;
  }
}

// Array to track which coverage reports were successfully processed
const processedReports: string[] = [];

// Search for the latest unit test artifacts
const unitArtifactsDir = path.join(rootDir, 'test', 'reports', 'artifacts', 'unit');
let latestUnitDir: string | null = null;
if (fs.existsSync(unitArtifactsDir)) {
  const unitDirs = fs.readdirSync(unitArtifactsDir)
    .filter(dir => /^\d{8}-\d{6}$/.test(dir))
    .sort()
    .reverse();
    
  if (unitDirs.length > 0) {
    latestUnitDir = path.join(unitArtifactsDir, unitDirs[0]);
    console.log(`Found latest unit artifacts: ${unitDirs[0]}`);
  }
}

// Search for the latest integration test artifacts
const integrationArtifactsDir = path.join(rootDir, 'test', 'reports', 'artifacts', 'integration');
let latestIntegrationDir: string | null = null;
if (fs.existsSync(integrationArtifactsDir)) {
  const integrationDirs = fs.readdirSync(integrationArtifactsDir)
    .filter(dir => /^\d{8}-\d{6}$/.test(dir))
    .sort()
    .reverse();
    
  if (integrationDirs.length > 0) {
    latestIntegrationDir = path.join(integrationArtifactsDir, integrationDirs[0]);
    console.log(`Found latest integration artifacts: ${integrationDirs[0]}`);
  }
}

// Search for the latest e2e test artifacts
const e2eArtifactsDir = path.join(rootDir, 'test', 'reports', 'artifacts', 'e2e');
let latestE2eDir: string | null = null;
if (fs.existsSync(e2eArtifactsDir)) {
  const e2eDirs = fs.readdirSync(e2eArtifactsDir)
    .filter(dir => /^\d{8}-\d{6}$/.test(dir))
    .sort()
    .reverse();
    
  if (e2eDirs.length > 0) {
    latestE2eDir = path.join(e2eArtifactsDir, e2eDirs[0]);
    console.log(`Found latest e2e artifacts: ${e2eDirs[0]}`);
  }
}

// Copy unit test coverage if available
const unitCoverageTarget = path.join(artifactDir, 'unit-coverage');
if (latestUnitDir) {
  const unitCoverageSrc = path.join(latestUnitDir, 'coverage');
  
  if (fs.existsSync(unitCoverageSrc)) {
    console.log('Copying unit test coverage...');
    const success = copyDir(unitCoverageSrc, unitCoverageTarget);
    
    // Copy the unit results JSON file to the combined artifacts
    const unitResultsJsonSrc = path.join(latestUnitDir, 'vitest-results.json');
    if (fs.existsSync(unitResultsJsonSrc)) {
      copyFileSafe(unitResultsJsonSrc, path.join(artifactDir, 'unit-results.json'));
      processedReports.push('unit');
    }
  }
} else {
  console.warn('No unit test artifacts found.');
}

// Copy integration test coverage if available
const integrationCoverageTarget = path.join(artifactDir, 'integration-coverage');
if (latestIntegrationDir) {
  const integrationCoverageSrc = path.join(latestIntegrationDir, 'coverage');
  
  if (fs.existsSync(integrationCoverageSrc)) {
    console.log('Copying integration test coverage...');
    const success = copyDir(integrationCoverageSrc, integrationCoverageTarget);
    
    // Copy the integration results JSON file to the combined artifacts
    const integrationResultsJsonSrc = path.join(latestIntegrationDir, 'vitest-results.json');
    if (fs.existsSync(integrationResultsJsonSrc)) {
      copyFileSafe(integrationResultsJsonSrc, path.join(artifactDir, 'integration-results.json'));
      processedReports.push('integration');
    }
  }
} else {
  console.warn('No integration test artifacts found.');
}

// Copy E2E test reports if available
const e2eCoverageTarget = path.join(artifactDir, 'e2e-coverage');
if (latestE2eDir) {
  const playwrightReportSrc = path.join(latestE2eDir, 'e2e-coverage');
  
  if (fs.existsSync(playwrightReportSrc)) {
    console.log('Copying E2E test reports...');
    const success = copyDir(playwrightReportSrc, path.join(artifactDir, 'e2e-coverage'));
    
    // Copy the Playwright JSON report
    const playwrightJsonSrc = path.join(latestE2eDir, 'e2e-coverage.json');
    if (fs.existsSync(playwrightJsonSrc)) {
      copyFileSafe(playwrightJsonSrc, path.join(artifactDir, 'e2e-coverage.json'));
      processedReports.push('e2e');
      
      // Extract path coverage information from Playwright results
      try {
        interface PlaywrightReport {
          suites?: Array<{
            file?: string;
            specs?: Array<{
              file: string;
              tests?: Array<{
                title: string;
              }>;
            }>;
            tests?: Array<{
              title: string;
            }>;
          }>;
        }
        
        const playwrightData = parseJsonSafe<PlaywrightReport>(playwrightJsonSrc);
        if (playwrightData) {
          const testedPaths = new Set<string>();
          
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
          
          // Write the paths to a file in the combined artifacts directory
          const pathsArray = Array.from(testedPaths);
          writeJsonSafe(
            path.join(artifactDir, 'e2e-paths-covered.json'),
            { paths: pathsArray }
          );
          console.log(`Extracted ${pathsArray.length} tested paths from E2E tests`);
        }
      } catch (err: any) {
        console.error('Error extracting paths from Playwright results:', err.message);
      }
    }
  }
} else {
  console.warn('No E2E test artifacts found.');
}

// Generate index.html file for combined reports
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Coverage Report - ${timestamp}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
    h1 { color: #2c3e50; }
    .container { max-width: 1200px; margin: 0 auto; }
    .report-section { margin: 20px 0; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
    .report-link { display: block; margin: 10px 0; }
    .timestamp { color: #7f8c8d; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Coverage Report</h1>
    <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
    
    <div class="report-section">
      <h2>Unit Tests</h2>
      ${processedReports.includes('unit') 
        ? `<a class="report-link" href="./unit-coverage/index.html">Coverage Report</a>` 
        : '<p>No unit test results available</p>'}
    </div>
    
    <div class="report-section">
      <h2>Integration Tests</h2>
      ${processedReports.includes('integration') 
        ? `<a class="report-link" href="./integration-coverage/index.html">Coverage Report</a>` 
        : '<p>No integration test results available</p>'}
    </div>
    
    <div class="report-section">
      <h2>E2E Tests</h2>
      ${processedReports.includes('e2e') 
        ? `<a class="report-link" href="./e2e-coverage/index.html">Test Report</a>` 
        : '<p>No E2E test results available</p>'}
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(artifactDir, 'index.html'), indexHtml);
console.log(`Created index.html for combined reports in ${artifactDir}`);

// Create a symlink to the latest combined report
const latestLinkPath = path.join(rootDir, 'test', 'reports', 'artifacts', 'all', 'latest');
try {
  // Remove existing symlink if it exists
  if (fs.existsSync(latestLinkPath)) {
    if (fs.lstatSync(latestLinkPath).isSymbolicLink()) {
      fs.unlinkSync(latestLinkPath);
    } else {
      fs.rmSync(latestLinkPath, { recursive: true, force: true });
    }
  }
  
  // Create relative symlink
  const relativePathToArtifact = path.relative(
    path.dirname(latestLinkPath),
    artifactDir
  );
  
  fs.symlinkSync(relativePathToArtifact, latestLinkPath, fs.existsSync(artifactDir) && fs.statSync(artifactDir).isDirectory() ? 'dir' : 'file');
  console.log(`Created 'latest' symlink pointing to ${timestamp}`);
} catch (error: any) {
  console.error(`Error creating symlink: ${error.message}`);
  // Write the latest timestamp to a file as fallback on systems where symlinks may not work
  fs.writeFileSync(path.join(rootDir, 'test', 'reports', 'artifacts', 'all', 'latest.txt'), timestamp);
}

console.log(`\n✅ Combined coverage reports generated in: ${artifactDir}`);
console.log(`You can view the combined report at: ${path.join(artifactDir, 'index.html')}`); 