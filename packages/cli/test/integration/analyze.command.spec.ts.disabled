import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { vi, MockInstance } from 'vitest';
import { AnalyzeCommand } from '../../src/modules/analyze/analyze.command';
import { AnalyzeModule } from '../../src/modules/analyze/analyze.module';
import { LlmService } from '../../src/modules/llm/llm.service';
import { ThemeLogger } from '../../src/logger/theme.logger';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock fs module
const mockFs = {
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockImplementation((path) => {
    if (typeof path === 'string' && path.endsWith('package.json')) {
      return JSON.stringify({ 
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'react': '^18.0.0',
          'react-dom': '^18.0.0'
        }
      });
    }
    return '{}';
  }),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue(['package.json', 'src']),
  statSync: vi.fn().mockImplementation((path) => ({
    isDirectory: () => typeof path === 'string' && path.includes('src')
  })),
};

vi.mock('fs', () => mockFs);

// Mock child_process module
const mockChildProcess = {
  execSync: vi.fn().mockReturnValue('mocked git output'),
  exec: vi.fn(),
};

vi.mock('child_process', () => mockChildProcess);

// Mock environment utilities
vi.mock('../../src/utils/env.js', () => ({
  getWorkspaceRoot: vi.fn().mockReturnValue('/mock/workspace/root'),
}));

// Mock ThemeLogger
vi.mock('../../src/logger/theme.logger.js', () => ({
  ThemeLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    fatal: vi.fn(),
    setTheme: vi.fn(),
    getProvider: vi.fn().mockReturnValue('mock'),
    info: vi.fn(),
    success: vi.fn(),
  })),
}));

// Mock LlmService
vi.mock('../../src/modules/llm/llm.service.js', () => ({
  LlmService: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue('mock response'),
    generateGitCommands: vi.fn().mockResolvedValue('git commands'),
    getName: vi.fn().mockReturnValue('Mock LLM'),
    getVersion: vi.fn().mockReturnValue('1.0'),
    initialize: vi.fn().mockResolvedValue(true),
    isReady: vi.fn().mockReturnValue(true),
  })),
}));

// Temporary override for process.exit
const originalExit = process.exit;

interface MockedLlmService {
  initialize: ReturnType<typeof vi.fn>;
  isReady: ReturnType<typeof vi.fn>;
  getName: ReturnType<typeof vi.fn>;
  getVersion: ReturnType<typeof vi.fn>;
  queryOllama: ReturnType<typeof vi.fn>;
  queryOpenAI: ReturnType<typeof vi.fn>;
  getProvider: ReturnType<typeof vi.fn>;
  getModel: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
}

interface MockedThemeLogger {
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
  fatal: ReturnType<typeof vi.fn>;
  setTheme: ReturnType<typeof vi.fn>;
  getProvider: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  success: ReturnType<typeof vi.fn>;
}

describe('AnalyzeCommand - Integration', () => {
  let module: TestingModule;
  let command: AnalyzeCommand;
  let llmService: MockedLlmService;
  let logger: MockedThemeLogger;
  let fs: typeof mockFs;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create mock implementations
    llmService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isReady: vi.fn().mockReturnValue(true),
      getName: vi.fn().mockReturnValue('test-model'),
      getVersion: vi.fn().mockReturnValue('1.0.0'),
      queryOllama: vi.fn().mockResolvedValue('mocked response'),
      queryOpenAI: vi.fn().mockResolvedValue('mocked response'),
      getProvider: vi.fn().mockReturnValue('ollama'),
      getModel: vi.fn().mockReturnValue('test-model'),
      query: vi.fn().mockResolvedValue('mocked response'),
    };

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      fatal: vi.fn(),
      setTheme: vi.fn(),
      getProvider: vi.fn(),
      log: vi.fn(),
      success: vi.fn()
    };

    module = await Test.createTestingModule({
      imports: [AnalyzeModule],
    })
      .overrideProvider(LlmService)
      .useValue(llmService)
      .overrideProvider(ThemeLogger)
      .useValue(logger)
      .compile();

    command = module.get<AnalyzeCommand>(AnalyzeCommand);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', async () => {
    // Just verify it can be instantiated
    expect(command).toBeDefined();
  });
  
  it('should integrate with LLM service to analyze files', async () => {
    // Run the command
    await command.run(['owner/repo'], {});
    
    // Verify LLM service was called for analysis
    expect(llmService.query).toHaveBeenCalled();
  });

  it('should correctly classify a frontend web application', async () => {
    // Mock fs to return React-based package.json
    mockFs.readFileSync.mockImplementation((path) => {
      if (typeof path === 'string' && path.endsWith('package.json')) {
        return JSON.stringify({ 
          name: 'frontend-app',
          version: '1.0.0',
          dependencies: {
            'react': '^18.0.0',
            'react-dom': '^18.0.0',
            'react-router-dom': '^6.0.0'
          }
        });
      }
      return '{}';
    });

    // Run the command
    await command.run(['owner/repo'], {});
    
    // Verify classification was included in the analysis.yml
    expect(require('fs').writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('classifications:')
    );
    expect(require('fs').writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('frontend-web')
    );
    expect(require('fs').writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('languages:')
    );
  });

  it('should correctly classify a backend API application', async () => {
    // Mock fs to return Express-based package.json
    vi.mocked(require('fs').readFileSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.endsWith('package.json')) {
        return JSON.stringify({ 
          name: 'backend-api',
          version: '1.0.0',
          dependencies: {
            'express': '^4.18.2',
            'mongoose': '^7.0.0',
            'cors': '^2.8.5'
          }
        });
      }
      return '{}';
    });

    // Mock fs readdirSync to return backend-like structure
    vi.mocked(require('fs').readdirSync).mockReturnValue(['package.json', 'src', 'routes', 'controllers', 'models']);

    // Run the command
    await command.run(['owner/repo'], {});
    
    // Verify classification was included in the analysis.yml
    expect(require('fs').writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('classifications:')
    );
    expect(require('fs').writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('backend-api')
    );
  });

  it('should support multiple classifications for mixed packages', async () => {
    // Mock fs to return fullstack package.json
    vi.mocked(require('fs').readFileSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.endsWith('package.json')) {
        return JSON.stringify({ 
          name: 'fullstack-app',
          version: '1.0.0',
          dependencies: {
            'react': '^18.0.0',
            'react-dom': '^18.0.0',
            'express': '^4.18.2',
            'mongoose': '^7.0.0'
          }
        });
      }
      return '{}';
    });

    // Mock fs readdirSync to return fullstack structure
    vi.mocked(require('fs').readdirSync).mockReturnValue(['package.json', 'client', 'server']);

    // Mock fs statSync to identify directories
    vi.mocked(require('fs').statSync).mockImplementation((path) => ({
      isDirectory: () => typeof path === 'string' && (path.includes('client') || path.includes('server'))
    }));

    // Run the command
    await command.run(['owner/repo'], {});
    
    // Verify multiple classifications were included in the analysis.yml
    expect(require('fs').writeFileSync).toHaveBeenCalledWith(
      expect.any(String), 
      expect.stringMatching(/classifications:(?:[\s\S]*?)frontend(?:[\s\S]*?)backend/)
    );
  });
}); 