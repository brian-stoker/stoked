import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml'; // Make sure to add js-yaml as a dependency if not already included

test.describe('Analyze Command E2E Test', () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let testsDir: string;
  let stokedConfigDir: string;
  let srcDir: string;
  let componentFile: string;
  let utilsFile: string;
  let cliPath: string;

  test.beforeAll(async () => {
    // Create a temporary directory for tests
    tempDir = path.join(os.tmpdir(), `stoked-e2e-test-${Date.now()}`);
    testsDir = path.join(tempDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });

    // Create a src directory with a React component
    srcDir = path.join(testsDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Set up a test React component file
    componentFile = path.join(srcDir, 'Component.jsx');
    fs.writeFileSync(componentFile, `
/**
 * A simple React component
 * @component
 */
import React from 'react';

function TestComponent({ name }) {
  return (
    <div>
      <h1>Hello, {name}</h1>
    </div>
  );
}

export default TestComponent;
    `);

    // Set up a test utils file
    utilsFile = path.join(srcDir, 'utils.js');
    fs.writeFileSync(utilsFile, `
/**
 * Utility functions
 */
function formatName(firstName, lastName) {
  return \`\${firstName} \${lastName}\`;
}

export { formatName };
    `);

    // Create a package.json file
    const packageJsonPath = path.join(testsDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'react': '^18.0.0',
        'react-dom': '^18.0.0'
      }
    }, null, 2));

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
    // Set LLM_MODE to MOCK for testing
    process.env.LLM_MODE = 'MOCK';
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

  test('should generate analysis.yml file', async ({ page }) => {
    const analysisPath = path.join(testsDir, 'analysis.yml');
    
    // Make sure analysis.yml doesn't exist yet
    if (fs.existsSync(analysisPath)) {
      fs.unlinkSync(analysisPath);
    }
    
    const promise = new Promise<void>((resolve, reject) => {
      const child = spawn('node', [cliPath, 'analyze', 'tests'], {
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
    
    // Verify analysis.yml was created
    expect(fs.existsSync(analysisPath)).toBeTruthy();
    
    // Parse and verify the content
    const analysisContent = fs.readFileSync(analysisPath, 'utf8');
    const analysis = yaml.load(analysisContent) as Record<string, any>;
    
    // Check required fields in the YAML
    expect(analysis).toHaveProperty('packageVersion');
    expect(analysis).toHaveProperty('analyzerVersion');
    expect(analysis).toHaveProperty('llmModel');
    expect(analysis).toHaveProperty('llmVersion');
    expect(analysis).toHaveProperty('summary');
    expect(analysis).toHaveProperty('features');
    
    // Check for package classification
    expect(analysis).toHaveProperty('classifications');
    expect(Array.isArray(analysis.classifications)).toBeTruthy();
    // Since we created a React app, we should expect frontend-web classification
    expect(analysis.classifications).toContain('frontend-web');
    
    // Check for language detection
    expect(analysis).toHaveProperty('languages');
    expect(Array.isArray(analysis.languages)).toBeTruthy();
    // Given our test files, JavaScript should be detected
    expect(analysis.languages).toContain('JavaScript');
  });

  test('should create analysis folder with file summaries', async ({ page }) => {
    const analysisFolder = path.join(testsDir, 'analysis');
    const componentAnalysisPath = path.join(analysisFolder, 'src', 'Component.jsx.yml');
    const utilsAnalysisPath = path.join(analysisFolder, 'src', 'utils.js.yml');
    
    // First run the analysis command
    const promise = new Promise<void>((resolve, reject) => {
      const child = spawn('node', [cliPath, 'analyze', 'tests'], {
        env: process.env,
        cwd: tempDir
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
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
    
    // Verify analysis folder was created with the expected structure
    expect(fs.existsSync(analysisFolder)).toBeTruthy();
    expect(fs.existsSync(path.join(analysisFolder, 'src'))).toBeTruthy();
    
    // Verify individual file analysis YAMLs were created
    expect(fs.existsSync(componentAnalysisPath)).toBeTruthy();
    expect(fs.existsSync(utilsAnalysisPath)).toBeTruthy();
    
    // Verify content of component analysis
    const componentAnalysis = yaml.load(fs.readFileSync(componentAnalysisPath, 'utf8')) as Record<string, any>;
    expect(componentAnalysis).toHaveProperty('type', 'component');
    expect(componentAnalysis).toHaveProperty('name', 'TestComponent');
    
    // Verify content of utils analysis
    const utilsAnalysis = yaml.load(fs.readFileSync(utilsAnalysisPath, 'utf8')) as Record<string, any>;
    expect(utilsAnalysis).toHaveProperty('type', 'utility');
    expect(utilsAnalysis).toHaveProperty('functions');
  });

  test('should respect --no-analysis flag when used with docs command', async ({ page }) => {
    const analysisPath = path.join(testsDir, 'analysis.yml');
    
    // Delete any existing analysis.yml
    if (fs.existsSync(analysisPath)) {
      fs.unlinkSync(analysisPath);
    }
    
    // Run the docs command with --no-analysis flag
    const promise = new Promise<void>((resolve, reject) => {
      const child = spawn('node', [cliPath, 'docs', 'tests', '--no-analysis'], {
        env: process.env,
        cwd: tempDir
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
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
    
    // Verify analysis.yml was NOT created when --no-analysis flag is used
    expect(fs.existsSync(analysisPath)).toBeFalsy();
  });

  test('should detect multiple classifications for full-stack applications', async ({ page }) => {
    // Create a server directory to simulate a full-stack app
    const serverDir = path.join(testsDir, 'server');
    fs.mkdirSync(serverDir, { recursive: true });
    
    // Add an Express server file
    const serverFile = path.join(serverDir, 'server.js');
    fs.writeFileSync(serverFile, `
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(\`Server listening at http://localhost:\${port}\`);
});
    `);
    
    // Update package.json to include both frontend and backend dependencies
    const packageJsonPath = path.join(testsDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({
      name: 'fullstack-project',
      version: '1.0.0',
      dependencies: {
        'react': '^18.0.0',
        'react-dom': '^18.0.0',
        'express': '^4.18.2',
        'mongoose': '^7.0.0'
      }
    }, null, 2));
    
    // Run analyze command
    const promise = new Promise<void>((resolve, reject) => {
      const child = spawn('node', [cliPath, 'analyze', 'tests'], {
        env: process.env,
        cwd: tempDir
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
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
    
    // Verify analysis.yml was created
    const analysisPath = path.join(testsDir, 'analysis.yml');
    expect(fs.existsSync(analysisPath)).toBeTruthy();
    
    // Parse and verify the content
    const analysisContent = fs.readFileSync(analysisPath, 'utf8');
    const analysis = yaml.load(analysisContent) as Record<string, any>;
    
    // Should have both frontend and backend classifications
    expect(analysis).toHaveProperty('classifications');
    expect(Array.isArray(analysis.classifications)).toBeTruthy();
    // Check for both frontend and backend classifications
    expect(analysis.classifications).toContain('frontend-web');
    expect(analysis.classifications).toContain('backend-api');
    
    // Should detect JavaScript language
    expect(analysis).toHaveProperty('languages');
    expect(analysis.languages).toContain('JavaScript');
  });
}); 