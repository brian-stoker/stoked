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
const mockFsReaddirSync = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockFsStatSync = vi.hoisted(() => vi.fn().mockReturnValue({ isDirectory: () => false }));
const mockExec = vi.hoisted(() => vi.fn().mockResolvedValue({ stdout: 'mocked output', stderr: '' }));
const mockExecSync = vi.hoisted(() => vi.fn().mockReturnValue('mocked output'));
const mockLoggerLog = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockProcessExit = vi.hoisted(() => vi.fn());
const mockFsRmSync = vi.hoisted(() => vi.fn());
const mockFsUnlinkSync = vi.hoisted(() => vi.fn());

// Mock process.exit
vi.stubGlobal('process', {
  ...process,
  exit: mockProcessExit
});

// Mock fs module
vi.mock('fs', () => {
  return {
    existsSync: mockFsExistsSync,
    mkdirSync: mockFsMkdirSync,
    readFileSync: mockFsReadFileSync,
    writeFileSync: mockFsWriteFileSync,
    readdirSync: mockFsReaddirSync,
    statSync: mockFsStatSync,
    rmSync: mockFsRmSync,
    unlinkSync: mockFsUnlinkSync,
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
  let mockThemeLogger: Partial<ThemeLogger>;
  
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock successful file operations by default
    mockFsExistsSync.mockReturnValue(true);
    mockFsWriteFileSync.mockImplementation(() => undefined);
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
    
    // Mock ThemeLogger
    mockThemeLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      setTheme: vi.fn(),
      verbose: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
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
    vi.clearAllMocks();
  });
  
  describe('run', () => {
    it('should error when repository parameter is missing', async () => {
      // Act
      await testCommand.run([], {});
      
      // Assert
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Error generating tests')
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
    
    it('should handle the --unit flag correctly', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Act
      await testCommand.run(['facebook/react'], {
        unit: true,
      });
      
      // Assert
      expect(mockLoggerLog).toHaveBeenCalledWith(
        expect.stringContaining('Test types to generate: unit')
      );
    });
    
    it('should handle the --framework flag correctly', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Act
      await testCommand.run(['facebook/react'], {
        framework: 'jest',
      });
      
      // Assert
      expect(mockLoggerLog).toHaveBeenCalledWith(
        expect.stringContaining('Analyzing repository: facebook/react')
      );
    });
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
    
    it('should detect frontend-mobile repository', async () => {
      // Mock package.json with React Native
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            dependencies: {
              'react-native': '^0.72.0',
            },
          });
        }
        return '';
      });
      
      // Act
      const result = await (testCommand as any).analyzeRepositoryType('/test/repo');
      
      // Assert
      expect(result.type).toBe('frontend-mobile');
    });
    
    it('should detect frontend-lib repository', async () => {
      // Mock package.json with component library indicators
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            name: 'ui-components',
            keywords: ['components', 'ui-library'],
          });
        }
        return '';
      });
      
      // Act
      const result = await (testCommand as any).analyzeRepositoryType('/test/repo');
      
      // Assert
      expect(result.type).toBe('frontend-lib');
    });
    
    it('should detect backend-lib repository', async () => {
      // Mock package.json with backend library indicators
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            name: 'api-utils',
            keywords: ['backend', 'server'],
          });
        }
        return '';
      });
      
      // Act
      const result = await (testCommand as any).analyzeRepositoryType('/test/repo');
      
      // Assert
      expect(result.type).toBe('backend-lib');
    });
    
    it('should detect general-lib repository', async () => {
      // Mock package.json with general library indicators
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            name: 'utility-functions',
          });
        }
        return '';
      });
      
      // Act
      const result = await (testCommand as any).analyzeRepositoryType('/test/repo');
      
      // Assert
      expect(result.type).toBe('general-lib');
    });
    
    it('should detect monorepo structure', async () => {
      // Mock lerna.json
      mockFsExistsSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('lerna.json')) {
          return true;
        }
        return false;
      });
      
      // Mock package.json
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            name: 'monorepo-root',
          });
        }
        return '';
      });
      
      // Act
      const result = await (testCommand as any).analyzeRepositoryType('/test/repo');
      
      // Assert
      expect(result.isMonorepo).toBe(true);
    });
  });
  
  describe('detectTestFrameworks', () => {
    it('should detect Vitest as unit testing framework', async () => {
      // Mock package.json with Vitest
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            devDependencies: {
              'vitest': '^1.0.0',
            },
          });
        }
        return '';
      });
      
      // Mock existsSync for package.json and unit.config.ts
      mockFsExistsSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string') {
          if (filePath.endsWith('package.json')) {
            return true;
          }
          if (filePath.endsWith('unit.config.ts')) {
            return true;
          }
        }
        return false;
      });
      
      // Act
      const result = await (testCommand as any).detectTestFrameworks('/test/repo');
      
      // Assert
      expect(result.unit).toBe('vitest');
    });
    
    it('should detect Playwright as E2E testing framework', async () => {
      // Mock package.json with Playwright
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            devDependencies: {
              '@playwright/test': '^1.40.0',
            },
          });
        }
        return '';
      });
      
      // Mock existsSync for package.json and playwright.config.ts
      mockFsExistsSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string') {
          if (filePath.endsWith('package.json')) {
            return true;
          }
          if (filePath.endsWith('playwright.config.ts')) {
            return true;
          }
        }
        return false;
      });
      
      // Act
      const result = await (testCommand as any).detectTestFrameworks('/test/repo');
      
      // Assert
      expect(result.e2e).toBe('playwright');
    });
  });
  
  describe('determineTestTypes', () => {
    it('should use user-specified test types when provided', () => {
      // Act
      const result = (testCommand as any).determineTestTypes('frontend-web', ['unit', 'e2e']);
      
      // Assert
      expect(result).toEqual(['unit', 'e2e']);
    });
    
    it('should determine test types for frontend-web repository', () => {
      // Act
      const result = (testCommand as any).determineTestTypes('frontend-web');
      
      // Assert
      expect(result).toEqual(['unit', 'integration', 'e2e']);
    });
    
    it('should determine test types for frontend-mobile repository', () => {
      // Act
      const result = (testCommand as any).determineTestTypes('frontend-mobile');
      
      // Assert
      expect(result).toEqual(['unit', 'integration']);
    });
    
    it('should determine test types for backend-api repository', () => {
      // Act
      const result = (testCommand as any).determineTestTypes('backend-api');
      
      // Assert
      expect(result).toEqual(['unit', 'integration']);
    });
    
    it('should determine test types for library repositories', () => {
      // Act
      const frontendLibResult = (testCommand as any).determineTestTypes('frontend-lib');
      const backendLibResult = (testCommand as any).determineTestTypes('backend-lib');
      const generalLibResult = (testCommand as any).determineTestTypes('general-lib');
      
      // Assert
      expect(frontendLibResult).toEqual(['unit']);
      expect(backendLibResult).toEqual(['unit']);
      expect(generalLibResult).toEqual(['unit']);
    });
  });
  
  describe('generateUnitTests', () => {
    it('should find source files and process them', async () => {
      // Mock findSourceFiles to return some files
      const mockFiles = ['/test/repo/src/Component.tsx', '/test/repo/src/utils.ts'];
      vi.spyOn(testCommand as any, 'findSourceFiles').mockReturnValue(mockFiles);
      
      // Mock findPackageRoot to return a package path
      vi.spyOn(testCommand as any, 'findPackageRoot').mockReturnValue('/test/repo');
      
      // Mock shouldProcessPackage to return true
      vi.spyOn(testCommand as any, 'shouldProcessPackage').mockReturnValue(true);
      
      // Mock processPackage to do nothing
      vi.spyOn(testCommand as any, 'processPackage').mockResolvedValue(undefined);
      
      // Act
      await (testCommand as any).generateUnitTests('/test/repo', []);
      
      // Assert
      expect(testCommand['findSourceFiles']).toHaveBeenCalledWith('/test/repo');
      expect(testCommand['processPackage']).toHaveBeenCalled();
    });
  });
  
  describe('findSourceFiles', () => {
    it('should find React component files', () => {
      // Mock readdirSync to return some files
      mockFsReaddirSync.mockReturnValue(['Component.tsx', 'utils.ts', 'index.js']);
      
      // Mock statSync to return file stats
      mockFsStatSync.mockImplementation((filePath) => {
        return {
          isDirectory: () => false,
        };
      });
      
      // Mock isIgnored to return false
      vi.spyOn(testCommand as any, 'isIgnored').mockReturnValue(false);
      
      // Act
      const result = (testCommand as any).findSourceFiles('/test/repo');
      
      // Assert
      expect(result).toContain(path.join('/test/repo', 'Component.tsx'));
    });
  });
  
  describe('loadGitignorePatterns', () => {
    it('should load patterns from .gitignore file', () => {
      // Mock readFileSync to return gitignore content
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('.gitignore')) {
          return 'node_modules\ndist\nbuild\n.git\ncoverage';
        }
        return '';
      });
      
      // Act
      const result = (testCommand as any).loadGitignorePatterns('/test/repo');
      
      // Assert
      expect(result).toContain('node_modules');
      expect(result).toContain('dist');
      expect(result).toContain('build');
      expect(result).toContain('.git');
      expect(result).toContain('coverage');
    });
  });
  
  describe('isIgnored', () => {
    it('should return true for ignored files', () => {
      // Act
      const result = (testCommand as any).isIgnored(
        '/test/repo/node_modules/package.json',
        '/test/repo',
        ['node_modules']
      );
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should return false for non-ignored files', () => {
      // Act
      const result = (testCommand as any).isIgnored(
        '/test/repo/src/Component.tsx',
        '/test/repo',
        ['node_modules']
      );
      
      // Assert
      expect(result).toBe(false);
    });
  });
}); 