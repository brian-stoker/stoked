import { Module } from '@nestjs/common';
import { JsdocsCommand } from './jsdocs.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConfigModule } from '../config/config.module.js';
import { ProcessBatchCommand } from './process-batch.command.js';
import { ThemeLogger } from '../../logger/theme.logger.js';

@Module({
  imports: [LlmModule, ConfigModule],
  providers: [JsdocsCommand, ProcessBatchCommand, ThemeLogger],
  exports: [JsdocsCommand],
})
export class JsdocsModule {} 