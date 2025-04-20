import { execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getTimestamp, ensureDirectoryExists, updateLatestReference, TestType, rewriteRelativePaths } from './setup-test-artifacts'; // Use functions from this script
import createModuleCoverageReport from '../test/reports/vitest-module-reporter';

// Get root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliRootDir = path.resolve(__dirname, '..');

// Function to run the tests
async function runTests(testType: TestType) {
  if (testType !== 'unit') {
     console.error(`[Orchestrator] Invalid test type provided to run-unit-tests script: ${testType}`);
     process.exit(1);
  }
  const testTypeUpper = testType.toUpperCase();
  console.log(`[${testTypeUpper} Orchestrator] Starting ${testType} test run...`);

  // --- 1. Determine Artifact Directory ---
  const timestamp = getTimestamp();
  const artifactDir = path.join(cliRootDir, 'test', 'reports', 'artifacts', testType, timestamp);
  console.log(`[${testTypeUpper} Orchestrator] Artifact directory: ${artifactDir}`);
  try {
    ensureDirectoryExists(artifactDir);
    console.log(`[${testTypeUpper} Orchestrator] Ensured artifact directory exists.`);
  } catch (error) {
    console.error(`[${testTypeUpper} Orchestrator] Failed during artifact directory setup:`, error);
    process.exit(1);
  }

  // --- 2. Run Tests ---
  console.log(`[${testTypeUpper} Orchestrator] Starting Vitest tests...`);

  // Define the command based on testType
  const vitestCommand = 'vitest run "test/unit/" -c test/unit/unit.config.ts';
  const fullCommand = vitestCommand;

  // Environment variables for the test process
  const testEnv = {
    ...process.env, // Inherit current env
    NODE_ENV: 'test',
    NODE_OPTIONS: '--max-old-space-size=8192',
    // Pass the specific artifact directory path and timestamp
    [`CURRENT_${testTypeUpper}_ARTIFACT_DIR`]: artifactDir,
    ARTIFACT_TIMESTAMP: timestamp,
  };

  let exitCode = 0;
  try {
    console.log(`[${testTypeUpper} Orchestrator] Executing command: ${fullCommand}`);
    execSync(fullCommand, {
      stdio: 'inherit', // Show test output directly
      cwd: cliRootDir, // Run from cli root
      env: testEnv,
    });
    console.log(`[${testTypeUpper} Orchestrator] Vitest process finished successfully.`);
  } catch (error) {
    console.error(`[${testTypeUpper} Orchestrator] Vitest process execution failed:`, error);
    exitCode = 1; // Indicate failure
  }
   
  await createModuleCoverageReport(artifactDir);

  // --- 3. Update 'latest' Reference ---
  // Only update if tests passed (or handle differently if needed)
  if (exitCode === 0) {
      console.log(`[${testTypeUpper} Orchestrator] Updating latest reference...`);
      try {
        updateLatestReference(testType, timestamp);
        console.log(`[${testTypeUpper} Orchestrator] Updated latest reference.`);
      } catch (error) {
        console.error(`[${testTypeUpper} Orchestrator] Failed to update latest reference:`, error);
        // Don't change exit code, just log
      }
  } else {
     console.log(`[${testTypeUpper} Orchestrator] Skipping 'latest' update due to test failures.`);
  }


  // --- 4. Exit ---
  console.log(`[${testTypeUpper} Orchestrator] ${testType} run complete.`);
  process.exit(exitCode);
}

// Explicitly set test type
const testType: TestType = 'unit';

runTests(testType).catch(error => {
  console.error(`[UNIT Orchestrator] Unhandled error during orchestration:`, error);
  process.exit(1);
});
