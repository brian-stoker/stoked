import { test, expect } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

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
  // Clean up the temporary directory
  if (testWorkspaceRoot && fs.existsSync(testWorkspaceRoot)) {
    fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
  }
});

test.describe('CLI Commands E2E Tests', () => {
  test('should display help information when no command is provided', async () => {
    const { stdout } = await execAsync('node dist/main.js');
    
    // Verify help text is displayed
    expect(stdout).toContain('Usage: stoked');
    expect(stdout).toContain('Options:');
    expect(stdout).toContain('Commands:');
  });
  
  test('should display command help when --help is provided', async () => {
    const { stdout } = await execAsync(`node dist/main.js test --help`);
    
    // Verify help text for test command is displayed
    expect(stdout).toContain('Usage: stoked test');
    expect(stdout).toContain('Generate tests for a repository');
    expect(stdout).toContain('Options:');
  });
  
  test('should list all available commands', async () => {
    const { stdout } = await execAsync('node dist/main.js --help');
    
    // Verify all commands are listed
    expect(stdout).toContain('test');
    expect(stdout).toContain('jsdocs');
    expect(stdout).toContain('llm');
  });
  
  test('should execute version command', async () => {
    const { stdout } = await execAsync('node dist/main.js --version');
    
    // Verify version is displayed
    expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Match semver pattern
  });
  
  test('should error with a helpful message when command is invalid', async () => {
    try {
      await execAsync('node dist/main.js nonexistent-command');
    } catch (error) {
      // We expect this to fail, so we'll check the stderr
      expect(error.stderr).toContain('error: unknown command');
    }
  });
}); 