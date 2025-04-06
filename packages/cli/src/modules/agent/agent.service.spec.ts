import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service.js';
import {
  ConfigService,
  type GitRepoPriority,
} from '../config/config.service.js';
import { LlmService } from '../llm/llm.service.js';
import { LogService } from '../log/log.service.js';

// Mock the repo service module completely to avoid importing Octokit with ESM
jest.mock('../repo/repo.service', () => {
  return {
    RepoService: jest.fn().mockImplementation(() => ({
      getIssues: jest.fn(),
    })),
  };
});

// Import the mocked class from the mock
import { RepoService } from '../repo/repo.service.js';

type AuthorAssociation =
  | 'COLLABORATOR'
  | 'CONTRIBUTOR'
  | 'FIRST_TIMER'
  | 'FIRST_TIME_CONTRIBUTOR'
  | 'MANNEQUIN'
  | 'MEMBER'
  | 'NONE'
  | 'OWNER';

describe('AgentService', () => {
  let service: AgentService;
  let configService: jest.Mocked<ConfigService>;
  let repoService: jest.Mocked<RepoService>;
  let llmService: jest.Mocked<LlmService>;
  let logService: jest.Mocked<LogService>;

  beforeEach(async () => {
    // Create mock services
    configService = {
      getAllGitRepos: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    repoService = {
      getIssues: jest.fn(),
    } as unknown as jest.Mocked<RepoService>;

    llmService = {
      query: jest.fn(),
    } as unknown as jest.Mocked<LlmService>;

    logService = {
      logCompletedPR: jest.fn(),
      logSkippedIssue: jest.fn(),
    } as unknown as jest.Mocked<LogService>;

    // Create testing module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: ConfigService, useValue: configService },
        { provide: RepoService, useValue: repoService },
        { provide: LlmService, useValue: llmService },
        { provide: LogService, useValue: logService },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('run', () => {
    it('should log a message and return early if no repos are added', async () => {
      // Mock getAllGitRepos to return an empty array
      configService.getAllGitRepos.mockReturnValue([]);

      // Spy on console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.run();

      expect(configService.getAllGitRepos).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'No repos added. Use "stoked repo {owner}/{repo}" first.',
      );
      expect(repoService.getIssues).not.toHaveBeenCalled();

      // Restore console.log
      consoleSpy.mockRestore();
    });

    it('should log a message and return early if no issues are found', async () => {
      // Mock getAllGitRepos to return a repo
      const mockRepo: GitRepoPriority = {
        owner: 'testOwner',
        repo: 'testRepo',
        priority: 'high',
      };
      configService.getAllGitRepos.mockReturnValue([mockRepo]);

      // Mock getIssues to return an empty array
      repoService.getIssues.mockResolvedValue([]);

      // Spy on console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.run();

      expect(configService.getAllGitRepos).toHaveBeenCalled();
      expect(repoService.getIssues).toHaveBeenCalledWith('testOwner/testRepo');
      expect(consoleSpy).toHaveBeenCalledWith(
        'No open issues in testOwner/testRepo',
      );
      expect(llmService.query).not.toHaveBeenCalled();

      // Restore console.log
      consoleSpy.mockRestore();
    });

    it('should log a skipped issue if LLM selects an invalid issue', async () => {
      // Mock getAllGitRepos to return a repo
      const mockRepo: GitRepoPriority = {
        owner: 'testOwner',
        repo: 'testRepo',
        priority: 'high',
      };
      configService.getAllGitRepos.mockReturnValue([mockRepo]);

      // Mock getIssues to return issues
      const issues = [
        {
          id: 123,
          node_id: 'node123',
          url: 'https://api.github.com/repos/testOwner/testRepo/issues/1',
          repository_url: 'https://api.github.com/repos/testOwner/testRepo',
          labels_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/1/labels{/name}',
          comments_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/1/comments',
          events_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/1/events',
          html_url: 'https://github.com/testOwner/testRepo/issues/1',
          number: 1,
          state: 'open',
          title: 'Issue 1',
          body: 'Description 1',
          user: null,
          labels: [],
          assignee: null,
          assignees: [],
          milestone: null,
          locked: false,
          active_lock_reason: null,
          comments: 0,
          pull_request: undefined,
          closed_at: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          author_association: 'CONTRIBUTOR' as AuthorAssociation,
        },
        {
          id: 456,
          node_id: 'node456',
          url: 'https://api.github.com/repos/testOwner/testRepo/issues/2',
          repository_url: 'https://api.github.com/repos/testOwner/testRepo',
          labels_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/2/labels{/name}',
          comments_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/2/comments',
          events_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/2/events',
          html_url: 'https://github.com/testOwner/testRepo/issues/2',
          number: 2,
          state: 'open',
          title: 'Issue 2',
          body: 'Description 2',
          user: null,
          labels: [],
          assignee: null,
          assignees: [],
          milestone: null,
          locked: false,
          active_lock_reason: null,
          comments: 0,
          pull_request: undefined,
          closed_at: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          author_association: 'OWNER' as AuthorAssociation,
        },
      ];
      repoService.getIssues.mockResolvedValue(issues);

      // Mock LLM to return a response that doesn't match any issue
      llmService.query.mockResolvedValue('I choose issue #3');

      await service.run();

      expect(configService.getAllGitRepos).toHaveBeenCalled();
      expect(repoService.getIssues).toHaveBeenCalledWith('testOwner/testRepo');
      expect(llmService.query).toHaveBeenCalledWith(
        expect.stringContaining('Select an issue'),
      );
      expect(logService.logSkippedIssue).toHaveBeenCalledWith(
        'testOwner/testRepo',
        expect.any(Number),
        'Invalid selection',
      );
    });

    it('should generate code for a valid selected issue', async () => {
      // Mock getAllGitRepos to return a repo
      const mockRepo: GitRepoPriority = {
        owner: 'testOwner',
        repo: 'testRepo',
        priority: 'high',
      };
      configService.getAllGitRepos.mockReturnValue([mockRepo]);

      // Mock getIssues to return issues
      const issues = [
        {
          id: 123,
          node_id: 'node123',
          url: 'https://api.github.com/repos/testOwner/testRepo/issues/1',
          repository_url: 'https://api.github.com/repos/testOwner/testRepo',
          labels_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/1/labels{/name}',
          comments_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/1/comments',
          events_url:
            'https://api.github.com/repos/testOwner/testRepo/issues/1/events',
          html_url: 'https://github.com/testOwner/testRepo/issues/1',
          number: 1,
          state: 'open',
          title: 'Issue 1',
          body: 'Description 1',
          user: null,
          labels: [],
          assignee: null,
          assignees: [],
          milestone: null,
          locked: false,
          active_lock_reason: null,
          comments: 0,
          pull_request: undefined,
          closed_at: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          author_association: 'CONTRIBUTOR' as AuthorAssociation,
        },
      ];
      repoService.getIssues.mockResolvedValue(issues);

      // Mock LLM to select the first issue and generate code
      llmService.query
        .mockResolvedValueOnce('I choose issue #1')
        .mockResolvedValueOnce('function solve() { return "solution"; }');

      // Spy on console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.run();

      expect(configService.getAllGitRepos).toHaveBeenCalled();
      expect(repoService.getIssues).toHaveBeenCalledWith('testOwner/testRepo');
      expect(llmService.query).toHaveBeenCalledWith(
        expect.stringContaining('Select an issue'),
      );
      expect(llmService.query).toHaveBeenCalledWith(
        expect.stringContaining('For issue #1'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generated code for #1'),
      );
      expect(logService.logCompletedPR).toHaveBeenCalledWith(
        'testOwner/testRepo',
        1,
      );

      // Restore console.log
      consoleSpy.mockRestore();
    });
  });
});
