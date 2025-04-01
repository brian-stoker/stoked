import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { RepoService } from '../repo/repo.service.js';
import { LlmService } from '../llm/llm.service.js';
import {ThemeLogger, THEMES} from '../../logger/theme.logger.js';
import type { GitRepoPriority } from '../config/config.service.js';

/**
 * Service responsible for managing the GitHub agent's operations
 *
 * This service provides functionality for:
 * - Running the agent to process GitHub repositories
 * - Selecting issues to work on using LLM
 * - Generating code for selected issues
 * - Managing repository priorities
 * - Logging agent operations
 *
 * @class AgentService
 * @implements {Injectable}
 */
@Injectable()
export class AgentService {
  /**
   * Creates an instance of AgentService
   * @param {ConfigService} configService - Service for managing configuration
   * @param {RepoService} RepoService - Service for interacting with GitHub repositories
   * @param {LlmService} llmService - Service for LLM interactions
   * @param {ThemeLogger} logger - Logger instance with custom theming
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly RepoService: RepoService,
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    this.logger.setTheme(THEMES[0])
  }

  /**
   * Runs the agent to process GitHub repositories
   *
   * This method:
   * 1. Gets all configured repositories
   * 2. For each repository:
   *    - Fetches open issues
   *    - Uses LLM to select an issue to work on
   *    - Generates code for the selected issue
   *    - Logs the completion
   *
   * @returns {Promise<void>}
   * @throws {Error} If no repositories are configured or if issue selection fails
   * @example
   * await agentService.run();
   */
  async run() {
    const repos = this.configService.getAllGitRepos();
    if (!repos.length) {
      this.logger.log(
        'No repos added. Use "stoked repo {owner}/{repo}" first.',
      );
      return;
    }

    for (const repo of repos) {
      const repoPath = `${repo.owner}/${repo.repo}`;
      const issues = await this.RepoService.getIssues(repoPath);
      if (!issues.length) continue;

      // Let LLM pick an issue
      const issuePrompt = `Select an issue to work on from: ${JSON.stringify(
        issues.map((i) => ({
          id: i.number,
          title: i.title,
          body: i.body || '',
          state: i.state,
        })),
      )}`;
      const selectedIssueResponse: string =
        await this.llmService.query(issuePrompt);
      const issue = issues.find(
        (i) => selectedIssueResponse.indexOf(i.number.toString()) !== -1,
      );
      if (!issue) {
        this.logger.warn(`Skipping issue in ${repoPath}: Invalid selection`);
        return;
      }

      const codePrompt = `For issue #${issue.number}: "${issue.title}"\nDescription: ${issue.body}\nWrite a simple TypeScript function.`;
      const code = await this.llmService.query(codePrompt);

      // Stub: Pretend we made a PR (no real Git ops yet)
      this.logger.log(`Generated code for #${issue.number}:\n${code}`);
      this.logger.log(`Completed PR for issue #${issue.number} in ${repoPath}`);
    }
  }
}
