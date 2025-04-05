import { Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { LlmCommand } from './llm.command.js';
import { BatchCheckCommand } from './batch-check.command.js';
import { ConfigModule } from '../config/config.module.js';
import { ThemeLogger } from '../../logger/theme.logger.js';

@Module({
  imports: [ConfigModule],
  providers: [LlmService, LlmCommand, BatchCheckCommand, ThemeLogger],
  exports: [LlmService],
})
export class LlmModule {}
