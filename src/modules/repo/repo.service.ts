import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { ConfigService } from '../config/config.service.js';
import type { GitRepoPriority } from '../config/config.service.js';
import { Logger } from '@nestjs/common';

/**
 * Represents a GitHub label from the API
 * @interface GitHubLabel
 */
interface GitHubLabel {
  /** The label ID */
  id?: number;
  /** The label node ID */
  node_id?: string;
  /** The label URL */
  url?: string;
  /** The label name */
  name: string;
  /** The label description */
  description?: string | null;
  /** The label color */
  color?: string | null;
  /** Whether this is a default label */
  default?: boolean;
}

/**
 * Represents a GitHub issue or pull request
 * @interface GitHubIssue
 */
export interface GitHubIssue {
  /** The issue/PR number */
  number: number;
  /** The issue/PR ID */
  id?: number;
  /** The title of the issue/PR */
  title: string;
  /** The URL to view the issue/PR in a browser */
  html_url: string;
  /** The body/description of the issue/PR */
  body?: string | null;
  /** The current state (open, closed, etc.) */
  state?: string;
  /** When the issue/PR was created */
  created_at: string;
  /** When the issue/PR was last updated */
  updated_at: string;
  /** Array of labels attached to the issue/PR */
  labels: Array<GitHubLabel>;
  /** The author's association with the repository */
  author_association?: string;
  /** The priority level assigned to the issue/PR */
  priority?: 'low' | 'medium' | 'high';
}

/** Type alias for an array of GitHub issues */
type IssueList = GitHubIssue[];

/**
 * Represents a search result from GitHub
 * @interface SearchResult
 */
interface SearchResult {
  /** The title of the search result */
  title: string;
  /** The URL to view the result */
  url: string;
  /** Optional description of the result */
  description?: string;
  /** Optional additional information */
  additionalInfo?: string;
  /** The full name of the repository (owner/repo) */
  repoFullName?: string;
  /** The priority level assigned to the result */
  priority?: 'low' | 'medium' | 'high';
}

/** Type alias for an Octokit API response */
type OctokitResponse<T> = { data: T };

/**
 * Service responsible for interacting with GitHub repositories
 *
 * This service provides functionality for:
 * - Searching code, issues, PRs, and repositories
 * - Managing repository priorities
 * - Managing issue priorities
 * - Creating branches and pull requests
 * - Managing issue comments
 *
 * @class RepoService
 * @implements {Injectable}
 */
@Injectable()
export class RepoService {
  /** Instance of the Octokit client for GitHub API interactions */
  private octokit: Octokit;
  /** Mapping of priority levels to GitHub labels */
  private readonly PRIORITY_LABELS = {
    high: ['priority:high', 'high-priority'],
    medium: ['priority:medium', 'medium-priority'],
    low: ['priority:low', 'low-priority'],
  };
  private readonly logger = new Logger(RepoService.name);

  /**
   * Creates an instance of RepoService
   * @param {ConfigService} configService - Service for managing configuration
   */
  constructor(private readonly configService: ConfigService) {
    console.log('GitHub Token:', process.env.GITHUB_TOKEN ? 'Present' : 'Missing');
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      baseUrl: 'https://api.github.com',
      userAgent: 'stoked-app',
      request: {
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    });
  }

  /**
   * Searches for code within GitHub repositories
   *
   * @param {string} query - The search query string
   * @param {string} [filters=''] - Additional filters (language, organization, etc.)
   * @returns {Promise<SearchResult[]>} List of search results with links
   * @throws {Error} If the GitHub API request fails
   * @example
   * const results = await repoService.searchCode('react hooks', 'language:typescript');
   */
  async searchCode(
    query: string,
    filters: string = '',
  ): Promise<SearchResult[]> {
    try {
      const fullQuery = filters ? `${query} ${filters}` : query;
      const { data } = await this.octokit.request('GET /search/code', {
        q: fullQuery,
      });

      const results = data.items.map((item: any) => ({
        title: `${item.repository.full_name}: ${item.path}`,
        url: item.html_url,
        description: `Code match in ${item.repository.full_name}`,
        additionalInfo: `File: ${item.path}, Repository: ${item.repository.full_name}`,
        repoFullName: item.repository.full_name,
      }));

      return this.prioritizeResults(results);
    } catch (error) {
      console.error('Error searching code:', error);
      return [];
    }
  }

  /**
   * Searches for issues and pull requests on GitHub
   *
   * @param {string} query - The search query string
   * @param {string} [filters=''] - Additional filters (state, organization, is:pr, etc.)
   * @returns {Promise<SearchResult[]>} List of search results with links
   * @throws {Error} If the GitHub API request fails
   * @example
   * const results = await repoService.searchIssuesAndPRs('bug', 'state:open');
   */
  async searchIssuesAndPRs(
    query: string,
    filters: string = '',
  ): Promise<SearchResult[]> {
    try {
      const fullQuery = filters ? `${query} ${filters}` : query;
      const { data } = await this.octokit.request('GET /search/issues', {
        q: fullQuery,
      });

      const results = data.items.map((item: any) => {
        const repoFullName = item.repository_url.replace(
          'https://api.github.com/repos/',
          '',
        );
        return {
          title: item.title,
          url: item.html_url,
          description: item.body?.substring(0, 150) + '...' || 'No description',
          additionalInfo: `${item.state} ${item.pull_request ? 'PR' : 'Issue'} in ${repoFullName}`,
          repoFullName,
        };
      });

      return this.prioritizeResults(results);
    } catch (error) {
      console.error('Error searching issues and PRs:', error);
      return [];
    }
  }

  /**
   * Searches for repositories on GitHub
   *
   * @param {string} query - The search query string
   * @param {string} [filters=''] - Additional filters (language, stars, etc.)
   * @returns {Promise<SearchResult[]>} List of search results with links
   * @throws {Error} If the GitHub API request fails
   * @example
   * const results = await repoService.searchRepositories('react', 'language:typescript stars:>1000');
   */
  async searchRepositories(
    query: string,
    filters: string = '',
  ): Promise<SearchResult[]> {
    try {
      const fullQuery = filters ? `${query} ${filters}` : query;
      const { data } = await this.octokit.request('GET /search/repositories', {
        q: fullQuery,
      });

      const results = data.items.map((item: any) => ({
        title: item.full_name,
        url: item.html_url,
        description: item.description || 'No description',
        additionalInfo: `Stars: ${item.stargazers_count}, Forks: ${item.forks_count}, Language: ${item.language || 'Not specified'}`,
        repoFullName: item.full_name,
      }));

      return this.prioritizeResults(results);
    } catch (error) {
      console.error('Error searching repositories:', error);
      return [];
    }
  }

  /**
   * Searches for topics on GitHub
   *
   * @param {string} query - The search query string
   * @param {string} [filters=''] - Additional filters
   * @returns {Promise<SearchResult[]>} List of search results with links
   * @throws {Error} If the GitHub API request fails
   * @example
   * const results = await repoService.searchTopics('react');
   */
  async searchTopics(
    query: string,
    filters: string = '',
  ): Promise<SearchResult[]> {
    try {
      const fullQuery = filters ? `${query} ${filters}` : query;
      const { data } = await this.octokit.request('GET /search/topics', {
        q: fullQuery,
        headers: {
          accept: 'application/vnd.github.mercy-preview+json',
        },
      });

      const results = data.items.map((item: any) => ({
        title: item.name,
        url: `https://github.com/topics/${item.name}`,
        description: item.description || 'No description',
        additionalInfo: `Curated: ${item.curated ? 'Yes' : 'No'}, Featured: ${item.featured ? 'Yes' : 'No'}`,
      }));

      // Topics don't have repository associations so we don't need to prioritize them
      return results;
    } catch (error) {
      console.error('Error searching topics:', error);
      return [];
    }
  }

  /**
   * Prioritizes search results based on repository configuration
   *
   * @param {SearchResult[]} results - Search results to prioritize
   * @returns {SearchResult[]} Prioritized search results
   * @private
   */
  private prioritizeResults(results: SearchResult[]): SearchResult[] {
    const prioritizedResults = [...results];

    // Get all configured repositories
    const allRepos = this.configService.getAllGitRepos();
    const prioMap = new Map<string, 'low' | 'medium' | 'high'>();

    // Create a map for faster lookups
    for (const repo of allRepos) {
      prioMap.set(`${repo.owner}/${repo.repo}`, repo.priority);
    }

    // Add priority info to each result
    for (const result of prioritizedResults) {
      if (result.repoFullName) {
        result.priority = prioMap.get(result.repoFullName);
      }
    }

    // Sort results by priority: high -> medium -> low -> undefined
    return prioritizedResults.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1, undefined: 0 };
      const aPriority = a.priority ? priorityOrder[a.priority] : 0;
      const bPriority = b.priority ? priorityOrder[b.priority] : 0;

      return bPriority - aPriority;
    });
  }

  /**
   * Cleans repository owner name by removing @ prefix if present
   *
   * @param {string} owner - The owner name to clean
   * @returns {string} The cleaned owner name
   * @private
   */
  private cleanOwnerName(owner: string): string {
    return owner.startsWith('@') ? owner.slice(1) : owner;
  }

  /**
   * Determines issue priority from GitHub labels
   *
   * @param {Array<GitHubLabel>} labels - Array of GitHub labels
   * @returns {'low' | 'medium' | 'high' | undefined} The determined priority level
   * @private
   */
  private determineIssuePriority(
    labels: Array<GitHubLabel>,
  ): 'low' | 'medium' | 'high' | undefined {
    const labelNames = labels.map((label) => label.name);

    // Check for high priority labels first
    if (this.PRIORITY_LABELS.high.some((label) => labelNames.includes(label))) {
      return 'high';
    }

    // Then medium
    if (
      this.PRIORITY_LABELS.medium.some((label) => labelNames.includes(label))
    ) {
      return 'medium';
    }

    // Finally low
    if (this.PRIORITY_LABELS.low.some((label) => labelNames.includes(label))) {
      return 'low';
    }

    return undefined;
  }

  /**
   * Sorts issues by priority level
   *
   * @param {IssueList} issues - List of issues to sort
   * @param {string} repoOwner - Repository owner
   * @param {string} repoName - Repository name
   * @returns {IssueList} Sorted list of issues
   * @private
   */
  private sortIssuesByPriority(
    issues: IssueList,
    repoOwner: string,
    repoName: string,
  ): IssueList {
    const priorityOrder = { high: 3, medium: 2, low: 1, undefined: 0 };

    return [...issues].sort((a, b) => {
      const aPriority = a.priority ? priorityOrder[a.priority] : 0;
      const bPriority = b.priority ? priorityOrder[b.priority] : 0;

      return bPriority - aPriority;
    });
  }

  /**
   * Gets all issues for a repository
   *
   * @param {string} repo - Repository name in owner/repo format
   * @returns {Promise<IssueList>} List of issues
   * @throws {Error} If the GitHub API request fails
   * @example
   * const issues = await repoService.getIssues('owner/repo');
   */
  async getIssues(repo: string): Promise<IssueList> {
    const [owner, repoName] = repo.split('/');
    const cleanOwner = this.cleanOwnerName(owner);

    try {
      const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/issues', {
        owner: cleanOwner,
        repo: repoName,
        state: 'open',
        per_page: 100,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (!Array.isArray(data)) {
        console.error('Unexpected response format:', data);
        return [];
      }

      const issues = data.map((issue) => ({
        number: issue.number,
        id: issue.id,
        title: issue.title,
        html_url: issue.html_url,
        body: issue.body,
        state: issue.state,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        labels: issue.labels as Array<GitHubLabel>,
        author_association: issue.author_association,
        priority: this.determineIssuePriority(issue.labels as Array<GitHubLabel>),
      }));

      return this.sortIssuesByPriority(issues, cleanOwner, repoName);
    } catch (error: any) {
      console.error('Error getting issues:', {
        message: error.message,
        status: error.status,
        response: error.response?.data,
        owner: cleanOwner,
        repo: repoName
      });
      return [];
    }
  }

  /**
   * Gets details for a specific issue
   *
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @returns {Promise<OctokitResponse<any>>} Issue details
   * @throws {Error} If the GitHub API request fails
   * @example
   * const issue = await repoService.getIssueDetails('owner', 'repo', 123);
   */
  async getIssueDetails(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<OctokitResponse<any>> {
    const cleanOwner = this.cleanOwnerName(owner);

    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
        owner: cleanOwner,
        repo,
        issue_number: issueNumber,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      return response;
    } catch (error: any) {
      console.error('Error getting issue details:', {
        message: error.message,
        status: error.status,
        response: error.response?.data,
        owner: cleanOwner,
        repo,
        issueNumber
      });
      throw error;
    }
  }

  /**
   * Creates a comment on an issue
   *
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @param {string} body - Comment content
   * @returns {Promise<OctokitResponse<any>>} Created comment
   * @throws {Error} If the GitHub API request fails
   * @example
   * await repoService.createIssueComment('owner', 'repo', 123, 'This is a comment');
   */
  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<OctokitResponse<any>> {
    const cleanOwner = this.cleanOwnerName(owner);

    try {
      const response = await this.octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner: cleanOwner,
        repo,
        issue_number: issueNumber,
        body,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      return response;
    } catch (error: any) {
      console.error('Error creating comment:', {
        message: error.message,
        status: error.status,
        response: error.response?.data,
        owner: cleanOwner,
        repo,
        issueNumber
      });
      throw error;
    }
  }

  /**
   * Creates a new branch from an existing one
   *
   * @param {string} repo - Repository name in owner/repo format
   * @param {string} base - Base branch name
   * @param {string} branchName - New branch name
   * @returns {Promise<void>}
   * @throws {Error} If the GitHub API request fails
   * @example
   * await repoService.createBranch('owner/repo', 'main', 'feature/new-feature');
   */
  async createBranch(
    repo: string,
    base: string,
    branchName: string,
  ): Promise<void> {
    const [owner, repoName] = repo.split('/');
    const cleanOwner = this.cleanOwnerName(owner);

    try {
      // Get the SHA of the base branch
      const { data: ref } = await this.octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
        owner: cleanOwner,
        repo: repoName,
        ref: `heads/${base}`,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      // Create the new branch
      await this.octokit.request('POST /repos/{owner}/{repo}/git/refs', {
        owner: cleanOwner,
        repo: repoName,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    } catch (error: any) {
      console.error('Error creating branch:', {
        message: error.message,
        status: error.status,
        response: error.response?.data,
        owner: cleanOwner,
        repo: repoName,
        base,
        branchName
      });
      throw error;
    }
  }

  /**
   * Creates a pull request
   *
   * @param {string} repo - Repository name in owner/repo format
   * @param {string} head - Head branch name
   * @param {string} base - Base branch name
   * @param {string} title - PR title
   * @returns {Promise<OctokitResponse<any>>} Created pull request
   * @throws {Error} If the GitHub API request fails
   * @example
   * await repoService.createPR('owner/repo', 'feature/new-feature', 'main', 'Add new feature');
   */
  async createPR(
    repo: string,
    head: string,
    base: string,
    title: string,
  ): Promise<OctokitResponse<any>> {
    const [owner, repoName] = repo.split('/');
    const cleanOwner = this.cleanOwnerName(owner);

    try {
      const response = await this.octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner: cleanOwner,
        repo: repoName,
        head,
        base,
        title,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      return response;
    } catch (error: any) {
      console.error('Error creating PR:', {
        message: error.message,
        status: error.status,
        response: error.response?.data,
        owner: cleanOwner,
        repo: repoName,
        head,
        base,
        title
      });
      throw error;
    }
  }

  /**
   * Sets the priority for an issue
   *
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @param {'low' | 'medium' | 'high'} priority - Priority level
   * @returns {Promise<void>}
   * @throws {Error} If the GitHub API request fails
   * @example
   * await repoService.setIssuePriority('owner', 'repo', 123, 'high');
   */
  async setIssuePriority(
    owner: string,
    repo: string,
    issueNumber: number,
    priority: 'low' | 'medium' | 'high',
  ): Promise<void> {
    const cleanOwner = this.cleanOwnerName(owner);
    const labels = this.PRIORITY_LABELS[priority];

    // Remove existing priority labels
    await this.removeIssuePriority(cleanOwner, repo, issueNumber);

    // Add new priority label
    try {
      await this.octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner: cleanOwner,
        repo,
        issue_number: issueNumber,
        labels: [labels[0]], // Use the first label for each priority level
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    } catch (error: any) {
      console.error('Error setting issue priority:', {
        message: error.message,
        status: error.status,
        response: error.response?.data,
        owner: cleanOwner,
        repo,
        issueNumber,
        priority
      });
      throw error;
    }
  }

  /**
   * Removes priority labels from an issue
   *
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @returns {Promise<void>}
   * @throws {Error} If the GitHub API request fails
   * @example
   * await repoService.removeIssuePriority('owner', 'repo', 123);
   */
  async removeIssuePriority(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<void> {
    const cleanOwner = this.cleanOwnerName(owner);

    // Get all priority labels
    const allPriorityLabels = [
      ...this.PRIORITY_LABELS.high,
      ...this.PRIORITY_LABELS.medium,
      ...this.PRIORITY_LABELS.low,
    ];

    // Remove each priority label
    for (const label of allPriorityLabels) {
      try {
        await this.octokit.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}', {
          owner: cleanOwner,
          repo,
          issue_number: issueNumber,
          name: label,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
      } catch (error: any) {
        // Ignore errors for labels that don't exist
        if (error?.status !== 404) {
          console.error('Error removing issue label:', {
            message: error.message,
            status: error.status,
            response: error.response?.data,
            owner: cleanOwner,
            repo,
            issueNumber,
            label
          });
          throw error;
        }
      }
    }
  }

  async postResponse(owner: string, repo: string, issueNumber: number, response: string): Promise<void> {
    try {
      const result = await this.octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner,
        repo,
        issue_number: issueNumber,
        body: response,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      this.logger.log(`Posted response to issue #${issueNumber}: ${result.data.html_url}`);
    } catch (error) {
      this.logger.error('Error posting response to GitHub:', error);
      throw error;
    }
  }
}
