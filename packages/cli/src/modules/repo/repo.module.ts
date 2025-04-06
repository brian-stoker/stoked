import { Module } from '@nestjs/common';
import { RepoService } from './repo.service.js';
import { ConfigModule } from '../config/config.module.js';
import { RepoCommand } from './repo.command.js';
import { IssuesCommand } from './repo.issues.command.js';
import { PlanCommand } from './repo.plan.command.js';
import { PriorityCommand } from './repo.priority.command.js';
import { SearchCommand } from './repo.search.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ThemeLoggerModule } from '../../logger/theme.logger.module.js';
import { ThemeLogger, THEME_MAP } from '../../logger/theme.logger.js';
import { ConfigService } from '../config/config.service.js';

@Module({
  imports: [ConfigModule, LlmModule, ThemeLoggerModule],
  providers: [
    {
      provide: RepoService,
      useFactory: (configService: ConfigService, themeLogger: ThemeLogger) => {
        return new RepoService(configService, themeLogger);
      },
      inject: [ConfigService, ThemeLogger]
    },
    RepoCommand, 
    IssuesCommand, 
    PlanCommand, 
    PriorityCommand, 
    SearchCommand
  ],
  exports: [RepoService],
})
export class RepoModule {}
