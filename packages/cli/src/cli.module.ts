import { Module } from '@nestjs/common';
import { LogModule } from './modules/log/log.module.js';
import { ConfigModule } from './modules/config/config.module.js';
import { StokedCommand } from './stoked.command.js';
import { RepoModule } from './modules/repo/repo.module.js';
import { LlmModule } from './modules/llm/llm.module.js';
import { AgentModule } from './modules/agent/agent.module.js';
import { ThemeLoggerModule } from './logger/theme.logger.module.js';
import { DocsModule } from './modules/docs/docs.module.js';
import { TestModule } from './modules/test/test.module.js';
import { UtestModule } from './modules/utest/utest.module.js';

@Module({
  imports: [
    ConfigModule,
    RepoModule,
    LogModule,
    LlmModule,
    AgentModule,
    ThemeLoggerModule,
    DocsModule,
    TestModule,
    UtestModule
  ],
  providers: [StokedCommand],
})
export class CliModule {}
