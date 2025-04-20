import { Test } from '@nestjs/testing';
import { AnalyzeCommand } from '../../../../src/modules/analyze/analyze.command.js';
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
const mockLoggerVerbose = vi.hoisted(() => vi.fn());
const mockLoggerDebug = vi.hoisted(() => vi.fn());
const mockLoggerFatal = vi.hoisted(() => vi.fn());
const mockSetTheme = vi.hoisted(() => vi.fn());

// Full ThemeLogger mock implementation
const createMockThemeLogger = () => ({
  log: mockLoggerLog,
  error: mockLoggerError,
  warn: mockLoggerWarn,
  verbose: mockLoggerVerbose,
  debug: mockLoggerDebug,
  fatal: mockLoggerFatal,
  setTheme: mockSetTheme,
  getProvider: vi.fn().mockReturnValue('console')
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

describe('AnalyzeCommand', () => {
  let analyzeCommand: AnalyzeCommand;
  let mockLlmService: Partial<LlmService>;
  let mockThemeLogger: ReturnType<typeof createMockThemeLogger>;
  
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock package.json content
    mockFsReadFileSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-package',
          version: '1.5.0',
        });
      }
      if (typeof filePath === 'string' && filePath.endsWith('analysis.yml')) {
        return '';
      }
      throw new Error(`Unexpected file read: ${filePath}`);
    });
    
    // Mock LLM service
    mockLlmService = {
      query: vi.fn().mockResolvedValue('Test response'),
      getName: vi.fn().mockReturnValue('Test LLM'),
      getVersion: vi.fn().mockReturnValue('1.0'),
    };
    
    // Use the complete ThemeLogger mock
    mockThemeLogger = createMockThemeLogger();
    
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyzeCommand,
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
    
    analyzeCommand = moduleRef.get<AnalyzeCommand>(AnalyzeCommand);
    
    // Manually set the logger property to fix injection issues
    Object.defineProperty(analyzeCommand, 'logger', {
      value: mockThemeLogger,
      writable: true,
      configurable: true
    });
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('run', () => {
    it('should error when repository parameter is missing', async () => {
      // Act
      await analyzeCommand.run([], {});
      
      // Assert
      expect(mockThemeLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error analyzing repository')
      );
    });
    
    it('should error when repository format is invalid', async () => {
      // Act
      await analyzeCommand.run(['invalid-format'], {});
      
      // Assert
      expect(mockThemeLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid repository format')
      );
    });
    
    it('should start repository analysis when valid repository is provided', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Arrange
      mockFsReaddirSync.mockImplementation((dirPath) => {
        if (dirPath === 'test-repo') {
          return ['package.json'];
        }
        if (dirPath === 'test-monorepo') {
          return ['packages', 'package.json'];
        }
        if (dirPath === 'test-monorepo/packages') {
          return ['package-1', 'package-2'];
        }
        if (dirPath === 'test-monorepo/packages/package-1' || dirPath === 'test-monorepo/packages/package-2') {
          return ['package.json'];
        }
        return [];
      });

      mockFsStatSync.mockImplementation((path) => ({
        isDirectory: () => {
          return path === 'test-repo' || 
                 path === 'test-monorepo' || 
                 path === 'test-monorepo/packages' || 
                 path === 'test-monorepo/packages/package-1' || 
                 path === 'test-monorepo/packages/package-2';
        },
        isFile: () => path.endsWith('package.json') || path.endsWith('analysis.yml')
      }));
      
      // Act
      await analyzeCommand.run(['facebook/react'], {});
      
      // Assert
      expect(mockThemeLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Analyzing repository: facebook/react')
      );
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.any(String)
      );
    });
    
    it('should analyze a single package repository', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Mock file structure (not a monorepo)
      mockFsReaddirSync.mockReturnValueOnce(['package.json', 'src']); // Root files
      mockFsStatSync.mockImplementation((path) => ({
        isDirectory: () => path.includes('src'),
      }));
      
      // Act
      await analyzeCommand.run(['facebook/react'], {});
      
      // Assert
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/packageVersion: '1\.0\.0'/)
      );
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/analyzerVersion: '[^']+'/)
      );
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/llmModel: 'Test LLM'/)
      );
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/llmVersion: '1\.0'/)
      );
    });
    
    it('should create analysis for all packages in a monorepo', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Mock file structure (monorepo with multiple packages)
      mockFsReaddirSync.mockReturnValueOnce(['package.json', 'packages']); // Root files
      mockFsReaddirSync.mockReturnValueOnce(['package1', 'package2']); // Packages in monorepo
      mockFsStatSync.mockImplementation((path) => ({
        isDirectory: () => path.includes('package1') || path.includes('package2') || path.includes('packages'),
      }));
      
      // Act
      await analyzeCommand.run(['facebook/react'], {});
      
      // Assert
      // Should create analysis.yml for each package
      expect(mockFsWriteFileSync).toHaveBeenCalledTimes(2);
    });
    
    it('should create analysis folder structure mirroring the project', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Mock file structure with src directories and files
      mockFsReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('src')) {
          return ['component1.tsx', 'component2.tsx', 'utils'];
        } else if (dirPath.includes('utils')) {
          return ['helpers.ts'];
        }
        return ['package.json', 'src'];
      });
      
      mockFsStatSync.mockImplementation((path) => ({
        isDirectory: () => path.includes('src') || path.includes('utils'),
      }));
      
      // Act
      await analyzeCommand.run(['facebook/react'], {});
      
      // Assert
      // Should create analysis dir and mirror the structure
      expect(mockFsMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('analysis', 'src')),
        expect.any(Object)
      );
      expect(mockFsMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('analysis', 'src', 'utils')),
        expect.any(Object)
      );
      
      // Should create analysis files for each code file
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('analysis', 'src', 'component1.tsx.yml')),
        expect.any(String)
      );
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('analysis', 'src', 'component2.tsx.yml')),
        expect.any(String)
      );
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('analysis', 'src', 'utils', 'helpers.ts.yml')),
        expect.any(String)
      );
    });

    it('should detect and classify a frontend web application', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Mock package.json with React dependencies
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            name: 'web-app',
            version: '1.0.0',
            dependencies: {
              'react': '^18.0.0',
              'react-dom': '^18.0.0',
              'react-router-dom': '^6.0.0'
            }
          });
        }
        return '';
      });
      
      // Mock file structure with common web app files
      mockFsReaddirSync.mockReturnValueOnce(['package.json', 'src', 'public', 'index.html']); // Root files
      mockFsStatSync.mockImplementation((path) => ({
        isDirectory: () => path.includes('src') || path.includes('public'),
      }));
      
      // Act
      await analyzeCommand.run(['web-project/app'], {});
      
      // Assert - Check for frontend-web classification
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/classifications:(?:[\s\S]*?)- 'frontend-web'/)
      );
      // Check for language detection
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/languages:(?:[\s\S]*?)- 'TypeScript'/)
      );
    });
    
    it('should detect and classify a frontend mobile application', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Mock package.json with React Native dependencies
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            name: 'mobile-app',
            version: '1.0.0',
            dependencies: {
              'react': '^18.0.0',
              'react-native': '^0.70.0',
              'expo': '^47.0.0'
            }
          });
        }
        return '';
      });
      
      // Mock mobile app file structure
      mockFsReaddirSync.mockReturnValueOnce(['package.json', 'App.js', 'app.json', 'babel.config.js']);
      
      // Act
      await analyzeCommand.run(['mobile-project/app'], {});
      
      // Assert - Check for frontend-mobile classification
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/classifications:(?:[\s\S]*?)- 'frontend-mobile'/)
      );
      // Check for language detection
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/languages:(?:[\s\S]*?)- 'JavaScript'/)
      );
    });
    
    it('should detect and classify a backend API', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Mock package.json with backend dependencies
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            name: 'api-server',
            version: '1.0.0',
            dependencies: {
              'express': '^4.18.2',
              'mongoose': '^7.0.0',
              'cors': '^2.8.5'
            }
          });
        }
        return '';
      });
      
      // Mock backend API file structure
      mockFsReaddirSync.mockReturnValueOnce(['package.json', 'src', 'controllers', 'routes']);
      mockFsStatSync.mockImplementation((path) => ({
        isDirectory: () => path.includes('src') || path.includes('controllers') || path.includes('routes'),
      }));
      
      // Act
      await analyzeCommand.run(['backend-project/api'], {});
      
      // Assert - Check for backend-api classification
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/classifications:(?:[\s\S]*?)- 'backend-api'/)
      );
      // Check for language detection
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/languages:(?:[\s\S]*?)- 'JavaScript'/)
      );
    });
    
    it('should detect and classify a package with multiple classifications', async () => {
      // Mock exec for clone repository to return successfully
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      // Mock package.json with mixed frontend/backend dependencies
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
          return JSON.stringify({
            name: 'fullstack-lib',
            version: '1.0.0',
            dependencies: {
              'react': '^18.0.0',  // Frontend indicator
              'express': '^4.18.2' // Backend indicator
            }
          });
        }
        return '';
      });
      
      // Mock file structure with both frontend and backend indicators
      mockFsReaddirSync.mockReturnValueOnce(['package.json', 'client', 'server']);
      mockFsStatSync.mockImplementation((path) => ({
        isDirectory: () => path.includes('client') || path.includes('server'),
      }));
      
      // Act
      await analyzeCommand.run(['fullstack/project'], {});
      
      // Assert - Check for multiple classifications
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/classifications:(?:[\s\S]*?)- 'frontend-lib'(?:[\s\S]*?)- 'backend-lib'/)
      );
      // Check for multiple language detection
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis.yml'),
        expect.stringMatching(/languages:(?:[\s\S]*?)- 'JavaScript'(?:[\s\S]*?)- 'TypeScript'/)
      );
    });
  });
  
  describe('option parsing', () => {
    it('should handle --no-analysis option correctly', async () => {
      // Act
      await analyzeCommand.parseNoAnalysis();
      
      // Assert - this option should be recognized and set a property 
      expect(analyzeCommand).toHaveProperty('skipAnalysis', true);
    });
    
    it('should handle --verbose option correctly', async () => {
      // Act
      await analyzeCommand.parseVerbose();
      
      // Assert
      expect(analyzeCommand).toHaveProperty('verbose', true);
    });
  });

  describe('getAnalyzerVersion', () => {
    it('should correctly return the analyzer version from package.json', () => {
      // Access the private method using type assertion
      const result = (analyzeCommand as any).getAnalyzerVersion();
      
      // Assert
      expect(result).toBe('1.5.0');
      expect(mockFsReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('package.json'),
        'utf8'
      );
    });
    
    it('should return a default version if package.json read fails', () => {
      // Mock readFileSync to throw an error
      mockFsReadFileSync.mockImplementationOnce(() => {
        throw new Error('File not found');
      });
      
      // Access the private method using type assertion
      const result = (analyzeCommand as any).getAnalyzerVersion();
      
      // Assert
      expect(result).toBe('0.0.0');
    });
    
    it('should return a default version if package.json has no version', () => {
      // Mock package.json without version
      mockFsReadFileSync.mockImplementationOnce(() => JSON.stringify({ name: 'test-package' }));
      
      // Access the private method using type assertion
      const result = (analyzeCommand as any).getAnalyzerVersion();
      
      // Assert
      expect(result).toBe('0.0.0');
    });
  });
}); 