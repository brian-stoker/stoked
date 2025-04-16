import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import * as dotenv from 'dotenv';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

// Test repository with simple files
const TEST_REPO = {
  'index.js': `
/**
 * Add two numbers together
 */
function add(a, b) {
  return a + b;
}

module.exports = { add };
`,
  'utils.js': `
// Helper function without docs
function multiply(a, b) {
  return a * b;
}

// Export the function
module.exports = { multiply };
`
};

// Test environment setup
let tempDir: string;
let cliPath: string;
let stokedConfigDir: string;

test.beforeAll(async () => {
  // Find the CLI path - using the distribution build
  cliPath = resolve(process.cwd(), 'dist', 'main.js');
  
  // Create a separate directory for test files
  tempDir = join(tmpdir(), `docs-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  
  // Create test files
  for (const [filePath, content] of Object.entries(TEST_REPO)) {
    writeFileSync(join(tempDir, filePath), content);
  }
  
  // Set up Git repo
  execSync('git init', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config init.defaultBranch main', { cwd: tempDir, stdio: 'pipe' });
  execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' });
  
  // Create stoked config directory with fake repo entry
  stokedConfigDir = join(tempDir, '.stoked');
  mkdirSync(stokedConfigDir, { recursive: true });
  
  // Create a config.json file that points to our test repo
  const configPath = join(stokedConfigDir, 'config.json');
  const configData = {
    repositories: {
      'test-owner/test-repo': {
        path: tempDir,
        name: 'test-repo',
        owner: 'test-owner'
      }
    },
    defaultRepository: 'test-owner/test-repo'
  };
  
  // Write our test config
  writeFileSync(configPath, JSON.stringify(configData, null, 2));
  
  // Set environment variables for testing
  process.env.STOKED_WORKSPACE_ROOT = tempDir;
  process.env.STOKED_CONFIG_PATH = configPath;
  
  console.log('Test environment set up:');
  console.log('- Test repo:', tempDir);
  console.log('- Stoked config:', configPath);
  console.log('- STOKED_WORKSPACE_ROOT:', process.env.STOKED_WORKSPACE_ROOT);
  console.log('- LLM_MODE:', process.env.LLM_MODE);
});

test.afterAll(async () => {
  // Clean up test environment variables
  delete process.env.STOKED_WORKSPACE_ROOT;
  delete process.env.STOKED_CONFIG_PATH;
  
  // Clean up temporary files
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test.describe('Docs Command E2E Tests', () => {
  test('should generate JSDoc comments for files without them', async () => {
    // Verify file doesn't have JSDoc initially
    const beforeContent = readFileSync(join(tempDir, 'utils.js'), 'utf8');
    expect(beforeContent).not.toContain('/**');
    
    // Run the actual CLI command on the file
    console.log('Running docs command on test file...');
    
    // Run the command directly on the repo (using format: owner/repo)
    const result = await new Promise<string>((resolve, reject) => {
      let output = '';
      const child = spawn('node', [cliPath, 'docs', 'test-owner/test-repo', '--include', 'utils.js', '--test'], {
        env: process.env
      });

      child.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString());
      });

      child.stderr.on('data', (data) => {
        const stderr = data.toString();
        console.error('stderr:', stderr);
        if (stderr.includes('ERROR')) {
          output += stderr;
        }
      });

      child.on('close', (code) => {
        if (code === 0 || output.includes('JSDoc')) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${output}`));
        }
      });
    });
    
    // Verify the file was modified with JSDoc comments
    const afterContent = readFileSync(join(tempDir, 'utils.js'), 'utf8');
    
    // Check for JSDoc patterns after command execution
    expect(afterContent).toContain('/**');
    expect(afterContent).toContain('@param');
    expect(afterContent).toContain('@returns');
    expect(afterContent).toContain('multiply');
  });
  
  test('should skip files with existing JSDoc comments', async () => {
    // Verify the file already has JSDoc comments
    const beforeContent = readFileSync(join(tempDir, 'index.js'), 'utf8');
    expect(beforeContent).toContain('/**');
    
    // Run the command on a file that already has JSDoc
    console.log('Running docs command on file with existing JSDoc...');
    
    // Run the command directly on the repo (using format: owner/repo)
    const result = await new Promise<string>((resolve, reject) => {
      let output = '';
      const child = spawn('node', [cliPath, 'docs', 'test-owner/test-repo', '--include', 'index.js', '--test'], {
        env: process.env
      });

      child.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString());
      });

      child.stderr.on('data', (data) => {
        const stderr = data.toString();
        console.error('stderr:', stderr);
        if (stderr.includes('ERROR')) {
          output += stderr;
        }
      });

      child.on('close', (code) => {
        if (code === 0 || output.includes('JSDoc')) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${output}`));
        }
      });
    });
    
    // Verify the file wasn't changed
    const afterContent = readFileSync(join(tempDir, 'index.js'), 'utf8');
    expect(afterContent).toBe(beforeContent);
  });
}); 