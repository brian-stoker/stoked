import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';
import { RepoService } from './repo.service.js';
import { LlmService } from '../llm/llm.service.js';
import { THEME_MAP, ThemeLogger } from '../../logger/theme.logger.js';
import { Injectable } from '@nestjs/common';
import { IssuesCommand } from './repo.issues.command.js';
import { PlanCommand } from './repo.plan.command.js';
import { PriorityCommand } from './repo.priority.command.js';
import { SearchCommand } from './repo.search.command.js'; 

@Injectable()
@Command({
  name: 'repo',
  description: 'Interact with GitHub repositories',
  subCommands: [IssuesCommand, PlanCommand, PriorityCommand, SearchCommand],
})
export class RepoCommand extends CommandRunner {
  constructor(
    private readonly repoService: RepoService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEME_MAP['Aqua & Azure']);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    // The library will automatically display help when no subcommand is provided
    this.logger.log('Use a subcommand: issues, plan, priority, search');
    this.logger.log('For more details, use: stoked repo --help');
  }
}
