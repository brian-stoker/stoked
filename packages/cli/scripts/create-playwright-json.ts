/**
 * Script to ensure Playwright tests are run and their JSON report is properly formatted
 * for the coverage dashboard
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { getTimestamp, createArtifactDir, copyToArtifacts } from './setup-test-artifacts.ts';

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Create a timestamped directory for the E2E artifacts
const timestamp: string = getTimestamp();
const artifactDir: string = createArtifactDir('e2e', timestamp);

// Paths for reports
const reportDir = path.join(rootDir, 'test', 'playwright-report');
const playwrightJsonPath = path.join(reportDir, 'playwright-report.json');

// Create reporting directories if they don't exist
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

try {
  // Check if tests have already been run (the JSON report exists)
  if (!fs.existsSync(playwrightJsonPath)) {
    console.log('Playwright report not found, running E2E tests...');
    
    // Set the output directory to our timestamped artifacts directory
    const outputDir = `--output=${artifactDir}/playwright-report`;
    
    execSync(`playwright test ${outputDir}`, {
      cwd: rootDir,
      stdio: 'inherit' // Show the test output in the console
    });
    
    // Update the JSON path to the new location
    const artifactJsonPath = path.join(artifactDir, 'playwright-report', 'playwright-report.json');
    if (fs.existsSync(artifactJsonPath)) {
      fs.copyFileSync(artifactJsonPath, path.join(artifactDir, 'playwright-report.json'));
      console.log(`Copied report to ${path.join(artifactDir, 'playwright-report.json')}`);
    }
  } else {
    console.log('Playwright report found, copying to artifacts directory...');
    
    // Copy the entire playwright-report directory to our artifacts
    fs.cpSync(reportDir, path.join(artifactDir, 'playwright-report'), { 
      recursive: true,
      force: true 
    });
    
    // Copy the JSON file to the root of the artifacts directory too
    fs.copyFileSync(playwrightJsonPath, path.join(artifactDir, 'playwright-report.json'));
  }
  
  // Check for the artifacts JSON file
  const artifactJsonPath = path.join(artifactDir, 'playwright-report.json');
  
  // Ensure the JSON report exists after running the tests
  if (fs.existsSync(artifactJsonPath)) {
    interface PlaywrightReport {
      suites?: Array<{
        file?: string;
      }>;
    }
    
    // Extract the list of test files from the report
    const playwrightData = JSON.parse(fs.readFileSync(artifactJsonPath, 'utf8')) as PlaywrightReport;
    const testFiles = new Set<string>();
    
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
    const pathsFile = path.join(artifactDir, 'e2e-paths-covered.json');
    const pathsData = {
      paths: Array.from(testFiles).map(file => `test/e2e/${file}`)
    };
    
    fs.writeFileSync(pathsFile, JSON.stringify(pathsData, null, 2));
    console.log(`Created E2E paths file at ${pathsFile}`);
    
    // Create a symlink to the latest e2e directory
    const latestLinkPath = path.join(rootDir, 'test', 'reports', 'artifacts', 'e2e', 'latest');
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
      
      fs.symlinkSync(relativePathToArtifact, latestLinkPath, 'dir');
      console.log(`Created 'latest' symlink pointing to ${timestamp}`);
    } catch (error: any) {
      console.error(`Error creating symlink: ${error.message}`);
      // Write the latest timestamp to a file as fallback
      fs.writeFileSync(path.join(rootDir, 'test', 'reports', 'artifacts', 'e2e', 'latest.txt'), timestamp);
    }
    
    console.log(`\n✅ E2E test artifacts generated in: ${artifactDir}`);
  } else {
    throw new Error('Playwright tests did not generate a JSON report');
  }
  
} catch (error: any) {
  console.error('Failed to run Playwright tests or process results:', error);
  process.exit(1);
} 