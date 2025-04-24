/**
 * Helper script to create time-stamped directories for test artifacts
 * This is used by test scripts to ensure artifacts are properly organized
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { getTimestamp } from '../src/utils/timestamp';

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

/**
 * Test type definition
 */
export type TestType = 'unit' | 'integration' | 'e2e';

/**
 * Ensures a directory exists, creating it if necessary
 * @param dirPath The directory path to ensure exists
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    } catch (error) {
      console.error(`Error creating directory ${dirPath}:`, error);
      // Don't throw, try to continue
    }
  }
}

/**
 * Recursively copies a directory and its contents
 */
export function copyDirectoryRecursive(src: string, dest: string): void {
  ensureDirectoryExists(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (error) {
         console.error(`Failed to copy file ${srcPath} to ${destPath}:`, error);
      }
    }
  }
}

/**
 * Updates the "latest" directory for the specified test type.
 * On Windows, this does a directory copy instead of creating a symlink.
 * On other platforms, it creates a symlink.
 * 
 * @param testType The type of test (unit, integration, e2e, all)
 * @param timestampDirName The name of the timestamp directory to use as the source
 */
export function updateLatestReference(testType: TestType, timestampDirName: string): void {
  try {
    console.log(`Updating latest reference for test type: ${testType}`);
    const artifactsDir = path.join(rootDir, 'test', 'reports', 'artifacts', testType);
    const timestampDirPath = path.join(artifactsDir, timestampDirName);
    const latestDirPath = path.join(artifactsDir, 'latest');

    // Ensure the timestamp directory exists before proceeding
    if (!fs.existsSync(timestampDirPath)) {
      console.error(`Source timestamp directory does not exist: ${timestampDirPath}`);
      return;
    }

    console.log(`Source directory: ${timestampDirPath}`);
    console.log(`Target 'latest' path: ${latestDirPath}`);

    // Delete the existing latest directory/symlink/marker file if it exists
    if (fs.existsSync(latestDirPath) || fs.existsSync(`${latestDirPath}.txt`)) {
      console.log(`Removing existing latest reference: ${latestDirPath}`);
      try {
         if (fs.existsSync(`${latestDirPath}.txt`)) {
           fs.unlinkSync(`${latestDirPath}.txt`);
           console.log('Removed existing marker file.');
         }
         if (fs.existsSync(latestDirPath)) {
            fs.rmSync(latestDirPath, { recursive: true, force: true });
            console.log('Successfully removed existing latest directory/symlink.');
         }
      } catch (error) {
        console.error(`Failed to remove existing latest reference: ${error}. Attempting to continue.`);
        // Try removing with specific Windows command as a fallback
        if (process.platform === 'win32' && fs.existsSync(latestDirPath)) {
          try {
            execSync(`rmdir /s /q \"${latestDirPath}\"`, { stdio: 'ignore' });
            console.log('Removed using Windows rmdir command.');
          } catch (winRmError) {
             console.error(`Windows rmdir also failed: ${winRmError}`);
          }
        }
      }
    }

    // Ensure the parent directory exists
    ensureDirectoryExists(artifactsDir);

    if (process.platform === 'win32') {
      console.log(`Using directory copy for Windows platform`);
      try {
        copyDirectoryRecursive(timestampDirPath, latestDirPath);
        console.log(`Successfully copied ${timestampDirPath} to ${latestDirPath}`);
      } catch (error) {
        console.error(`Failed to copy files to latest directory: ${error}`);
        // Fallback: Create marker file
        try {
          fs.writeFileSync(`${latestDirPath}.txt`, timestampDirPath, 'utf8');
          console.log(`Created marker file ${latestDirPath}.txt pointing to ${timestampDirPath}`);
        } catch (markerError) {
          console.error(`Failed to create fallback marker file: ${markerError}`);
        }
      }
    } else {
      console.log(`Creating symlink on non-Windows platform`);
      try {
        // Create a relative symlink for non-Windows platforms
        fs.symlinkSync(timestampDirName, latestDirPath, 'dir');
        console.log(`Successfully created symlink ${latestDirPath} -> ${timestampDirName}`);
      } catch (error) {
        console.error(`Failed to create symlink: ${error}`);
         // Fallback: Create marker file
        try {
          fs.writeFileSync(`${latestDirPath}.txt`, timestampDirPath, 'utf8');
          console.log(`Created marker file ${latestDirPath}.txt pointing to ${timestampDirPath}`);
        } catch (markerError) {
          console.error(`Failed to create fallback marker file: ${markerError}`);
        }
      }
    }
  } catch (error) {
    console.error(`Unexpected error in updateLatestReference: ${error}`);
  }
}

/**
 * Creates a directory for test artifacts with a timestamp.
 * It ALSO updates the 'latest' reference (symlink or dir copy).
 * 
 * @param testType The type of test (e2e, unit, integration)
 * @returns Path to the created timestamped directory, or undefined if error occurs
 */
export function createArtifactDir(testType: TestType): string | undefined {
  console.log(`Creating artifact directory for ${testType} tests...`);
  const artifactsBaseDir = path.join(rootDir, 'test', 'reports', 'artifacts');
  const typeDir = path.join(artifactsBaseDir, testType);
  let timestampDir: string | undefined;
  
  try {
    const timestamp = getTimestamp();
    const timestampDirName = timestamp; // Use timestamp as the directory name
    timestampDir = path.join(typeDir, timestampDirName);

    console.log(`Artifacts base: ${artifactsBaseDir}`);
    console.log(`Type directory: ${typeDir}`);
    console.log(`Timestamp directory: ${timestampDir}`);

    // Ensure the directory structure exists
    ensureDirectoryExists(artifactsBaseDir);
    ensureDirectoryExists(typeDir);
    ensureDirectoryExists(timestampDir);
    
    console.log(`Successfully created artifact directory for ${testType}: ${timestampDir}`);

    // **** ADDED: Update the latest reference immediately ****
    updateLatestReference(testType, timestampDirName);
    // ******************************************************

    return timestampDir;
  } catch (error) {
    console.error(`Fatal error in createArtifactDir for ${testType}: ${error}`);
    return undefined; // Return undefined on error
  }
}

/**
 * Copy a file or directory to the artifacts directory
 * 
 * @param {string} source - Source file or directory path
 * @param {string} artifactDir - Target artifacts directory path
 * @param {string} [destName] - Optional destination name (defaults to source basename)
 * @returns {boolean} Success status
 */
export function copyToArtifacts(source: string, artifactDir: string, destName?: string | null): boolean {
  try {
    const sourcePath = path.resolve(rootDir, source);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`Warning: Source path ${sourcePath} does not exist.`);
      return false;
    }
    
    const targetName = destName || path.basename(source);
    const targetPath = path.join(artifactDir, targetName);
    
    if (fs.statSync(sourcePath).isDirectory()) {
      // Copy directory recursively
      copyDirectoryRecursive(sourcePath, targetPath);
    } else {
      // Copy file
      fs.copyFileSync(sourcePath, targetPath);
    }
    
    console.log(`Copied ${sourcePath} to ${targetPath}`);
    return true;
  } catch (error: any) {
    console.error(`Error copying to artifacts: ${error.message}`);
    return false;
  }
}

export async function rewriteRelativePaths(reportPath: any): Promise<void> {
  console.log('Rewriting paths:', reportPath);
  // Load the JSON data (replace with your actual JSON file path)
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

  // Define the project root directory
  const projectRoot = path.resolve(__dirname, "../");
console.log('dirname', __dirname);
  // Convert absolute paths to relative paths
  const updatedReport = Object.fromEntries(
    Object.entries(report).map(([filePath, data]) => {
      const relativePath = path.relative(projectRoot, filePath);
      return [relativePath, data];
    })
  );

  // Save the updated report (optional)
  fs.writeFileSync(reportPath, JSON.stringify(updatedReport, null, 2), "utf-8");
}

// If this script is run directly, show available functions
if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
  console.log('Test Artifacts Helper');
  console.log('====================');
  console.log('This module provides helper functions for organizing test artifacts:');
  console.log('- getTimestamp(): Returns current timestamp in YYYYMMDD-HHMMSS format');
  console.log('- createArtifactDir(testType): Creates timestamped artifact directory');
  console.log('- updateLatestReference(testType, timestampDirName): Updates the latest reference (symlink or dir copy)');
  console.log('- copyToArtifacts(source, artifactDir, [destName]): Copies files/dirs to artifact directory');
} 