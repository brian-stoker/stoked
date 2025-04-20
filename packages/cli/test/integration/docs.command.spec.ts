import { Test, TestingModule } from '@nestjs/testing';
import { DocsCommand } from '../../src/modules/docs/docs.command.js';
import { LlmService } from '../../src/modules/llm/llm.service.js';
import { ThemeLogger } from '../../src/logger/theme.logger.js';
import { describe, it, expect, beforeEach, afterEach, vi, Mock, Mocked } from 'vitest';
import { ConfigModule } from '../../src/modules/config/config.module.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
// import { glob, IOptions } from 'glob'; // Removed glob import
import { ConfigService } from '../../src/modules/config/config.service.js';
import { RepoService } from '../../src/modules/repo/repo.service.js';

// --- Mocks ---
vi.mock('node:fs');
vi.mock('node:path');
// vi.mock('glob'); // Removed glob mock
vi.mock('../../src/utils/env.js', () => ({
  getWorkspaceRoot: vi.fn().mockReturnValue('/mock/workspace/root'),
}));
vi.mock('../../src/modules/config/config.service.js');
vi.mock('child_process', async (importOriginal) => { // Mock child_process
  const actual = await importOriginal() as typeof import('child_process');
  return {
    ...actual, // Keep other exports like spawn if needed
    execSync: vi.fn((command: string) => {
      console.log(`Mock execSync called with: ${command}`);
      if (command.startsWith('git rev-parse HEAD')) return 'mock-local-hash';
      if (command.startsWith('git rev-parse origin/main')) return 'mock-remote-hash'; // Simulate different hash initially
      if (command.startsWith('git branch')) return '  main\n* stoked/docs-@mono-tester/app-1.0.0'; // Simulate being on the right branch
      if (command.startsWith('stoked -v')) return 'stoked: 1.0.0'; // Mock stoked version command
      // Add other necessary git command mocks as needed
      return ''; // Default empty output
    }),
  };
});

// Mock file content - reset in beforeEach
let MOCK_FILES: Record<string, string> = {};

const MOCK_GENERATED_JSDOC = `/** Mock JSDoc */`;
const MOCK_WORKSPACE_ROOT = '/mock/workspace/root/brian-stoker/mono-tester';

// Temporary override for process.exit
const originalExit = process.exit;

describe('DocsCommand - Integration', () => {
  let command: DocsCommand;
  let llmMock: Mocked<LlmService>;
  let repoServiceMock: Mocked<RepoService>;
  let loggerMock: Mocked<ThemeLogger>;
  let module: TestingModule;
  let mockFsWriteFileSync: Mock;
  
  beforeEach(async () => {
    vi.resetAllMocks();
    process.exit = vi.fn() as any;
    process.env.LLM_MODE = 'MOCK';
    process.env.STOKED_WORKSPACE_ROOT = '/mock/workspace/root';

    // Reset mock file system for each test, using the new target
    MOCK_FILES = {
      [`${MOCK_WORKSPACE_ROOT}/package.json`]: JSON.stringify({ name: '@mono-tester/app', version: '1.0.0' }),
      [`${MOCK_WORKSPACE_ROOT}/utils.js`]: `function multiply(a, b) { return a * b; } module.exports = { multiply };`,
      [`${MOCK_WORKSPACE_ROOT}/index.js`]: `/** Add */ function add(a, b) { return a + b; } module.exports = { add };`,
    };

    // --- Mock Implementations ---
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return !!MOCK_FILES[p.toString()];
    });
    
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const content = MOCK_FILES[p.toString()];
      if (content === undefined) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
      return content as unknown as Buffer;
    });
    
    mockFsWriteFileSync = vi.fn((path, data) => {
      MOCK_FILES[path.toString()] = data.toString();
    });
    
    vi.mocked(fs.writeFileSync).mockImplementation(mockFsWriteFileSync);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

    // Add mock for readdirSync
    vi.mocked(fs.readdirSync).mockImplementation((dirPathLike) => {
      const dirPath = dirPathLike.toString().replace(/\\/g, '/');
      const entries: any[] = [];
      const seen = new Set<string>();

      for (const filePath of Object.keys(MOCK_FILES)) {
        if (filePath.startsWith(dirPath) && filePath !== dirPath) {
          const relativePath = filePath.substring(dirPath.length + (dirPath.endsWith('/') ? 0 : 1));
          const entryName = relativePath.split('/')[0];
          if (!entryName || seen.has(entryName)) continue; 

          const isDirectory = relativePath.includes('/');
          entries.push({
            name: entryName,
            isFile: () => !isDirectory,
            isDirectory: () => isDirectory,
            isSymbolicLink: () => false, // Add other methods as needed by the code
          });
          seen.add(entryName);
        }
      }
      return entries as fs.Dirent[];
    });

    vi.mocked(path.join).mockImplementation((...args) => args.join('/').replace(/\\/g, '/'));
    vi.mocked(path.resolve).mockImplementation((...args) => args.join('/').replace(/\\/g, '/'));
    vi.mocked(path.dirname).mockImplementation(p => p.substring(0, p.lastIndexOf('/') || 0));
    vi.mocked(path.relative).mockImplementation((from, to) => to.replace(from, ''));

    // Removed glob mock implementation
    /* 
    vi.mocked(glob).mockImplementation(async (pattern: string | string[], options?: IOptions): Promise<any> => {
        const patternStr = Array.isArray(pattern) ? pattern.join('|') : pattern; // Handle array pattern for includes
        const files = Object.keys(MOCK_FILES);
        let results: string[] = [];

        if (patternStr.includes('utils.js')) results = files.filter(f => f.endsWith('utils.js'));
        else if (patternStr.includes('index.js')) results = files.filter(f => f.endsWith('index.js'));
        else if (patternStr.includes('*.js')) results = files;
        
        return results; // Return the array directly
    });
    */

    // Mock ConfigService instance - Update for new target repo
    const mockConfigServiceInstance = {
      get: vi.fn((key) => {
        if (key === 'repositories') return { 'brian-stoker/mono-tester': { path: MOCK_WORKSPACE_ROOT } };
        if (key === 'defaultRepository') return 'brian-stoker/mono-tester';
        return undefined;
      }),
      getRepoPath: vi.fn().mockReturnValue(MOCK_WORKSPACE_ROOT),
    };
    // Keep the vi.mock call but we'll use overrideProvider instead of mockImplementation
    // vi.mocked(ConfigService).mockImplementation(() => mockConfigServiceInstance as any);

    // --- Create Mock Instances for LLM and Logger ---
    llmMock = {
      // Core methods
      initialize: vi.fn().mockResolvedValue(true),
      isReady: vi.fn().mockReturnValue(true),
      getName: vi.fn().mockReturnValue('MOCK'),
      
      // Data methods
      getVersion: vi.fn().mockReturnValue('1.0.0'),
      query: vi.fn().mockResolvedValue('mock query response'),
      queryWithMetadata: vi.fn().mockResolvedValue({ content: 'mock response', metadata: {} }),
      
      // Processing methods
      batchProcess: vi.fn().mockResolvedValue([]),
      cancelBatch: vi.fn().mockResolvedValue(true),
      generateCompletion: vi.fn().mockResolvedValue(MOCK_GENERATED_JSDOC),
      
      // Error handling - important for the current error
      error: null, // Add error property initialized to null
      
      // Other potential methods
      onError: vi.fn(),
      onSuccess: vi.fn(),
      getPrompt: vi.fn().mockReturnValue('mock prompt'),
    } as unknown as Mocked<LlmService>;

    // Ensure logger mock has error method and other commonly used methods using arrow functions
    loggerMock = {
      log: vi.fn((...args) => console.log(...args)), // Use arrow functions
      error: vi.fn((...args) => console.error(...args)), // Use arrow functions
      warn: vi.fn((...args) => console.warn(...args)), // Use arrow functions
      debug: vi.fn((...args) => console.debug(...args)), // Use arrow functions
      verbose: vi.fn((...args) => console.log(...args)), // Use arrow functions
      fatal: vi.fn((...args) => console.error(...args)), // Use arrow functions
      setTheme: vi.fn(),
      setLogLevels: vi.fn(),
      setContext: vi.fn(),
      resetContext: vi.fn(),
      isLevelEnabled: vi.fn(() => true), // Use arrow function
    } as unknown as Mocked<ThemeLogger>;


    repoServiceMock = {
      createLocalBranch: vi.fn(),
      cloneRepo: vi.fn(),
      prExists: vi.fn(),
      createPR: vi.fn(),
    } as unknown as Mocked<RepoService>;

    // --- Create NestJS Testing Module ---
    module = await Test.createTestingModule({
      providers: [
        DocsCommand, // The command under test
        { provide: LlmService, useValue: llmMock }, // Provide mocked LlmService
        { provide: ThemeLogger, useValue: loggerMock }, // Provide mocked ThemeLogger
        { provide: ConfigService, useValue: mockConfigServiceInstance }, // Provide mocked ConfigService
        { provide: RepoService, useValue: repoServiceMock }, // Provide mocked RepoService
      ],
    })
    .compile();

    command = module.get<DocsCommand>(DocsCommand);
  });

  afterEach(() => {
    process.exit = originalExit;
    delete process.env.LLM_MODE;
    delete process.env.STOKED_WORKSPACE_ROOT;
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should generate JSDoc comments for files without them', async () => {
    const targetFile = `${MOCK_WORKSPACE_ROOT}/utils.js`;
    const initialContent = MOCK_FILES[targetFile];
    expect(initialContent).not.toContain('/**');
    llmMock.query = vi.fn().mockResolvedValue(`'/** Mock JSDoc */'${initialContent}`),
    // Call the actual run method with the repository argument and options object
    await command.run(['brian-stoker/mono-tester'], { includes: ['@mono-tester/app'], dryRun: false });

    // Check updated content in the mock file system
    const finalContent = MOCK_FILES[targetFile];
    expect(finalContent).toContain('/** Mock JSDoc */'); // Assuming mock LLM returns this
    expect(finalContent).toContain('function multiply');
    expect(mockFsWriteFileSync).toHaveBeenCalledWith(targetFile, finalContent); // Verify file write
  });

  it('should not modify files with existing JSDoc comments', async () => {
    const targetFile = `${MOCK_WORKSPACE_ROOT}/index.js`;
    const initialContent = MOCK_FILES[targetFile];
    expect(initialContent).toContain('/**');
    llmMock.query = vi.fn().mockResolvedValue(initialContent),
    // Call the actual run method with the repository argument and options object
    await command.run(['brian-stoker/mono-tester'], { includes: ['@mono-tester/app'], dryRun: false });

    // Verify content hasn't changed in the mock file system
    const finalContent = MOCK_FILES[targetFile];
    expect(finalContent).toBe(initialContent);
    expect(mockFsWriteFileSync).not.toHaveBeenCalledWith(targetFile, expect.anything()); // Verify file was *not* written
  });
}); 