import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { getTimestamp, ensureDirectoryExists, updateLatestReference } from './setup-test-artifacts';

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Get the cli package root directory (assuming scripts is one level down from root)
const cliRootDir = path.resolve(__dirname, '..');

async function runE2ETests() {
  console.log('[E2E Orchestrator] Starting E2E test run...');

  // --- 1. Generate Command Definitions --- 
  const listCommandsScript = path.join(cliRootDir, 'dist', 'list-commands.js');
  const definitionsPath = path.join(cliRootDir, 'command-definitions.json');
  console.log('[E2E Orchestrator] Generating command definitions...');
  try {
    execSync(`tsx ${listCommandsScript} ${definitionsPath}`, {
      stdio: 'inherit', 
      cwd: cliRootDir, 
    });
    console.log(`[E2E Orchestrator] Command definitions generated at ${definitionsPath}`);
  } catch (error: any) { // Add type 'any' to access stderr/stdout
    console.error('[E2E Orchestrator] Failed to generate command definitions.');
    // Attempt to print stderr/stdout from the failed process
    if (error.stderr) {
      console.error('--- STDERR from list-commands.js ---');
      console.error(error.stderr.toString());
      console.error('------------------------------------');
    }
    if (error.stdout) {
      console.error('--- STDOUT from list-commands.js ---');
      console.error(error.stdout.toString());
      console.error('------------------------------------');
    }
    console.error('Full error object:', error);
    process.exit(1); 
  }

  // --- 2. Determine Artifact Directory & Clear Old Files --- 
  const timestamp = getTimestamp();
  const artifactDir = path.join(cliRootDir, 'test', 'reports', 'artifacts', 'e2e', timestamp);
  const executedCommandsJsonPath = path.join(artifactDir, 'executed_commands.json');
  // **** Define path for the final coverage report ****
  const coverageReportPath = path.join(artifactDir, 'e2e-coverage-report.json');

  console.log(`[E2E Orchestrator] Artifact directory: ${artifactDir}`);
  try {
    ensureDirectoryExists(artifactDir); 
    console.log('[E2E Orchestrator] Ensured artifact directory exists.');
    // Delete previous executed commands file
    if (fs.existsSync(executedCommandsJsonPath)) {
      console.log(`[E2E Orchestrator] Deleting previous executed commands file: ${executedCommandsJsonPath}`);
      fs.unlinkSync(executedCommandsJsonPath);
    }
    // **** Delete previous coverage report file ****
    if (fs.existsSync(coverageReportPath)) {
      console.log(`[E2E Orchestrator] Deleting previous coverage report file: ${coverageReportPath}`);
      fs.unlinkSync(coverageReportPath);
    }
  } catch (error) {
    console.error('[E2E Orchestrator] Failed during artifact directory setup/cleanup:', error);
  }

  // --- 3. Run Playwright Tests --- 
  console.log('[E2E Orchestrator] Starting Playwright tests...');
  const playwrightCommand = 'playwright';
  const playwrightArgs = [
    'test', 
    '-c', 
    path.join(cliRootDir, 'test', 'e2e', 'e2e.config.ts'),
  ];

  // Environment variables for the playwright process
  const playwrightEnv = {
    ...process.env, // Inherit current env
    NODE_OPTIONS: '--no-experimental-fetch',
    NODE_ENV: 'test',
    LLM_MODE: 'mock',
    STOKED_LOG_LEVEL: 'error',
    DEBUG: 'true', // Keep debug on for now
    // **** Pass the specific artifact directory path to the test process ****
    CURRENT_E2E_ARTIFACT_DIR: artifactDir 
    // ******************************************************************
  };

  const child = spawn(playwrightCommand, playwrightArgs, {
    stdio: ['pipe', 'pipe', 'pipe'], // Use pipes to capture stdio
    shell: true, // Use shell for nyc command potentially
    cwd: cliRootDir, // Run from cli root
    env: playwrightEnv,
  });

  let stdoutData = '';
  let stderrData = '';

  // Stream stdout/stderr to console in real-time
  child.stdout.on('data', (data) => {
    process.stdout.write(data);
    stdoutData += data.toString();
  });
  child.stderr.on('data', (data) => {
    process.stderr.write(data);
    stderrData += data.toString();
  });

  // Wait for the process to finish
  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('close', () => resolve(0));
    child.on('error', (err) => {
      console.error('[E2E Orchestrator] Playwright process spawn error:', err);
      resolve(0); // Indicate failure
    });
  });

  console.log(`[E2E Orchestrator] Playwright process finished with exit code: ${exitCode}`);

  // --- Generate e2e_paths.json ---
  const resultsJsonPath = path.join(artifactDir, 'results.json'); // Playwright default output
  if (fs.existsSync(resultsJsonPath)) {
    try {
      const resultsData = JSON.parse(fs.readFileSync(resultsJsonPath, 'utf8'));
      const testPaths = extractTestPaths(resultsData); // Use helper function
      const e2ePathsFile = path.join(artifactDir, 'e2e_paths.json');
      fs.writeFileSync(e2ePathsFile, JSON.stringify(testPaths, null, 2), 'utf8');
      console.log(`[E2E Orchestrator] Generated e2e_paths.json with ${testPaths.paths.length} test paths`);
    } catch (pathsErr) {
      console.error(`[E2E Orchestrator] Failed to generate e2e_paths.json: ${pathsErr}`);
    }
  } else {
    console.warn(`[E2E Orchestrator] Could not find Playwright results JSON at ${resultsJsonPath} to generate e2e_paths.json`);
  }
  // --- End e2e_paths.json generation ---

  // **** ADD A SHORT DELAY before checking files ****
  console.log('[E2E Orchestrator] Adding short delay before coverage check...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // 500ms delay
  // *********************************************

  // --- 4. Run Coverage Check --- 
  console.log('[E2E Orchestrator] Preparing to run coverage check...');
  const coverageScriptPath = path.join(cliRootDir, 'scripts', 'check-e2e-coverage.ts');
  const definitionsExist = fs.existsSync(definitionsPath);
  // Check for executed commands in the SPECIFIC artifactDir (using path calculated earlier)
  const executedCommandsLogExists = fs.existsSync(executedCommandsJsonPath); 

  // **** Log prerequisite check results ****
  console.log(`[E2E Orchestrator] Prerequisite check - Definitions file exists (${definitionsPath}): ${definitionsExist}`);
  console.log(`[E2E Orchestrator] Prerequisite check - Executed commands file exists (${executedCommandsJsonPath}): ${executedCommandsLogExists}`);
  // ***************************************

  if (definitionsExist && executedCommandsLogExists) {
      // **** Log the command that WILL be executed ****
      const coverageCmd = `tsx ${coverageScriptPath} ${coverageReportPath}`;
      console.log(`[E2E Orchestrator] Executing coverage command: ${coverageCmd}`);
      // ***********************************************
      try {
          execSync(coverageCmd, {
              stdio: 'inherit', 
              cwd: cliRootDir,
              env: { ...process.env, CURRENT_E2E_ARTIFACT_DIR: artifactDir } 
          });
          console.log(`[E2E Orchestrator] Coverage report step completed.`);
      } catch (error) {
          console.error('[E2E Orchestrator] Coverage check script execution failed:', error);
      }
  } else {
       console.warn(`[E2E Orchestrator] Skipping coverage check due to missing prerequisite files.`);
  }

  // --- 5. Update 'latest' Symlink (Moved to AFTER coverage) --- 
  console.log('[E2E Orchestrator] Updating latest symlink...');
  try {
    updateLatestReference('e2e', timestamp); // timestamp is from Step 2
    console.log('[E2E Orchestrator] Updated latest symlink.');
  } catch (error) {
     console.error('[E2E Orchestrator] Failed to update latest symlink:', error);
  }

  // --- 6. Exit with Playwright's Code --- 
  console.log('[E2E Orchestrator] E2E run complete.');
  process.exit(exitCode ?? 1); 
}

runE2ETests().catch(error => {
  console.error('[E2E Orchestrator] Unhandled error during E2E orchestration:', error);
  process.exit(1);
}); 

// --- Helper functions for e2e_paths.json generation ---

/**
 * Extract test paths from Playwright test results
 */
function extractTestPaths(results: any): { timestamp: string, paths: Array<any> } {
  const timestamp = new Date().toISOString();
  const paths: Array<any> = [];

  try {
    if (results?.suites) {
      processPlaywrightSuites(results.suites, '', paths);
    }
  } catch (error) {
    console.error('[E2E Orchestrator] Error extracting test paths:', error);
  }

  return {
    timestamp,
    paths
  };
}

/**
 * Process Playwright suites recursively
 */
function processPlaywrightSuites(suites: Array<any>, prefix: string, paths: Array<any>): void {
  for (const suite of suites) {
    const currentPrefix = prefix ? `${prefix} > ${suite.title}` : suite.title;
    if (suite.specs) {
      processPlaywrightSpecs(suite.specs, currentPrefix, paths);
    }
    if (suite.suites) {
      processPlaywrightSuites(suite.suites, currentPrefix, paths);
    }
  }
}

/**
 * Process Playwright specs and tests
 */
function processPlaywrightSpecs(specs: Array<any>, prefix: string, paths: Array<any>): void {
  for (const spec of specs) {
    const testTitle = `${prefix} > ${spec.title}`;
    // Assuming the first test result represents the overall status
    const status = spec.tests?.[0]?.results?.[0]?.status || 'unknown'; 
    const duration = spec.tests?.[0]?.results?.[0]?.duration || 0;
    // Assuming tags are at the spec level
    const tags = (spec as any).tags || []; 

    paths.push({
      title: testTitle,
      file: spec.file,
      line: spec.line,
      column: spec.column,
      status: status,
      duration: duration,
      tags: tags
    });
  }
}
// --- End Helper functions --- 