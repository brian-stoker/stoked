import { Test } from '@nestjs/testing';
import { TestCommand } from '../../../../src/modules/test/test.command.js';
import { LlmService } from '../../../../src/modules/llm/llm.service.js';
import { ThemeLogger } from '../../../../src/logger/theme.logger.js';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as path from 'path';
import { Logger } from '@nestjs/common';

// Hoisted mock functions
const mockFsExistsSync = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockFsMkdirSync = vi.hoisted(() => vi.fn());
const mockFsReadFileSync = vi.hoisted(() => vi.fn());
const mockFsWriteFileSync = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn().mockResolvedValue({ stdout: 'mocked output', stderr: '' }));
const mockExecSync = vi.hoisted(() => vi.fn().mockReturnValue('mocked output'));
const mockLoggerLog = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

// Mock fs module
vi.mock('fs', () => {
  return {
    existsSync: mockFsExistsSync,
    mkdirSync: mockFsMkdirSync,
    readFileSync: mockFsReadFileSync,
    writeFileSync: mockFsWriteFileSync,
  };
});

// Mock child_process module
vi.mock('child_process', () => {
  return {
    exec: mockExec,
    execSync: mockExecSync,
  };
});

// Mock util module
vi.mock('util', () => {
  return {
    promisify: vi.fn().mockImplementation((fn) => mockExec),
  };
});

// Mock nestjs Logger
vi.mock('@nestjs/common', async () => {
  const actual = await vi.importActual('@nestjs/common');
  return {
    ...actual as object,
    Logger: vi.fn(() => ({
      log: mockLoggerLog,
      error: mockLoggerError,
      warn: mockLoggerWarn,
    })),
  };
});

describe('TestCommand', () => {
  let testCommand: TestCommand;
  let mockLlmService: Partial<LlmService>;
  
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock package.json content
    mockFsReadFileSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-package',
          dependencies: {
            react: '^18.0.0',
            jest: '^29.0.0',
          },
          devDependencies: {
            '@testing-library/react': '^14.0.0',
            'cypress': '^12.0.0',
          },
        });
      }
      return '';
    });
    
    // Mock LLM service
    mockLlmService = {
      query: vi.fn().mockResolvedValue('Test response'),
    };
    
    const moduleRef = await Test.createTestingModule({
      providers: [
        TestCommand,
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
      ],
    }).compile();
    
    testCommand = moduleRef.get<TestCommand>(TestCommand);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('run', () => {
    it('should error when repository parameter is missing', async () => {
      // Act
      await testCommand.run([], {});
      
      // Assert
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Repository parameter is required')
      );
    });
    
    it('should error when repository format is invalid', async () => {
      // Act
      await testCommand.run(['invalid-format'], {});
      
      // Assert
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid repository format')
      );
    });
    
    it('should start repository analysis when valid repository is provided', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Act
      await testCommand.run(['facebook/react'], {
        types: 'unit,integration',
        coverageTarget: 80,
      });
      
      // Assert
      expect(mockLoggerLog).toHaveBeenCalledWith(
        expect.stringContaining('Analyzing repository: facebook/react')
      );
      expect(mockFsExistsSync).toHaveBeenCalled();
    }, { timeout: 10000 }); // Increase timeout for this test
  });
  
  describe('analyzeRepositoryType', () => {
    it('should detect frontend-web repository', async () => {
      // Mock package.json with React
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            dependencies: {
              'react': '^18.0.0',
              'react-dom': '^18.0.0',
            },
          });
        }
        return '';
      });
      
      // Act
      const result = await (testCommand as any).analyzeRepositoryType('/test/repo');
      
      // Assert
      expect(result.type).toBe('frontend-web');
    });
    
    it('should detect backend-api repository', async () => {
      // Mock package.json with Express
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            dependencies: {
              'express': '^4.18.2',
              'mongoose': '^7.0.0',
            },
          });
        }
        return '';
      });
      
      // Act
      const result = await (testCommand as any).analyzeRepositoryType('/test/repo');
      
      // Assert
      expect(result.type).toBe('backend-api');
    });
  });
}); 