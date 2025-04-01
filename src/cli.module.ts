import { Module } from '@nestjs/common';
import { LogModule } from './modules/log/log.module.js';
import { ConfigModule } from './modules/config/config.module.js';
import { StokedCommand } from './stoked.command.js';
import { RepoModule } from './modules/repo/repo.module.js';
import { LlmModule } from './modules/llm/llm.module.js';
import { AgentModule } from './modules/agent/agent.module.js';

@Module({
  imports: [ConfigModule, RepoModule, LogModule, LlmModule, AgentModule],
  providers: [StokedCommand],
})
export class CliModule {}
