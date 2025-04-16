/**
 * Helper script to create time-stamped directories for test artifacts
 * This is used by test scripts to ensure artifacts are properly organized
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

/**
 * Test type definition
 */
export type TestType = 'unit' | 'integration' | 'e2e' | 'all';

/**
 * Get a timestamp string in the format YYYYMMDD-HHMMSS
 */
export function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Create a time-stamped directory for test artifacts
 * 
 * @param {TestType} testType - Type of test ('unit', 'integration', 'e2e', 'all')
 * @param {string} [timestamp] - Optional timestamp (will generate one if not provided)
 * @param {boolean} [createSymlink] - Whether to create/update a 'latest' symlink (defaults to true)
 * @returns {string} Path to the created directory
 */
export function createArtifactDir(testType: TestType, timestamp?: string | null, createSymlink: boolean = true): string {
  if (!['unit', 'integration', 'e2e', 'all'].includes(testType)) {
    throw new Error(`Invalid test type: ${testType}`);
  }
  
  const ts = timestamp || getTimestamp();
  const artifactsBaseDir = path.join(rootDir, 'test', 'reports', 'artifacts');
  const typeDir = path.join(artifactsBaseDir, testType);
  const timestampDir = path.join(typeDir, ts);
  
  // Create directories if they don't exist
  [artifactsBaseDir, typeDir, timestampDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Create or update 'latest' symlink
  if (createSymlink) {
    updateLatestSymlink(testType, ts);
  }
  
  return timestampDir;
}

/**
 * Creates or updates a 'latest' symlink to point to the most recent artifact directory
 * 
 * @param {TestType} testType - Type of test ('unit', 'integration', 'e2e', 'all')
 * @param {string} timestamp - Timestamp to link to
 * @returns {boolean} Success status
 */
export function updateLatestSymlink(testType: TestType, timestamp: string): boolean {
  try {
    const artifactsBaseDir = path.join(rootDir, 'test', 'reports', 'artifacts');
    const typeDir = path.join(artifactsBaseDir, testType);
    const latestPath = path.join(typeDir, 'latest');
    
    // Remove existing symlink if it exists
    if (fs.existsSync(latestPath)) {
      try {
        fs.unlinkSync(latestPath);
      } catch (err) {
        // If we can't unlink, try removing it as a directory (Windows may create a junction)
        fs.rmSync(latestPath, { recursive: true, force: true });
      }
    }
    
    try {
      // Try creating a direct symlink (works on Unix systems and Windows with permissions)
      fs.symlinkSync(timestamp, latestPath, 'dir');
    } catch (error) {
      // Fallback for environments where symlinks are restricted
      try {
        // Use the command line to create a symlink or junction
        const command = process.platform === 'win32'
          ? `mklink /J "${latestPath}" "${path.join(typeDir, timestamp)}"`
          : `ln -sf "${timestamp}" "${latestPath}"`;
          
        execSync(command, { cwd: typeDir });
      } catch (cmdError) {
        console.warn(`Could not create symlink (expected on restricted systems): ${cmdError}`);
        console.log(`Latest test artifacts are available at: ${path.join(typeDir, timestamp)}`);
        return false;
      }
    }
    
    return true;
  } catch (error: any) {
    console.warn(`Failed to update 'latest' symlink: ${error.message}`);
    return false;
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
      fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
    } else {
      // Copy file
      fs.copyFileSync(sourcePath, targetPath);
    }
    
    return true;
  } catch (error: any) {
    console.error(`Error copying to artifacts: ${error.message}`);
    return false;
  }
}

// If this script is run directly, show available functions
if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
  console.log('Test Artifacts Helper');
  console.log('====================');
  console.log('This module provides helper functions for organizing test artifacts:');
  console.log('- getTimestamp(): Returns current timestamp in YYYYMMDD-HHMMSS format');
  console.log('- createArtifactDir(testType, [timestamp], [createSymlink]): Creates timestamped artifact directory');
  console.log('- updateLatestSymlink(testType, timestamp): Updates the "latest" symlink for a test type');
  console.log('- copyToArtifacts(source, artifactDir, [destName]): Copies files to artifact directory');
  console.log('\nExample:');
  console.log('const timestamp = getTimestamp();');
  console.log('const artifactDir = createArtifactDir("unit", timestamp);');
  console.log('copyToArtifacts("test/coverage/unit", artifactDir, "coverage");');
} 