#!/usr/bin/env node

/**
 * Script to clean up old test directories and files from the root directory
 * and migrate existing reports to the new test directory structure.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Directories to ensure exist in the new structure
const newDirs: string[] = [
  'test/reports',
  'test/reports/artifacts',
  'test/reports/artifacts/unit',
  'test/reports/artifacts/integration',
  'test/reports/artifacts/e2e',
  'test/reports/artifacts/all',
  'test/playwright-report',
  'test/test-results',
];

// Directories and files to remove from the root (if they exist)
const oldDirsToRemove: string[] = [
  'coverage',
  'reports',
  'playwright-report',
  'test-results',
  'jest-e2e.json',
  'app.e2e-spec.ts',
];

// If there are older Jest-specific files, remove them
const jestFiles: string[] = [
  'jest.config.js',  // We've moved to Vitest, but keep jest.setup.js for now as it's referenced
];

console.log('🧹 Cleaning up test directories and migrating to new structure...');

// Create new directories
newDirs.forEach(dir => {
  const fullPath = path.join(rootDir, dir);
  if (!fs.existsSync(fullPath)) {
    console.log(`📁 Creating directory: ${dir}`);
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Move files from old locations to new ones if they exist
const moveIfExists = (from: string, to: string): void => {
  const fromPath = path.join(rootDir, from);
  const toPath = path.join(rootDir, to);
  
  if (fs.existsSync(fromPath)) {
    console.log(`🚚 Moving ${from} to ${to}`);
    
    try {
      if (fs.statSync(fromPath).isDirectory()) {
        // Copy directory contents then delete original (more reliable on Windows)
        if (!fs.existsSync(toPath)) {
          fs.mkdirSync(toPath, { recursive: true });
        }
        
        // Copy files recursively
        fs.cpSync(fromPath, toPath, { 
          recursive: true, 
          force: true
        });
        
        // Delete original after copy succeeds
        fs.rmSync(fromPath, { recursive: true, force: true });
      } else {
        // Copy file then delete original
        fs.copyFileSync(fromPath, toPath);
        fs.unlinkSync(fromPath);
      }
    } catch (error: any) {
      console.error(`⚠️ Error moving ${from} to ${to}:`, error.message);
    }
  }
};

// Move relevant directories to new structure
moveIfExists('test/coverage/unit', 'test/reports/artifacts/unit/legacy/coverage');
moveIfExists('test/coverage/integration', 'test/reports/artifacts/integration/legacy/coverage');
moveIfExists('test/playwright-report', 'test/reports/artifacts/e2e/legacy/playwright-report');
moveIfExists('test/test-results', 'test/reports/artifacts/e2e/legacy/test-results');

// Move any old reports
if (fs.existsSync(path.join(rootDir, 'test', 'reports')) && !fs.existsSync(path.join(rootDir, 'test', 'reports', 'artifacts'))) {
  // This is an old reports directory structure, move it to a legacy location
  moveIfExists('test/reports', 'test/reports/legacy');
}

// Remove old directories and files
oldDirsToRemove.forEach(item => {
  const itemPath = path.join(rootDir, item);
  if (fs.existsSync(itemPath)) {
    try {
      console.log(`🗑️  Removing: ${item}`);
      if (fs.statSync(itemPath).isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(itemPath);
      }
    } catch (error: any) {
      console.error(`⚠️ Error removing ${item}:`, error.message);
    }
  }
});

// Remove Jest files if we've fully migrated to Vitest
jestFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (fs.existsSync(filePath)) {
    try {
      console.log(`🗑️  Removing Jest file: ${file}`);
      fs.unlinkSync(filePath);
    } catch (error: any) {
      console.error(`⚠️ Error removing ${file}:`, error.message);
    }
  }
});

console.log('✅ Cleanup complete! All test artifacts are now organized in the test/reports/artifacts directory.'); 