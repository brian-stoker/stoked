import { Module } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { StartCommand } from './start.command.js';
import { RepoModule } from '../repo/repo.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConfigModule } from '../config/config.module.js';
import { LogModule } from '../log/log.module.js';

@Module({
  imports: [RepoModule, LlmModule, ConfigModule, LogModule],
  providers: [AgentService, StartCommand],
  exports: [AgentService, StartCommand],
})
export class AgentModule {}
