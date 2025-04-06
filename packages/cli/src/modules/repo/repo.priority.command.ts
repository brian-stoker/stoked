import { Injectable } from '@nestjs/common';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { RepoService } from './repo.service.js';
import { ThemeLogger, THEME_MAP } from '../../logger/theme.logger.js';

@Injectable()
@SubCommand({
  name: 'priority',
  description: 'Set or remove priority for an issue',
})
export class PriorityCommand extends CommandRunner {
  constructor(
    private readonly repoService: RepoService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEME_MAP['Aqua & Azure']);
  }

  @Option({
    flags: '-n, --number <number>',
    description: 'Issue number to set priority for',
    required: true,
  })
  parseIssueNumber(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '-p, --priority <priority>',
    description: 'Priority level (high, medium, low)',
    required: true,
  })
  parsePriority(val: string): 'high' | 'medium' | 'low' {
    if (!['high', 'medium', 'low'].includes(val)) {
      throw new Error('Priority must be one of: high, medium, low');
    }
    return val as 'high' | 'medium' | 'low';
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
    const issueNumber = options?.number;
    const priority = options?.priority;

    if (!issueNumber) {
      console.error('Please provide an issue number with --number or -n flag');
      return;
    }

    if (!priority) {
      console.error('Please provide a priority with --priority or -p flag');
      return;
    }

    try {
      const [owner, repo] = repoFullName.split('/');
      await this.repoService.setIssuePriority(
        owner,
        repo,
        issueNumber,
        priority,
      );
      console.log(
        `Set priority ${priority} for issue #${issueNumber} in ${repoFullName}`,
      );
    } catch (error) {
      console.error(`Error setting priority for issue #${issueNumber}:`, error);
    }
  }
}
