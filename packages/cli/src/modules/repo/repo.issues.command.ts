import { Injectable } from '@nestjs/common';
import { SubCommand, CommandRunner } from 'nest-commander';
import { RepoService } from './repo.service.js';
import { ThemeLogger, THEME_MAP } from '../../logger/theme.logger.js';

@Injectable()
@SubCommand({
  name: 'issues',
  description: 'List open issues for a GitHub repository',
})
export class IssuesCommand extends CommandRunner {
  constructor(
    private readonly logger: ThemeLogger,
    private readonly repoService: RepoService,
  ) {
    super();
    this.logger.setTheme(THEME_MAP['Aqua & Azure']);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    if (!passedParams.length) {
      console.error('Please provide a repository in the format owner/repo');
      return;
    }

    const repoFullName = passedParams[0];

    try {
      const issues = await this.repoService.getIssues(repoFullName);

      if (issues.length === 0) {
        console.log(`No open issues found for ${repoFullName}`);
        return;
      }

      console.log(`Open issues for ${repoFullName}:`);
      issues.forEach((issue, index) => {
        console.log(`\n[${index + 1}] #${issue.number}: ${issue.title}`);
        console.log(`URL: ${issue.html_url}`);
        if (issue.body) {
          const truncatedBody =
            issue.body.length > 150
              ? issue.body.substring(0, 150) + '...'
              : issue.body;
          console.log(`Description: ${truncatedBody}`);
        }
        console.log(
          `Created: ${issue.created_at}, Updated: ${issue.updated_at}`,
        );
        console.log(
          `Labels: ${
            issue.labels
              .map((label) => (typeof label === 'string' ? label : label.name))
              .join(', ') || 'None'
          }`,
        );
      });
    } catch (error) {
      console.error(`Error fetching issues for ${repoFullName}:`, error);
    }
  }
}
