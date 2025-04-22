import { Module } from '@nestjs/common';
import { LogModule } from '../log/log.module.js';
import { ConfigModule } from '../config/config.module.js';
import { StokedCommand } from './stoked.command.js';
import { RepoModule } from '../repo/repo.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { AgentModule } from '../agent/agent.module.js';
import { ThemeLoggerModule } from '../../logger/theme.logger.module.js';
import { DocsModule } from '../docs/docs.module.js';
import { TestModule } from '../test/test.module.js';
import { AnalyzeModule } from '../analyze/analyze.module.js';
import { ScheduleModule } from '../schedule/schedule.module.js';

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
    AnalyzeModule,
    ScheduleModule,
  ],
  providers: [StokedCommand],
})
export class CliModule {}
