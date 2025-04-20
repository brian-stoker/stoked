import { test, expect } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { execCmd } from './processCmd';


// Get current directory using import.meta.url for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test environment setup
let testWorkspaceRoot: string;

test.beforeAll(async () => {
  // Create a temporary directory for tests
  testWorkspaceRoot = path.join(os.tmpdir(), `stoked-test-${Date.now()}`);
  fs.mkdirSync(path.join(testWorkspaceRoot, 'temp'), { recursive: true });
  
  // Set environment variable for the CLI to use
  process.env.STOKED_WORKSPACE_ROOT = testWorkspaceRoot;
});

test.afterAll(async () => {
  // Clean up the temporary nestalsoasnendirectory
  if (testWorkspaceRoot && fs.existsSync(testWorkspaceRoot)) {
    fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
  }
});

test.describe('CLI Commands E2E Tests', () => {
  const cliCmd = 'stoked';
  
  test('should display help information when no command is provided', { 
    tag: ['@cmd:stoked'] 
  }, async () => {
    const { stdout } = await execCmd();
    
    // Verify help text is displayed
    expect(stdout).toContain('Usage: stoked');
    expect(stdout).toContain('Options:');
    expect(stdout).toContain('Commands:');
  });
  
  test('should display command help when --help is provided', { 
    tag: ['@cmd:stoked_test', '@opt:stoked_test_--help'] 
  }, async () => {
    const { stdout } = await execCmd('test', '--help');
    
    // Verify help text for test command is displayed
    expect(stdout).toContain('Usage: stoked test');
    expect(stdout).toContain('Generate tests for a repository');
    expect(stdout).toContain('Options:');
  });
  
  test('should list all available commands', { 
    tag: ['@cmd:stoked', '@opt:stoked_--help'] 
  }, async () => {
    const { stdout } = await execCmd(undefined, '--help');
    
    // Verify all commands are listed
    expect(stdout).toContain('test');
    expect(stdout).toContain('docs');
    expect(stdout).toContain('llm');
  });
  
  test('should execute help command', { 
    tag: ['@cmd:stoked', '@opt:stoked_--help'] 
  }, async () => {
    const { stdout } =await execCmd(undefined, '--help');
    // Verify usage information is displayed
    expect(stdout).toContain('Usage: stoked');
    expect(stdout).toContain('Options:');
    expect(stdout).toContain('Commands:');
  });

  test('should execute version command', { 
    tag: ['@cmd:stoked', '@opt:stoked_--version'] 
  }, async () => {
    const { stdout } = await execCmd('--version');
    
    // Verify version is displayed
    expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Match semver pattern
  });

  test('should error with a helpful message when command is invalid', async () => {
    try {
      await execCmd('nonexistent-command');
    } catch (error) {
      // We expect this to fail, so we'll check the stderr
      expect(error.stderr).toContain('error: unknown command');
    }
  });
}); 