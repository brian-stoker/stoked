import { Module } from '@nestjs/common';
import { RepoService } from './repo.service.js';
import { ConfigModule } from '../config/config.module.js';
import { ConfigService } from '../config/config.service.js';
import { RepoCommand, IssuesCommand, PlanCommand, PriorityCommand } from './repo.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ThemeLoggerModule } from '../../logger/theme.logger.module.js';

@Module({
  imports: [ConfigModule, LlmModule, ThemeLoggerModule],
  providers: [RepoService, ConfigService, RepoCommand, IssuesCommand, PlanCommand, PriorityCommand],
  exports: [RepoService],
})
export class RepoModule {}
