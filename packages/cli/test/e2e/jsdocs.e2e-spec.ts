import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  tempDir = join(tmpdir(), `jsdoc-test-${Date.now()}`);
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
  const homeDir = tmpdir();
  stokedConfigDir = join(homeDir, '.stoked');
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
  
  // Backup any existing config
  if (existsSync(configPath)) {
    copyFileSync(configPath, join(stokedConfigDir, `config.json.backup-${Date.now()}`));
  }
  
  // Write our test config
  writeFileSync(configPath, JSON.stringify(configData, null, 2));
  
  console.log('Test environment set up:');
  console.log('- Test repo:', tempDir);
  console.log('- Stoked config:', configPath);
});

test.afterAll(async () => {
  // Clean up
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  
  // Restore config from backup if it exists
  const configPath = join(stokedConfigDir, 'config.json');
  const backups = readdirSync(stokedConfigDir)
    .filter(file => file.startsWith('config.json.backup-'))
    .sort();
    
  if (backups.length > 0) {
    const latestBackup = backups[backups.length - 1];
    copyFileSync(join(stokedConfigDir, latestBackup), configPath);
    
    // Clean up backups
    backups.forEach(backup => {
      unlinkSync(join(stokedConfigDir, backup));
    });
  }
});

test('JSDoc Command E2E Tests', async () => {
  test('should generate JSDoc comments', async () => {
    // Verify file doesn't have JSDoc initially
    const beforeContent = readFileSync(join(tempDir, 'utils.js'), 'utf8');
    expect(beforeContent).not.toContain('/**');
    
    // Run the actual CLI command on the file
    console.log('Running JSDoc command on test file...');
    
    // Use the file path relative to the repo root
    const result = await new Promise<string>((resolve, reject) => {
      let output = '';
      const child = spawn('node', [cliPath, 'jsdocs', 'test-owner/test-repo', '--include', 'utils.js'], {
        env: {
          ...process.env
        }
      });

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        console.error('stderr:', data.toString());
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
    });
    
    console.log('Command output:', result);
    
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
    console.log('Running JSDoc command on file with existing JSDoc...');
    
    // Use the file path relative to the repo root
    const result = await new Promise<string>((resolve, reject) => {
      let output = '';
      const child = spawn('node', [cliPath, 'jsdocs', 'test-owner/test-repo', '--include', 'index.js'], {
        env: {
          ...process.env
        }
      });

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        console.error('stderr:', data.toString());
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
    });
    
    console.log('Command output:', result);
    
    // Verify the file wasn't changed
    const afterContent = readFileSync(join(tempDir, 'index.js'), 'utf8');
    expect(afterContent).toBe(beforeContent);
  });
}); 