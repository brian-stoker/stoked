import { execSync } from 'child_process';
import * as path from 'path';

/**
 * This script fixes E2E test issues by:
 * 1. Installing required dependencies
 * 2. Converting Jest tests to Vitest
 * 3. Fixing decorator issues in command files
 * 4. Fixing specific files with missing imports
 */
async function main() {
  console.log('=== Starting E2E test fixes ===');
  
  // Install glob if not already installed
  console.log('Ensuring dependencies are installed...');
  try {
    execSync('pnpm add glob -D', { stdio: 'inherit' });
    console.log('Dependencies installed successfully.');
  } catch (error) {
    console.error('Error installing dependencies:', error);
    process.exit(1);
  }
  
  // Run fix scripts
  console.log('\nRunning test import fixes...');
  try {
    execSync('tsx scripts/fix-test-imports.ts', { stdio: 'inherit' });
  } catch (error) {
    console.error('Error fixing test imports:', error);
    process.exit(1);
  }
  
  console.log('\nRunning command decorator fixes...');
  try {
    execSync('tsx scripts/fix-command-decorators.ts', { stdio: 'inherit' });
  } catch (error) {
    console.error('Error fixing command decorators:', error);
    process.exit(1);
  }
  
  console.log('\nRunning missing imports fixes...');
  try {
    execSync('tsx scripts/fix-missing-imports.ts', { stdio: 'inherit' });
  } catch (error) {
    console.error('Error fixing missing imports:', error);
    process.exit(1);
  }
  
  console.log('\n=== All fixes completed successfully ===');
  console.log('You can now run E2E tests with: pnpm test:e2e:cov');
}

main().catch(error => {
  console.error('Unexpected error running fixes:', error);
  process.exit(1);
}); 