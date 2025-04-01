import { Test, TestingModule } from '@nestjs/testing';
import { RepoService } from './repo.service.js';
import { ConfigService } from '../config/config.service.js';
import { Octokit } from '@octokit/rest';

// Define clearer mock data structure for the repo service tests
const mockCodeSearchResponse = {
  data: {
    items: [
      {
        repository: {
          full_name: 'owner/repo1',
        },
        path: 'src/file.ts',
        html_url: 'https://github.com/owner/repo1/blob/main/src/file.ts',
      },
      {
        repository: {
          full_name: 'owner/repo2',
        },
        path: 'src/otherfile.ts',
        html_url: 'https://github.com/owner/repo2/blob/main/src/otherfile.ts',
      },
    ],
  },
};

const mockIssuesSearchResponse = {
  data: {
    items: [
      {
        title: 'Test Issue 1',
        html_url: 'https://github.com/owner/repo1/issues/1',
        body: 'This is a test issue',
        state: 'open',
        pull_request: undefined,
        repository_url: 'https://api.github.com/repos/owner/repo1',
      },
      {
        title: 'Test PR 1',
        html_url: 'https://github.com/owner/repo2/pull/1',
        body: 'This is a test PR',
        state: 'open',
        pull_request: {
          url: 'test-url',
        },
        repository_url: 'https://api.github.com/repos/owner/repo2',
      },
    ],
  },
};

const mockReposSearchResponse = {
  data: {
    items: [
      {
        full_name: 'owner/repo1',
        html_url: 'https://github.com/owner/repo1',
        description: 'Test repo 1',
        stargazers_count: 100,
      },
      {
        full_name: 'owner/repo2',
        html_url: 'https://github.com/owner/repo2',
        description: 'Test repo 2',
        stargazers_count: 50,
      },
    ],
  },
};

const mockTopicsSearchResponse = {
  data: {
    items: [
      {
        name: 'topic1',
        display_name: 'Topic 1',
        description: 'Test topic 1',
        curated: true,
        featured: false,
        url: 'https://github.com/topics/topic1',
      },
      {
        name: 'topic2',
        display_name: 'Topic 2',
        description: 'Test topic 2',
        curated: false,
        featured: true,
        url: 'https://github.com/topics/topic2',
      },
    ],
  },
};

// Mock repository priority data
const mockRepoPriorities = [
  { owner: 'owner', repo: 'repo1', priority: 'high' },
  { owner: 'owner', repo: 'repo3', priority: 'medium' },
];

// Create a full mock Octokit instance that matches the structure used in the service
const mockOctokit = {
  // The direct properties used by the service
  issues: {
    listForRepo: jest.fn().mockResolvedValue({ data: [] }),
  },
  git: {
    getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'mock-sha' } } }),
    createRef: jest.fn().mockResolvedValue({}),
  },
  pulls: {
    create: jest.fn().mockResolvedValue({}),
  },
  // The rest property used for search operations
  rest: {
    search: {
      code: jest.fn().mockResolvedValue(mockCodeSearchResponse),
      issuesAndPullRequests: jest.fn().mockResolvedValue(mockIssuesSearchResponse),
      repos: jest.fn().mockResolvedValue(mockReposSearchResponse),
      topics: jest.fn().mockResolvedValue(mockTopicsSearchResponse),
    },
  },
};

// Mock the Octokit constructor
jest.mock('@octokit/rest', () => ({
jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => mockOctokit),
  };
});

describe('RepoService', () => {
  let service: RepoService;
  let mockConfigService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock the ConfigService
    mockConfigService = {
      getAllGitRepos: jest.fn().mockReturnValue(mockRepoPriorities),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepoService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RepoService>(RepoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchCode', () => {
    it('should return formatted search results', async () => {
      const results = await service.searchCode('test');
      
      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({ 
        q: 'test' 
      });
      
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('owner/repo1: src/file.ts');
      expect(results[0].url).toBe('https://github.com/owner/repo1/blob/main/src/file.ts');
      expect(results[0].repoFullName).toBe('owner/repo1');
      expect(results[0].priority).toBe('high'); // Should match our mock priority
      
      // Check that repo2 has no priority since it's not in our config
      expect(results[1].repoFullName).toBe('owner/repo2');
      expect(results[1].priority).toBeUndefined();
    });

    it('should handle search filters', async () => {
      await service.searchCode('test', 'language:typescript');
      
      // Check that the search was called with the correct parameters
      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'test language:typescript',
      });
    });

    it('should handle errors gracefully', async () => {
      // Mock the search function to throw an error
      mockOctokit.rest.search.code.mockRejectedValueOnce(new Error('Search failed'));
      
      const results = await service.searchCode('test');
      
      expect(results).toEqual([]);
    });
  });

  describe('searchIssuesAndPRs', () => {
    it('should search for issues and PRs and return formatted results', async () => {
      const results = await service.searchIssuesAndPRs('test');
      
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Test Issue 1');
      expect(results[0].url).toBe('https://github.com/owner/repo1/issues/1');
      expect(results[0].repoFullName).toBe('owner/repo1');
      expect(results[0].priority).toBe('high');
      
      expect(results[1].title).toBe('Test PR 1');
      expect(results[1].repoFullName).toBe('owner/repo2');
    });
  });

  describe('searchRepositories', () => {
    it('should search for repositories and return formatted results', async () => {
      const results = await service.searchRepositories('test');
      
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('owner/repo1');
      expect(results[0].url).toBe('https://github.com/owner/repo1');
      expect(results[0].description).toBe('Test repo 1');
      expect(results[0].additionalInfo).toContain('100');
    });
  });

  describe('searchTopics', () => {
    it('should search for topics and return formatted results', async () => {
      mockOctokit.rest.search.topics.mockResolvedValueOnce({
        data: {
          items: [
            {
              name: 'topic1',
              display_name: 'Topic 1',
              description: 'Test topic 1',
              curated: true,
              featured: false,
              url: 'https://github.com/topics/topic1',
            },
          ],
        },
      });
      
      const results = await service.searchTopics('test');
      
      // Test the actual output from your service
      expect(results).toHaveLength(1);
      // The titles should match exactly what your service outputs
      expect(results[0].title).toBe('topic1');
      expect(results[0].url).toBe('https://github.com/topics/topic1');
      expect(results[0].description).toBe('Test topic 1');
    });

    it('should set the correct accept header for topics search', async () => {
      await service.searchTopics('test');
      
      // Check that the search was called with the correct headers
      expect(mockOctokit.rest.search.topics).toHaveBeenCalledWith({
        q: 'test',
        headers: {
          accept: 'application/vnd.github.mercy-preview+json',
        },
      });
    });
  });

  describe('prioritization', () => {
    it('should sort results based on repository priority', async () => {
      // Create a search response with multiple repos including one with priority
      const extendedResponse = {
        data: {
          items: [
            { repository: { full_name: 'owner/repo1' }, path: 'file1.ts', html_url: 'url1' },
            { repository: { full_name: 'owner/repo2' }, path: 'file2.ts', html_url: 'url2' },
            { repository: { full_name: 'owner/repo3' }, path: 'file3.ts', html_url: 'url3' },
          ],
        },
      };
      
      // Mock the search function to return our extended response
      mockOctokit.rest.search.code.mockResolvedValueOnce(extendedResponse);
      
      const results = await service.searchCode('test');
      
      // Results should be sorted with high priority first, then medium, then those without priority
      expect(results[0].repoFullName).toBe('owner/repo1'); // High priority
      expect(results[0].priority).toBe('high');
      expect(results[1].repoFullName).toBe('owner/repo3'); // Medium priority
      expect(results[1].priority).toBe('medium');
      expect(results[2].repoFullName).toBe('owner/repo2'); // No priority
      expect(results[2].priority).toBeUndefined();
    });
  });

  describe('getIssues', () => {
    it('should get issues for a repository', async () => {
      mockOctokit.issues.listForRepo.mockResolvedValueOnce({
        data: [{ number: 1, title: 'Test Issue' }],
      });
      
      const issues = await service.getIssues('owner/repo');
      
      expect(mockOctokit.issues.listForRepo).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'open',
      });
      
      expect(issues).toHaveLength(1);
      expect(issues[0].title).toBe('Test Issue');
    });
  });

  describe('createBranch', () => {
    it('should create a branch', async () => {
      await service.createBranch('owner/repo', 'main', 'feature-branch');
      
      expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/main',
      });
      
      expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'refs/heads/feature-branch',
        sha: 'mock-sha',
      });
    });
  });

  describe('createPR', () => {
    it('should create a pull request', async () => {
      await service.createPR('owner/repo', 'feature-branch', 'main', 'Test PR');
      
      expect(mockOctokit.pulls.create).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: 'Test PR',
        head: 'feature-branch',
        base: 'main',
      });
    });
  });
}); 