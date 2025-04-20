/**
 * This script fixes issues with decorator metadata and testing library conflicts
 * 1. Ensures proper TypeScript configuration for decorators
 * 2. Resolves conflicts between Jest and Vitest
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

console.log('Starting fix for decorator and testing library issues...');

// Fix tsconfig.json to properly support decorators
function fixTsConfig() {
  console.log('\n1. Fixing TypeScript configuration for decorators...');
  const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json');
  
  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    
    // Ensure decorator settings are correctly set
    tsconfig.compilerOptions = {
      ...tsconfig.compilerOptions,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      // Make sure module is set correctly for ESM
      module: "NodeNext",
      moduleResolution: "NodeNext"
    };
    
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf8');
    console.log('  - Updated tsconfig.json with proper decorator settings');
  } else {
    console.log('  - tsconfig.json not found');
  }
}

// Create a unit.config.ts to fix conflicts with Jest
function createVitestConfig() {
  console.log('\n2. Creating Vitest configuration to resolve testing conflicts...');
  const vitestConfigPath = path.resolve(process.cwd(), 'unit.config.ts');
  
  const vitestConfig = `/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Ensure Vitest doesn't conflict with Jest
    globals: false,
    environment: 'node',
    includeSource: ['src/**/*.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '.idea/**', '.git/**'],
    // Ensure proper setup for decorator metadata
    deps: {
      interopDefault: true,
    },
    setupFiles: ['./test/vitest.setup.ts'],
  },
});
`;
  
  fs.writeFileSync(vitestConfigPath, vitestConfig, 'utf8');
  console.log('  - Created unit.config.ts');
  
  // Create vitest setup file
  const setupDir = path.resolve(process.cwd(), 'test');
  if (!fs.existsSync(setupDir)) {
    fs.mkdirSync(setupDir, { recursive: true });
  }
  
  const setupPath = path.resolve(setupDir, 'vitest.setup.ts');
  const setupContent = `import 'reflect-metadata';
// Override global Object.defineProperty to handle Symbol conflicts
const originalDefineProperty = Object.defineProperty;
Object.defineProperty = function(obj, prop, descriptor) {
  // Skip if trying to redefine a Symbol
  if (typeof prop === 'symbol' && prop.toString().includes('$$jest-matchers-object')) {
    return obj;
  }
  return originalDefineProperty(obj, prop, descriptor);
};
`;
  
  fs.writeFileSync(setupPath, setupContent, 'utf8');
  console.log('  - Created test/vitest.setup.ts');
}

// Create a Playwright config that avoids loading both testing libraries
function createPlaywrightConfig() {
  console.log('\n3. Creating Playwright configuration to avoid testing library conflicts...');
  const playwrightConfigPath = path.resolve(process.cwd(), 'playwright.config.ts');
  
  const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    trace: 'on-first-retry',
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Isolate the expect implementations 
  expect: {
    timeout: 5000,
  },
});
`;
  
  fs.writeFileSync(playwrightConfigPath, playwrightConfig, 'utf8');
  console.log('  - Created playwright.config.ts');
}

// Fix the package.json to avoid conflicts in test commands
function fixPackageJson() {
  console.log('\n4. Updating package.json to avoid testing library conflicts...');
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Update test commands to prevent conflicts
    packageJson.scripts['test:e2e:cov'] = 'tsx -e "import { createArtifactDir } from \'./scripts/setup-test-artifacts.ts\'; createArtifactDir(\'e2e\')" && NODE_OPTIONS=\'--no-experimental-fetch\' playwright test --reporter=html';
    
    // Remove any references to Jest if it exists
    const devDeps = packageJson.devDependencies || {};
    ['jest', 'ts-jest', '@types/jest'].forEach(dep => {
      if (devDeps[dep]) {
        console.log(`  - Removing ${dep} from devDependencies`);
        delete devDeps[dep];
      }
    });
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
    console.log('  - Updated package.json to avoid testing conflicts');
  } else {
    console.log('  - package.json not found');
  }
}

// Main function to run all fixes
async function main() {
  try {
    fixTsConfig();
    createVitestConfig();
    createPlaywrightConfig();
    fixPackageJson();
    
    console.log('\nFixing package dependencies...');
    execSync('pnpm install', { stdio: 'inherit' });
    
    console.log('\nClearing node_modules cache...');
    try {
      execSync('pnpm exec rimraf node_modules/.vite', { stdio: 'inherit' });
      execSync('pnpm exec rimraf node_modules/.cache', { stdio: 'inherit' });
    } catch (e) {
      console.log('  - Cache clearing failed, but continuing');
    }
    
    console.log('\nRebuilding project...');
    execSync('pnpm build', { stdio: 'inherit' });
    
    console.log('\nAll fixes completed!');
    console.log('You should now be able to run tests without conflicts.');
    console.log('To run e2e tests: pnpm test:e2e');
  } catch (error) {
    console.error('Error applying fixes:', error);
    process.exit(1);
  }
}

main().catch(console.error); 