import { Module } from '@nestjs/common';
import { ScheduleCommand } from './schedule.command.js';
import { ScheduleInstantCommand } from './task.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConfigModule } from '../config/config.module.js';
import { RepoModule } from '../repo/repo.module.js';
import { ThemeLoggerModule } from '../../logger/theme.logger.module.js';

@Module({
  imports: [
    LlmModule,
    ConfigModule,
    RepoModule,
    ThemeLoggerModule,
  ],
  providers: [ScheduleCommand, ScheduleInstantCommand],
  exports: [ScheduleCommand, ScheduleInstantCommand],
})
export class ScheduleModule {} 