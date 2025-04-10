import { Module } from '@nestjs/common';
import { DocsCommand } from './docs.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConfigModule } from '../config/config.module.js';
import { ProcessBatchCommand } from './process-batch.command.js';
import { ThemeLogger } from '../../logger/theme.logger.js';

@Module({
  imports: [LlmModule, ConfigModule],
  providers: [DocsCommand, ProcessBatchCommand, ThemeLogger],
  exports: [DocsCommand],
})
export class DocsModule {} 