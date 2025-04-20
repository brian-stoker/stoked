import { execSync } from 'child_process';
import * as path from 'path';

/**
 * This script runs all the fix scripts to resolve testing issues
 * 1. Fixes test imports from Jest to Vitest
 * 2. Fixes command decorator issues
 * 3. Fixes missing imports in specific files
 * 4. Ensures decorator metadata settings are correct
 */
async function main() {
  console.log('=== Starting all test fixes ===');
  
  try {
    // Fix test imports
    console.log('\n--- Fixing test imports ---');
    execSync('pnpm tsx scripts/fix-test-imports.ts', { stdio: 'inherit' });
    
    // Fix command decorators
    console.log('\n--- Fixing command decorators ---');
    execSync('pnpm tsx scripts/fix-command-decorators.ts', { stdio: 'inherit' });
    
    // Fix missing imports
    console.log('\n--- Fixing missing imports ---');
    execSync('pnpm tsx scripts/fix-missing-imports.ts', { stdio: 'inherit' });
    
    // Fix decorator metadata
    console.log('\n--- Fixing decorator metadata ---');
    execSync('pnpm tsx scripts/fix-decorator-metadata.ts', { stdio: 'inherit' });
    
    // Build the project
    console.log('\n--- Building project ---');
    execSync('pnpm build', { stdio: 'inherit' });
    
    console.log('\n=== All fixes completed successfully ===');
    console.log('You can now run tests:');
    console.log('- pnpm test:unit      # Run unit tests');
    console.log('- pnpm test:e2e:jsdocs # Run JSDoc E2E tests');
    console.log('- pnpm test:e2e       # Run all E2E tests');
  } catch (error) {
    console.error('Error running fix scripts:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
}); 