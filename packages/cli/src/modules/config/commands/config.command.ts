import { Command, CommandRunner } from 'nest-commander';
import { ConfigService } from '../config.service.js';
import { RepoCommand } from './config.repo.command.js';
import { Inject } from '@nestjs/common';
import { ThemeLogger, THEMES } from '../../../logger/theme.logger.js';
// Define a type for command classes
type CommandRunnerType = new (...args: any[]) => CommandRunner;

// This command is no longer needed since we'll have direct commands
// but we'll keep it in case we want to add config-specific features later
@Command({
  name: 'config',
  description: 'Manage configuration settings',
  subCommands: [RepoCommand],
})
export class ConfigCommand extends CommandRunner {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ThemeLogger) private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEMES[2]);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    // Basic command will display help by default
    this.command.help();
  }
}
