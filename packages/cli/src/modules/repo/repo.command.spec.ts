import { Test, TestingModule } from '@nestjs/testing';
import {
  RepoCommand,
  IssuesCommand,
  PlanCommand,
  PriorityCommand,
} from './repo.command.js';
import { RepoService } from './repo.service.js';
import { LlmService } from '../llm/llm.service.js';
import { ConfigService } from '../config/config.service.js';
import {
  jest,
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { ThemeLogger } from '../../logger/theme.logger.js';
import type { SpyInstance } from 'jest';
import type { GitHubIssue } from './repo.service.js';
import type { OctokitResponse } from '@octokit/types';

type SpyInstance = jest.SpyInstance;

describe('RepoCommand', () => {
  let command: RepoCommand;
  let repoService: RepoService;
  let mockRepoService: Partial<RepoService>;
  let mockCommandHelp: jest.Mock;

  beforeEach(async () => {
    mockRepoService = {
      getIssues: jest
        .fn()
        .mockImplementation((_repo: string): Promise<GitHubIssue[]> => {
          return Promise.resolve([]);
        }),
    };

    mockCommandHelp = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepoCommand,
        { provide: RepoService, useValue: mockRepoService },
        {
          provide: ThemeLogger,
          useValue: {
            setTheme: jest.fn(),
          },
        },
      ],
    }).compile();

    command = module.get<RepoCommand>(RepoCommand);
    repoService = module.get<RepoService>(RepoService);
    // Mock the command's help method using private property access for testing
    (command as any).command = { help: mockCommandHelp };
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('run', () => {
    it('should display help when executed without subcommands', async () => {
      await command.run([], {});
      expect(mockCommandHelp).toHaveBeenCalled();
    });
  });
});

describe('IssuesCommand', () => {
  let command: IssuesCommand;
  let mockRepoService: Partial<RepoService>;
  let consoleSpy: SpyInstance;

  const mockIssues: GitHubIssue[] = [
    {
      number: 1,
      title: 'Test Issue 1',
      html_url: 'https://github.com/owner/repo/issues/1',
      body: 'This is test issue 1',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
      labels: [{ name: 'bug' }],
    },
    {
      number: 2,
      title: 'Test Issue 2',
      html_url: 'https://github.com/owner/repo/issues/2',
      body: null,
      created_at: '2023-01-03T00:00:00Z',
      updated_at: '2023-01-04T00:00:00Z',
      labels: [],
    },
  ];

  beforeEach(async () => {
    mockRepoService = {
      getIssues: jest
        .fn()
        .mockImplementation((repo: string): Promise<GitHubIssue[]> => {
          if (repo === 'owner/repo') {
            return Promise.resolve(mockIssues);
          }
          if (repo === 'empty/repo') {
            return Promise.resolve([]);
          }
          return Promise.reject(new Error('Repository not found'));
        }),
    };

    consoleSpy = jest.spyOn(console, 'log');
    jest.spyOn(console, 'error');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesCommand,
        { provide: RepoService, useValue: mockRepoService },
      ],
    }).compile();

    command = module.get<IssuesCommand>(IssuesCommand);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('run', () => {
    it('should show error when no repository is provided', async () => {
      await command.run([], {});
      expect(console.error).toHaveBeenCalledWith(
        'Please provide a repository in the format owner/repo',
      );
      expect(mockRepoService.getIssues).not.toHaveBeenCalled();
    });

    it('should fetch and display issues for a repository', async () => {
      await command.run(['owner/repo'], {});
      expect(mockRepoService.getIssues).toHaveBeenCalledWith('owner/repo');
      expect(consoleSpy).toHaveBeenCalledWith('Open issues for owner/repo:');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test Issue 1'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test Issue 2'),
      );
    });

    it('should handle repositories with no issues', async () => {
      await command.run(['empty/repo'], {});
      expect(mockRepoService.getIssues).toHaveBeenCalledWith('empty/repo');
      expect(consoleSpy).toHaveBeenCalledWith(
        'No open issues found for empty/repo',
      );
    });

    it('should handle errors when fetching issues', async () => {
      await command.run(['invalid/repo'], {});
      expect(mockRepoService.getIssues).toHaveBeenCalledWith('invalid/repo');
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching issues for invalid/repo:',
        expect.any(Error),
      );
    });
  });
});

describe('PlanCommand', () => {
  let command: PlanCommand;
  let mockRepoService: Partial<RepoService>;
  let mockLlmService: Partial<LlmService>;
  let consoleSpy: SpyInstance;

  const mockIssue = {
    number: 123,
    title: 'Test Issue',
    html_url: 'https://github.com/owner/repo/issues/123',
    body: 'This is a test issue description',
  };

  beforeEach(async () => {
    mockRepoService = {
      getIssueDetails: jest.fn().mockResolvedValue({
        data: mockIssue,
        status: 200,
        headers: {},
        url: '',
      } as OctokitResponse<typeof mockIssue>),
      createIssueComment: jest.fn().mockResolvedValue({
        data: {},
        status: 200,
        headers: {},
        url: '',
      } as OctokitResponse<unknown>),
    };

    mockLlmService = {
      query: jest
        .fn()
        .mockResolvedValue('# Implementation Plan\n\n1. Step one\n2. Step two'),
    };

    consoleSpy = jest.spyOn(console, 'log');
    jest.spyOn(console, 'error');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanCommand,
        { provide: RepoService, useValue: mockRepoService },
        { provide: LlmService, useValue: mockLlmService },
      ],
    }).compile();

    command = module.get<PlanCommand>(PlanCommand);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('parseIssueNumber', () => {
    it('should parse issue number from string to number', () => {
      expect(command.parseIssueNumber('123')).toBe(123);
      expect(command.parseIssueNumber('456')).toBe(456);
    });
  });

  describe('run', () => {
    it('should show error when no repository is provided', async () => {
      await command.run([], { number: 123 });
      expect(console.error).toHaveBeenCalledWith(
        'Please provide a repository in the format owner/repo',
      );
    });

    it('should show error when no issue number is provided', async () => {
      await command.run(['owner/repo'], {});
      expect(console.error).toHaveBeenCalledWith(
        'Please provide an issue number with --number or -n flag',
      );
    });

    it('should generate and post a plan for a valid issue', async () => {
      await command.run(['owner/repo'], { number: 123 });

      expect(mockRepoService.getIssueDetails).toHaveBeenCalledWith(
        'owner',
        'repo',
        123,
      );
      expect(mockLlmService.query).toHaveBeenCalledWith(
        expect.stringContaining('Test Issue'),
      );
      expect(mockRepoService.createIssueComment).toHaveBeenCalledWith(
        'owner',
        'repo',
        123,
        expect.stringContaining('Implementation Plan'),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Plan posted successfully'),
      );
    });

    it('should handle LLM service errors', async () => {
      const llmError = new Error('LLM service unavailable');
      mockLlmService.query = jest.fn().mockRejectedValue(llmError);

      await command.run(['owner/repo'], { number: 123 });

      expect(mockRepoService.getIssueDetails).toHaveBeenCalledWith(
        'owner',
        'repo',
        123,
      );
      expect(mockLlmService.query).toHaveBeenCalledWith(
        expect.stringContaining('Test Issue'),
      );
      expect(console.error).toHaveBeenCalledWith(
        'Error generating plan:',
        llmError,
      );
      expect(mockRepoService.createIssueComment).not.toHaveBeenCalled();
    });

    it('should handle repository service errors', async () => {
      const repoError = new Error('Repository not found');
      mockRepoService.getIssueDetails = jest.fn().mockRejectedValue(repoError);

      await command.run(['owner/repo'], { number: 123 });

      expect(mockRepoService.getIssueDetails).toHaveBeenCalledWith(
        'owner',
        'repo',
        123,
      );
      expect(console.error).toHaveBeenCalledWith(
        'Error analyzing issue #123 from owner/repo:',
        repoError,
      );
      expect(mockLlmService.query).not.toHaveBeenCalled();
      expect(mockRepoService.createIssueComment).not.toHaveBeenCalled();
    });
  });
});

describe('PriorityCommand', () => {
  let command: PriorityCommand;
  let mockRepoService: Partial<RepoService>;
  let mockConfigService: Partial<ConfigService>;
  let consoleSpy: SpyInstance;

  const mockIssue = {
    number: 123,
    title: 'Test Issue',
    html_url: 'https://github.com/owner/repo/issues/123',
    body: 'This is a test issue description',
  };

  beforeEach(async () => {
    mockRepoService = {
      getIssueDetails: jest.fn().mockResolvedValue({
        data: mockIssue,
        status: 200,
        headers: {},
        url: '',
      } as OctokitResponse<typeof mockIssue>),
    };

    mockConfigService = {
      setIssuePriority: jest.fn(),
      removeIssue: jest.fn(),
    };

    consoleSpy = jest.spyOn(console, 'log');
    jest.spyOn(console, 'error');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriorityCommand,
        { provide: RepoService, useValue: mockRepoService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    command = module.get<PriorityCommand>(PriorityCommand);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('run', () => {
    it('should show error when no repository is provided', async () => {
      await command.run([], { number: 123, priority: 'high' });
      expect(console.error).toHaveBeenCalledWith(
        'Please provide a repository in the format owner/repo',
      );
    });

    it('should show error when no issue number is provided', async () => {
      await command.run(['owner/repo'], { priority: 'high' });
      expect(console.error).toHaveBeenCalledWith(
        'Please provide an issue number with --number or -n flag',
      );
    });

    it('should show error when no priority is provided', async () => {
      await command.run(['owner/repo'], { number: 123 });
      expect(console.error).toHaveBeenCalledWith(
        'Please provide a priority with --priority or -p flag',
      );
    });

    it('should set priority for a valid issue', async () => {
      await command.run(['owner/repo'], { number: 123, priority: 'high' });

      expect(mockRepoService.getIssueDetails).toHaveBeenCalledWith(
        'owner',
        'repo',
        123,
      );
      expect(mockConfigService.setIssuePriority).toHaveBeenCalledWith(
        'owner',
        'repo',
        123,
        'high',
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Set priority high for issue #123 in owner/repo',
      );
    });

    it('should handle repository service errors', async () => {
      const repoError = new Error('Repository not found');
      mockRepoService.getIssueDetails = jest.fn().mockRejectedValue(repoError);

      await command.run(['owner/repo'], { number: 123, priority: 'high' });

      expect(mockRepoService.getIssueDetails).toHaveBeenCalledWith(
        'owner',
        'repo',
        123,
      );
      expect(console.error).toHaveBeenCalledWith(
        'Error setting priority for issue #123:',
        repoError,
      );
      expect(mockConfigService.setIssuePriority).not.toHaveBeenCalled();
    });

    it('should handle invalid priority values', async () => {
      await command.run(['owner/repo'], { number: 123, priority: 'invalid' });

      expect(console.error).toHaveBeenCalledWith(
        'Invalid priority value. Must be one of: low, medium, high',
      );
      expect(mockRepoService.getIssueDetails).not.toHaveBeenCalled();
      expect(mockConfigService.setIssuePriority).not.toHaveBeenCalled();
    });
  });
});
