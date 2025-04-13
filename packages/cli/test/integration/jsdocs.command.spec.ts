import { Test, TestingModule } from '@nestjs/testing';
import { DocsCommand } from '../../src/modules/docs/docs.command.js';
import { LlmService } from '../../src/modules/llm/llm.service.js';
import { ThemeLogger } from '../../src/logger/theme.logger.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigModule } from '../../src/modules/config/config.module.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
}));

// Mock child_process module
vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue('mocked git output'),
  exec: vi.fn(),
}));

// Mock environment utilities
vi.mock('../../src/utils/env.js', () => ({
  getWorkspaceRoot: vi.fn().mockReturnValue('/mock/workspace/root'),
}));

// Temporary override for process.exit
const originalExit = process.exit;

describe('DocsCommand - Integration', () => {
  beforeEach(() => {
    // Mock process.exit to prevent tests from terminating
    process.exit = vi.fn() as any;
    // Set the mock environment
    process.env.LLM_MODE = 'MOCK';
  });
  
  afterEach(() => {
    // Restore original process.exit
    process.exit = originalExit;
    // Restore environment
    delete process.env.LLM_MODE;
    vi.clearAllMocks();
  });
  
  it('should be defined', async () => {
    // Create module with mocked dependencies
    const module = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [
        DocsCommand,
        {
          provide: LlmService,
          useValue: {
            query: vi.fn().mockResolvedValue('mock response'),
            generateGitCommands: vi.fn().mockResolvedValue('git commands'),
            initialize: vi.fn().mockResolvedValue(true),
            isReady: vi.fn().mockReturnValue(true),
            generateCompletion: vi.fn().mockResolvedValue('This is a mock completion response'),
            generateCompletionStream: vi.fn().mockImplementation(async (prompt, callback) => {
              callback('This is a mock streaming response');
              return Promise.resolve();
            }),
            getName: vi.fn().mockReturnValue('MOCK'),
          },
        },
        {
          provide: ThemeLogger,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            fatal: vi.fn(),
            setTheme: vi.fn(),
          },
        },
      ],
    }).compile();
    
    // Get command instance
    const command = module.get<DocsCommand>(DocsCommand);
    
    // Just verify it can be instantiated
    expect(command).toBeDefined();
  });
}); 