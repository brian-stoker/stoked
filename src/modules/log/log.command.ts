import { Injectable } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { LogService } from './log.service.js';
import { THEMES, ThemeLogger } from '../../logger/theme.logger.js';
import { LogCoordsCommand } from './log.coords.command.js';

@Injectable()
@Command({
  name: 'log',
  description: 'Show Stokeds activity log',
  subCommands: [LogCoordsCommand],
})
export class LogCommand extends CommandRunner {
  constructor(
    private readonly logService: LogService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEMES['Deep Ocean']);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    const logs = this.logService.getLogs();
    console.log('Completed PRs:', logs.completedPRs);
    console.log('Stuck Tasks:', logs.stuckTasks);
    console.log('Skipped Issues:', logs.skippedIssues);
  }
}
