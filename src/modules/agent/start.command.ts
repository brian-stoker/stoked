import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { RepoService } from '../repo/repo.service.js';
import { LlmService } from '../../services/llm.service.js';
import { THEMES, ThemeLogger } from '../../logger/theme.logger.js';
import { ConfigService } from '../config/config.service.js';
import { execSync } from 'child_process';

interface GitRepo {
  owner: string;
  repo: string;
  priority: 'high' | 'medium' | 'low';
}

@Injectable()
@Command({
  name: 'start',
  description: 'Start the GitHub agent workflow',
})
export class StartCommand extends CommandRunner {
  constructor(
    private readonly repoService: RepoService,
    private readonly llmService: LlmService,
    private readonly configService: ConfigService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEMES[0]);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      // Step 1: Get the highest priority repo
      this.logger.log('Getting highest priority repository...');
      const repos = this.configService.getAllGitRepos();
      
      if (repos.length === 0) {
        this.logger.error('No repositories configured. Please add a repository first.');
        return;
      }

      // Get priority order: high > medium > low
      const highRepos = repos.filter((r: GitRepo) => r.priority === 'high');
      const mediumRepos = repos.filter((r: GitRepo) => r.priority === 'medium');
      const lowRepos = repos.filter((r: GitRepo) => r.priority === 'low');

      let topRepo: GitRepo | undefined;
      if (highRepos.length > 0) {
        topRepo = highRepos[0];
      } else if (mediumRepos.length > 0) {
        topRepo = mediumRepos[0];
      } else if (lowRepos.length > 0) {
        topRepo = lowRepos[0];
      }

      if (!topRepo) {
        this.logger.error('No repositories found with priority.');
        return;
      }

      const repoFullName = `${topRepo.owner}/${topRepo.repo}`;
      this.logger.log(`Selected repository: ${repoFullName} (${topRepo.priority} priority)`);

      // Step 2: Get issues for the selected repo
      this.logger.log('Fetching issues...');
      const issues = await this.repoService.getIssues(repoFullName);

      if (issues.length === 0) {
        this.logger.log('No open issues found.');
        return;
      }

      // Step 3: Process each issue
      for (const issue of issues) {
        this.logger.log(`\nProcessing issue #${issue.number}: ${issue.title}`);
        
        // Generate a plan or request more details
        const prompt = `
You are a helpful assistant tasked with analyzing a GitHub issue.

ISSUE TITLE: ${issue.title}
ISSUE DESCRIPTION:
${issue.body || 'No description provided'}

Please analyze this issue and either:
1. Provide a detailed implementation plan that includes:
   - Step-by-step breakdown of tasks
   - Technical considerations
   - Potential obstacles
   - Estimated complexity
2. OR explain why more details are needed and what specific information would help create a plan.

Format your response as a markdown document with clear sections.
        `;

        const response = await this.llmService.query(prompt);
        this.logger.log('\nAnalysis:');
        this.logger.log(response);

        // Post the response as a comment
        try {
          await this.repoService.postResponse(
            topRepo.owner,
            topRepo.repo,
            issue.number,
            response,
          );
          this.logger.log('Response posted as comment.');
        } catch (error) {
          this.logger.warn('Could not post response to GitHub (requires authentication)');
        }
      }
    } catch (error) {
      this.logger.error('Error in workflow:', error);
      throw error;
    }
  }
}
