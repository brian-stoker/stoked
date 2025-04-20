/**
 * Script to run tests with proper artifact directory creation
 * This ensures consistent behavior across platforms
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { createArtifactDir } from './setup-test-artifacts.ts';

// Test type is passed as a command line argument
const testType = process.argv[2] as 'unit' | 'integration' | 'e2e';
if (!['unit', 'integration', 'e2e'].includes(testType)) {
  console.error(`Invalid test type: ${testType}. Must be one of: unit, integration, e2e`);
  process.exit(1);
}

// Get timestamp from environment or generate a new one
const timestamp = process.env.ARTIFACT_TIMESTAMP || 
  new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// Create the artifact directory
console.log(`\n=== Creating artifact directory for ${testType} tests with timestamp ${timestamp} ===`);
const artifactDir = createArtifactDir(testType, timestamp);
console.log(`=== Artifacts will be saved to: ${artifactDir} ===\n`);

// Set environment variables
const env: NodeJS.ProcessEnv = {
  ...process.env,
  ARTIFACT_TIMESTAMP: timestamp,
};

// Run the appropriate test command based on test type
let command: string;
let args: string[];

if (testType === 'e2e') {
  // For E2E tests, run Playwright
  env.NODE_OPTIONS = '--no-experimental-fetch';
  command = 'npx';
  args = [
    'playwright',
    'test',
    '-c',
    path.join('test', 'e2e', 'e2e.config.ts'),
    '--reporter=html',
  ];
} else {
  // For unit and integration tests, run Vitest
  env.NODE_OPTIONS = '--max-old-space-size=8192';
  command = 'npx';
  args = [
    'vitest',
    'run',
    `test/${testType}/`,
    '-c',
    path.join('test', testType, `${testType}.config.ts`),
  ];
}

// Execute the test command
console.log(`\n=== Running command: ${command} ${args.join(' ')} ===\n`);
const result = spawnSync(command, args, {
  env,
  stdio: 'inherit',
  shell: true,
});

// Log the result 
if (result.status === 0) {
  console.log(`\n=== ${testType.toUpperCase()} tests completed successfully ===\n`);
} else {
  console.error(`\n=== ${testType.toUpperCase()} tests failed with status: ${result.status} ===\n`);
}

// Exit with the same code as the command
process.exit(result.status || 0); 