import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('JSDoc Command E2E Test', () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let testsDir: string;
  let stokedConfigDir: string;
  let utilsFile: string;
  let indexFile: string;
  let cliPath: string;

  test.beforeAll(async () => {
    // Create a temporary directory for tests
    tempDir = path.join(os.tmpdir(), `stoked-e2e-test-${Date.now()}`);
    testsDir = path.join(tempDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });

    // Set up a test utils.js file without JSDoc comments
    utilsFile = path.join(testsDir, 'utils.js');
    fs.writeFileSync(utilsFile, `
function add(a, b) {
  return a + b;
}

module.exports = { add };
    `);

    // Set up a test index.js file with existing JSDoc comments
    indexFile = path.join(testsDir, 'index.js');
    fs.writeFileSync(indexFile, `
/**
 * Multiply two numbers
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Product of a and b
 */
function multiply(a, b) {
  return a * b;
}

module.exports = { multiply };
    `);

    // Initialize a Git repository in the temp directory
    process.chdir(tempDir);
    try {
      require('child_process').execSync('git init', { stdio: 'ignore' });
      require('child_process').execSync('git config user.name "Test User"', { stdio: 'ignore' });
      require('child_process').execSync('git config user.email "test@example.com"', { stdio: 'ignore' });
      require('child_process').execSync('git add .', { stdio: 'ignore' });
      require('child_process').execSync('git commit -m "Initial commit"', { stdio: 'ignore' });
    } catch (error) {
      console.error('Git initialization error:', error);
    }

    // Set up fake stoked config directory with repo entry
    stokedConfigDir = path.join(tempDir, '.stoked');
    fs.mkdirSync(stokedConfigDir, { recursive: true });
    fs.writeFileSync(path.join(stokedConfigDir, 'config.json'), JSON.stringify({
      repositories: {
        "test-repo": {
          "path": tempDir
        }
      }
    }));

    // Set path to CLI
    cliPath = path.resolve(process.cwd(), 'dist/main.js');

    // Set STOKED_WORKSPACE_ROOT to the temp directory
    process.env.STOKED_WORKSPACE_ROOT = tempDir;
  });

  test.afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up temporary files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up temp directory:', error);
    }
  });

  test('should generate JSDoc comments for files without them', async ({ page }) => {
    const utilsContentBefore = fs.readFileSync(utilsFile, 'utf8');
    expect(utilsContentBefore).not.toContain('/**');
    
    const promise = new Promise<void>((resolve, reject) => {
      const child = spawn('node', [cliPath, 'jsdocs', 'tests/utils.js', '--test'], {
        env: process.env,
        cwd: tempDir
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(data.toString());
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(data.toString());
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}.\nStdout: ${stdout}\nStderr: ${stderr}`));
        }
      });
    });
    
    await promise;
    
    const utilsContentAfter = fs.readFileSync(utilsFile, 'utf8');
    expect(utilsContentAfter).toContain('/**');
    expect(utilsContentAfter).toContain('@param');
    expect(utilsContentAfter).toContain('@returns');
  });

  test('should skip files with existing JSDoc comments', async ({ page }) => {
    const indexContentBefore = fs.readFileSync(indexFile, 'utf8');
    const originalJSDoc = indexContentBefore.match(/\/\*\*([\s\S]*?)\*\//)?.[0];
    expect(originalJSDoc).toBeTruthy();
    
    const promise = new Promise<void>((resolve, reject) => {
      const child = spawn('node', [cliPath, 'jsdocs', 'tests/index.js', '--test'], {
        env: process.env,
        cwd: tempDir
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(data.toString());
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(data.toString());
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}.\nStdout: ${stdout}\nStderr: ${stderr}`));
        }
      });
    });
    
    await promise;
    
    const indexContentAfter = fs.readFileSync(indexFile, 'utf8');
    const afterJSDoc = indexContentAfter.match(/\/\*\*([\s\S]*?)\*\//)?.[0];
    expect(afterJSDoc).toEqual(originalJSDoc);
  });
}); 