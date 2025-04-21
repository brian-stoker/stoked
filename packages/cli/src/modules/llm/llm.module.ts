import { Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { LlmCommand } from './llm.command.js';
import { ConfigModule } from '../config/config.module.js';
import { BatchCheckCommand } from './batch-check.command.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import { ThemeLoggerModule } from '../../logger/theme.logger.module.js';

@Module({
  imports: [ConfigModule, ThemeLoggerModule],
  providers: [
    LlmService,
    ThemeLogger,
  ],
  exports: [LlmService],
})
export class LlmModule {}
