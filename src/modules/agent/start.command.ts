import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { RepoService, type GitHubIssue } from '../repo/repo.service.js';
import { LlmService } from '../llm/llm.service.js';
import { THEMES, ThemeLogger } from '../../logger/theme.logger.js';

@Injectable()
@Command({
  name: 'start',
  description: 'Start the GitHub agent',
})
export class StartCommand extends CommandRunner {
  constructor(
    private readonly RepoService: RepoService,
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    // CLAUDE TODO: Read repos from ~/.stoked instead of using an empty array.. need to have three different priority levels 'low', 'medium', 'high' so this means we need a hierarchy that looks like this for the repo owner => repo => priority should probably have a config module to manage config data
    const repos: string[] = [];

    for (const repo of repos) {
      const issues = await this.RepoService.getIssues(repo);
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
        throw new Error('no issues selected');
      }

      // Generate branch name
      const branchPrompt = `Generate a feature branch name for issue #${issue?.id} with prefix "feat/" (e.g., feat/issue-123-description)`;
      const branchName = await this.llmService.query(branchPrompt);
      await this.RepoService.createBranch(repo, 'main', branchName);

      let testsPass = false;
      if (!testsPass) {
        // CLAUDE TODO: Implement an agent command that
      }
      // Create PR
      await this.RepoService.createPR(
        repo,
        branchName,
        'main',
        `Fixes #${issue.number}`,
      );
      this.logger.log(`PR created for ${repo} issue #${issue.number}`);
    }
  }
}
