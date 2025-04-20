import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { spawnCmd } from './processCmd';

// Test repository structure
const TEST_REPO_FILES = {
  'package.json': JSON.stringify({
    name: 'test-package',
    version: '1.0.0',
    dependencies: { react: '^18.0.0' },
    devDependencies: { jest: '^29.0.0' },
  }, null, 2),
  'src/component.tsx': `
import React from 'react';

export const MyComponent = () => {
  return <div>Hello Test</div>;
};
`,
  '.gitignore': 'node_modules\ndist\n',
};

// Test environment setup
let tempDir: string;
let cliPath: string;
let repoDir: string;

test.beforeAll(async () => {
  // Find the CLI path - using the distribution build
  cliPath = resolve(process.cwd(), 'dist', 'main.js');

  // Create a separate directory for test files
  tempDir = join(tmpdir(), `test-cmd-e2e-${Date.now()}`);
  repoDir = join(tempDir, 'test-repo');
  mkdirSync(join(repoDir, 'src'), { recursive: true });

  // Create test files
  for (const [filePath, content] of Object.entries(TEST_REPO_FILES)) {
    const fullPath = join(repoDir, filePath);
    mkdirSync(resolve(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }

  // Set up Git repo
  try {
    execSync('git init', { cwd: repoDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'pipe' });
    execSync('git config init.defaultBranch main', { cwd: repoDir, stdio: 'pipe' });
    execSync('git add .', { cwd: repoDir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: repoDir, stdio: 'pipe' });
    console.log('Test Git repository initialized:', repoDir);
  } catch (error) {
    console.error('Git initialization failed:', error);
  }
});

test.afterAll(async () => {
  // Clean up
  if (tempDir && existsSync(tempDir)) {
    console.log('Cleaning up test directory:', tempDir);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test.describe('Test Command E2E Tests', () => {
  test.setTimeout(60000);

  test('should run test generation analysis on the target repository', {
    tag: ['@cmd:stoked_test', '@opt:stoked_test_--types', '@opt:stoked_test_--framework', '@opt:stoked_test_--llm-mode']
  }, async () => {
    const command = 'test';
    const args = [
      repoDir,
      '--types=unit',
      '--framework=jest',
      '--llm-mode=MOCK'
    ];
 
    // Construct the command string to pass
    const commandWithArgs = `${command} ${args.join(' ')}`;

    // Fix: Pass arguments in the correct order: commandWithArgs, cwd, env
    const child = spawnCmd(commandWithArgs, repoDir, undefined);

    let stdout = '';
    let stderr = '';
    const outputPromise = new Promise<number | null>((resolve, reject) => {
      if (!child) {
        reject(new Error('Child process failed to spawn.'));
        return;
      }
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          console.log('stdout:', output);
        });
      } else {
        console.error('Child process or stdout stream is null/undefined.');
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          const errorOutput = data.toString();
          stderr += errorOutput;
          console.error('stderr:', errorOutput);
        });
      } else {
        console.error('Child process or stderr stream is null/undefined.');
      }

      child.on('close', (code) => {
        console.log(`Command exited with code ${code}`);
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`Command failed with code ${code}:\nStderr: ${stderr}\nStdout: ${stdout}`));
        }
      });

      child.on('error', (err) => {
        console.error('Spawn error:', err);
        reject(err);
      });
    });

    await expect(outputPromise).resolves.toBe(0);

    expect(stdout).toContain('Analyzing repository structure');
    expect(stdout).toContain('Generating test recommendations');
    expect(stdout).toContain('src/component.tsx');
  });
}); 