import { Module } from '@nestjs/common';
import { RepoService } from './repo.service.js';
import { ConfigModule } from '../config/config.module.js';
import { ConfigService } from '../config/config.service.js';
import { RepoCommand, IssuesCommand, PlanCommand } from './repo.command.js';
import { LlmModule } from '../llm/llm.module.js';

@Module({
  imports: [ConfigModule, LlmModule],
  providers: [RepoService, ConfigService, RepoCommand, IssuesCommand, PlanCommand],
  exports: [RepoService],
})
export class RepoModule {}
