import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spawnCmd } from './processCmd';

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
let cliCmd: string;
let stokedConfigDir: string;

test.beforeAll(async () => {
  // Find the CLI path - using the distribution build
  cliCmd = 'stoked';
  
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

test.describe('Docs Command E2E Tests', () => {
  test('should generate JSDoc comments for files without them', {
    tag: ['@cmd:stoked_docs', '@opt:stoked_docs_--repo-path', '@opt:stoked_docs_--include', '@opt:stoked_docs_--no-analysis', '@opt:stoked_docs_--test']
  }, async () => {
    return new Promise((resolve, reject) => {
      // Verify file doesn't have JSDoc initially
      const beforeContent = readFileSync(join(tempDir, 'utils.js'), 'utf8');
      expect(beforeContent).not.toContain('/**');
      
      console.log('Running docs command on test file...');
      const command = 'docs';
      const args = [
        `--repo-path=${tempDir}`,
        `--include=${join(tempDir, 'utils.js')}`,
        '--no-analysis',
        '--test', // Added test flag
      ];
      const child = spawnCmd(command, args.join(' '), tempDir);

      let output = '';
      let errorOutput = '';

      // Add null check for child before adding listener
      if (!child) {
        reject(new Error('Child process failed to spawn.'));
        return;
      }
      child.on('error', reject);

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          output += data.toString();
          console.log(`stdout: ${data}`);
        });
      } else {
        console.error("Child process stdout stream is null.");
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          errorOutput += data.toString();
          console.error(`stderr: ${data}`);
        });
      } else {
        console.error("Child process stderr stream is null.");
      }

      child.on('close', (code) => {
        if (code === 0) {
          console.log('Command output:', output);
          
          // Verify the file was modified with JSDoc comments
          const afterContent = readFileSync(join(tempDir, 'utils.js'), 'utf8');
          
          // Check for JSDoc patterns after command execution
          expect(afterContent).toContain('/**');
          expect(afterContent).toContain('@param');
          expect(afterContent).toContain('@returns');
          expect(afterContent).toContain('multiply');
          resolve(); // Resolve the Promise on success
        } else {
          console.error('Command error output:', errorOutput);
          reject(new Error(`Command failed with code ${code}: ${errorOutput}`)); // Reject on failure
        }
      });
    });
  });
  
  test('should not modify files with existing JSDoc comments', {
    tag: ['@cmd:stoked_docs', '@opt:stoked_docs_--repo-path', '@opt:stoked_docs_--include', '@opt:stoked_docs_--no-analysis', '@opt:stoked_docs_--test']
  }, async () => {
    return new Promise((resolve, reject) => {
      // Verify the file already has JSDoc comments
      const beforeContent = readFileSync(join(tempDir, 'index.js'), 'utf8');
      expect(beforeContent).toContain('/**');
      
      console.log('Running docs command on file with existing JSDoc...');
      const command = 'docs';
      const args = [
        `--repo-path=${tempDir}`,
        `--include=${join(tempDir, 'index.js')}`,
        '--no-analysis',
        '--test', // Added test flag
      ];
      const child = spawnCmd(command, args.join(' '), tempDir);
        
      let output = '';
      let errorOutput = '';

      // Add null check for child before adding listener
      if (!child) {
        reject(new Error('Child process failed to spawn.'));
        return;
      }
      child.on('error', reject);

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          output += data.toString();
          console.log(`stdout: ${data}`);
        });
      } else {
        console.error("Child process stdout stream is null.");
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          errorOutput += data.toString();
          console.error(`stderr: ${data}`);
        });
      } else {
        console.error("Child process stderr stream is null.");
      }

      child.on('close', (code) => {
        if (code === 0) {
          console.log('Command output:', output);
          
          // Verify the file wasn't changed
          const afterContent = readFileSync(join(tempDir, 'index.js'), 'utf8');
          expect(afterContent).toBe(beforeContent);
          resolve(); // Resolve the Promise on success
        } else {
          console.error('Command error output:', errorOutput);
          reject(new Error(`Command failed with code ${code}: ${errorOutput}`)); // Reject on failure
        }
      });
    });
  });
}); 