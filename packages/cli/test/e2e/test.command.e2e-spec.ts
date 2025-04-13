import { Test } from '@nestjs/testing';
import { TestCommand } from '../../src/modules/test/test.command.js';
import { LlmService } from '../../src/modules/llm/llm.service.js';
import { ThemeLogger } from '../../src/logger/theme.logger.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('TestCommand E2E', () => {
  let testCommand: TestCommand;
  let mockLlmService: Partial<LlmService>;
  let mockThemeLogger: Partial<ThemeLogger>;
  let tempDir: string;
  
  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stoked-test-'));
    
    // Mock LLM service
    mockLlmService = {
      query: vi.fn().mockResolvedValue('Test response'),
    };
    
    // Mock ThemeLogger
    mockThemeLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    
    const moduleRef = await Test.createTestingModule({
      providers: [
        TestCommand,
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
        {
          provide: ThemeLogger,
          useValue: mockThemeLogger,
        },
      ],
    }).compile();
    
    testCommand = moduleRef.get<TestCommand>(TestCommand);
  });
  
  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  it('should analyze a repository and generate test recommendations', async () => {
    // Create a mock repository structure
    const repoDir = path.join(tempDir, 'test-repo');
    fs.mkdirSync(repoDir);
    
    // Create package.json
    fs.writeFileSync(
      path.join(repoDir, 'package.json'),
      JSON.stringify({
        name: 'test-package',
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
        devDependencies: {
          jest: '^29.0.0',
          '@testing-library/react': '^14.0.0',
        },
      })
    );
    
    // Create a simple React component
    fs.mkdirSync(path.join(repoDir, 'src'));
    fs.writeFileSync(
      path.join(repoDir, 'src', 'Button.tsx'),
      `
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return (
    <button onClick={onClick}>
      {label}
    </button>
  );
};
`
    );
    
    // Create a .gitignore file
    fs.writeFileSync(
      path.join(repoDir, '.gitignore'),
      'node_modules\ndist\nbuild\n.git\ncoverage'
    );
    
    // Run the test command
    await testCommand.run([repoDir], {
      types: 'unit',
      framework: 'jest',
    });
    
    // Verify that the LLM service was called
    expect(mockLlmService.query).toHaveBeenCalled();
    
    // Verify that the logger was called
    expect(mockThemeLogger.log).toHaveBeenCalled();
  }, { timeout: 30000 });
  
  it('should handle monorepo structure correctly', async () => {
    // Create a mock monorepo structure
    const monorepoDir = path.join(tempDir, 'monorepo');
    fs.mkdirSync(monorepoDir);
    
    // Create lerna.json
    fs.writeFileSync(
      path.join(monorepoDir, 'lerna.json'),
      JSON.stringify({
        packages: ['packages/*'],
      })
    );
    
    // Create root package.json
    fs.writeFileSync(
      path.join(monorepoDir, 'package.json'),
      JSON.stringify({
        name: 'monorepo-root',
        private: true,
      })
    );
    
    // Create a package
    const packageDir = path.join(monorepoDir, 'packages', 'ui-components');
    fs.mkdirSync(packageDir, { recursive: true });
    
    // Create package.json for the UI components package
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@monorepo/ui-components',
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
        devDependencies: {
          jest: '^29.0.0',
          '@testing-library/react': '^14.0.0',
        },
      })
    );
    
    // Create a simple React component
    fs.mkdirSync(path.join(packageDir, 'src'));
    fs.writeFileSync(
      path.join(packageDir, 'src', 'Button.tsx'),
      `
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return (
    <button onClick={onClick}>
      {label}
    </button>
  );
};
`
    );
    
    // Run the test command
    await testCommand.run([monorepoDir], {
      types: 'unit',
      framework: 'jest',
    });
    
    // Verify that the LLM service was called
    expect(mockLlmService.query).toHaveBeenCalled();
    
    // Verify that the logger was called
    expect(mockThemeLogger.log).toHaveBeenCalled();
  }, { timeout: 30000 });
  
  it('should handle different repository types correctly', async () => {
    // Test frontend-web repository
    const frontendWebDir = path.join(tempDir, 'frontend-web');
    fs.mkdirSync(frontendWebDir);
    
    fs.writeFileSync(
      path.join(frontendWebDir, 'package.json'),
      JSON.stringify({
        name: 'frontend-web',
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
        devDependencies: {
          jest: '^29.0.0',
          '@testing-library/react': '^14.0.0',
          cypress: '^12.0.0',
        },
      })
    );
    
    // Test backend-api repository
    const backendApiDir = path.join(tempDir, 'backend-api');
    fs.mkdirSync(backendApiDir);
    
    fs.writeFileSync(
      path.join(backendApiDir, 'package.json'),
      JSON.stringify({
        name: 'backend-api',
        dependencies: {
          express: '^4.18.2',
          mongoose: '^7.0.0',
        },
        devDependencies: {
          jest: '^29.0.0',
        },
      })
    );
    
    // Test frontend-mobile repository
    const frontendMobileDir = path.join(tempDir, 'frontend-mobile');
    fs.mkdirSync(frontendMobileDir);
    
    fs.writeFileSync(
      path.join(frontendMobileDir, 'package.json'),
      JSON.stringify({
        name: 'frontend-mobile',
        dependencies: {
          'react-native': '^0.72.0',
        },
        devDependencies: {
          jest: '^29.0.0',
        },
      })
    );
    
    // Run the test command for each repository type
    await testCommand.run([frontendWebDir], { types: 'unit' });
    await testCommand.run([backendApiDir], { types: 'unit' });
    await testCommand.run([frontendMobileDir], { types: 'unit' });
    
    // Verify that the LLM service was called for each repository
    expect(mockLlmService.query).toHaveBeenCalledTimes(3);
  }, { timeout: 30000 });
  
  it('should handle test framework detection correctly', async () => {
    // Create a repository with multiple test frameworks
    const repoDir = path.join(tempDir, 'multi-framework');
    fs.mkdirSync(repoDir);
    
    fs.writeFileSync(
      path.join(repoDir, 'package.json'),
      JSON.stringify({
        name: 'multi-framework',
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
        devDependencies: {
          jest: '^29.0.0',
          '@testing-library/react': '^14.0.0',
          cypress: '^12.0.0',
          'playwright': '^1.40.0',
        },
      })
    );
    
    // Run the test command with different framework options
    await testCommand.run([repoDir], { framework: 'jest' });
    await testCommand.run([repoDir], { framework: 'cypress' });
    await testCommand.run([repoDir], { framework: 'playwright' });
    
    // Verify that the LLM service was called for each framework
    expect(mockLlmService.query).toHaveBeenCalledTimes(3);
  }, { timeout: 30000 });
}); 