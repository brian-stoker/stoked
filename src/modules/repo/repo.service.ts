import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { ConfigService } from '../config/config.service.js';
import type { GitRepoPriority } from '../config/config.service.js';
import { Logger } from '@nestjs/common';
import { ThemeLogger, THEME_MAP, THEMES } from '../../logger/theme.logger.js';

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
  lineNumbers?: string[];
  /** The full name of the repository (owner/repo) */
  repoFullName?: string;
  /** The priority level assigned to the result */
  priority?: 'low' | 'medium' | 'high';
  /** Path to the file within the repository */
  path?: string;
  /** Code snippet showing the matching line and context */
  codeSnippet?: string[];
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

  /**
   * Creates an instance of RepoService
   * @param {ConfigService} configService - Service for managing configuration
   * @param {ThemeLogger} logger - Logger service
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: ThemeLogger
  ) {
    this.logger.setTheme(THEME_MAP['Aqua & Azure'] || THEMES[0]);
    
    this.logger.log('GitHub Token:', process.env.GITHUB_TOKEN ? 'Present' : 'Missing');
    
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
      // Format the query for GitHub search API
      const fullQuery = filters ? `${query} ${filters}` : query;
      this.logger.log(`Performing GitHub code search with query: ${fullQuery}`);
      
      // Make the API request
      const { data } = await this.octokit.request('GET /search/code', {
        q: fullQuery,
        per_page: 30, // Limit results to avoid rate limits
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      this.logger.log(`Found ${data.total_count} total results (displaying top ${data.items?.length || 0})`);
      
      // Make sure we have items in the response
      if (!data.items || !Array.isArray(data.items)) {
        this.logger.warn('GitHub API returned unexpected data format');
        return [];
      }
      
      // Map the results to our SearchResult format
      const results: SearchResult[] = [];
      
      for (const item of data.items) {
        if (item && item.repository) {
          // Find the text match if available
          const textMatches = item.text_matches || [];
          let matchLine = 1;
          
          if (textMatches.length > 0 && 'line_number' in textMatches[0]) {
            matchLine = (textMatches[0] as any).line_number;
          } else if (item.line_numbers && item.line_numbers.length > 0) {
            matchLine = parseInt(item.line_numbers[0], 10);
          }
          
          const result: SearchResult = {
            title: `${item.path}`,
            url: item.html_url,
            lineNumbers: [matchLine.toString()],
            description: `Code match in ${item.repository.full_name}`,
            additionalInfo: `File: ${item.path}, Repository: ${item.repository.full_name}`,
            repoFullName: item.repository.full_name,
            path: item.path,
          };
          
          try {
            const [owner, repo] = item.repository.full_name.split('/');
            // Get content from the file around the matching line
            const codeSnippet = await this.fetchFileSnippet(owner, repo, item.path, matchLine);
            
            if (codeSnippet && codeSnippet.length > 0) {
              // Search in the snippet for the actual search term to highlight the right line
              let foundMatch = false;
              const searchTermLower = query.toLowerCase();
              
              for (let i = 0; i < codeSnippet.length; i++) {
                if (codeSnippet[i].toLowerCase().includes(searchTermLower)) {
                  // Update the line number to point to the actual matching line
                  result.lineNumbers = [(matchLine - (codeSnippet.length - 1) / 2 + i).toString()];
                  foundMatch = true;
                  break;
                }
              }
              
              if (!foundMatch) {
                this.logger.warn(`Could not find search term "${query}" in the code snippet for ${item.path}`);
              }
              
              result.codeSnippet = codeSnippet;
            }
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Error processing code snippet: ${errorMessage}`);
          }
          
          results.push(result);
        }
      }

      return this.prioritizeResults(results);
    } catch (error: any) {
      // Handle specific GitHub API errors
      if (error.status === 403 && error.response?.headers?.['x-ratelimit-remaining'] === '0') {
        this.logger.error('GitHub API rate limit exceeded. Try again later.');
      } else if (error.status === 401) {
        this.logger.error('GitHub API authentication failed. Please check your GitHub token.');
      } else if (error.status === 422) {
        this.logger.error('GitHub API query validation failed. Your search query might be invalid.');
        this.logger.error(`Error details: ${error.response?.data?.message || 'Unknown error'}`);
      } else {
        this.logger.error('Error searching code:', error.message || error);
      }
      
      return [];
    }
  }

  /**
   * Fetches file content from GitHub and extracts the snippet around the matching line
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} path - Path to the file within the repository
   * @param {number} lineNumber - Line number where the match was found
   * @param {number} [contextLines=2] - Number of lines to include before and after the match
   * @returns {Promise<string[]>} Array of code lines with the matching line and context
   * @throws {Error} If the GitHub API request fails
   */
  private async fetchFileSnippet(
    owner: string, 
    repo: string, 
    path: string, 
    lineNumber: number,
    contextLines: number = 2
  ): Promise<string[]> {
    try {
      // Fetch the file content
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      
      const data = response.data as { content?: string };
      
      // GitHub API returns the content as base64 encoded
      if (!data || !data.content) {
        throw new Error('No content returned from GitHub API');
      }
      
      // Decode the content and split into lines
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const lines = content.split('\n');
      
      // Calculate the range of lines to include
      const startLine = Math.max(0, lineNumber - contextLines - 1); // -1 because array is 0-indexed but line numbers start at 1
      const endLine = Math.min(lines.length - 1, lineNumber + contextLines - 1);
      
      // Extract the relevant lines
      const snippet: string[] = [];
      for (let i = startLine; i <= endLine; i++) {
        if (i >= 0 && i < lines.length) {
          snippet.push(lines[i]);
        }
      }
      
      return snippet;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error fetching file content: ${errorMessage}`);
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
      this.logger.error('Error searching issues and PRs:', error);
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
      this.logger.error('Error searching repositories:', error);
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
      this.logger.error('Error searching topics:', error);
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
    // Ensure we have results to process
    if (!results || results.length === 0) {
      return [];
    }

    const prioritizedResults = [...results];

    // Get all configured repositories
    const allRepos = this.configService.getAllGitRepos() || [];
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
        this.logger.warn('Unexpected response format:', data);
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
      this.logger.error('Error getting issues:', {
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
      this.logger.error('Error getting issue details:', {
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
      this.logger.error('Error creating comment:', {
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
      this.logger.error('Error creating branch:', {
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
      this.logger.error('Error creating PR:', {
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
      this.logger.error('Error setting issue priority:', {
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
          this.logger.error('Error removing issue label:', {
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
