import { Module } from '@nestjs/common';
import { DocsCommand } from './docs.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConfigModule } from '../config/config.module.js';
import { ProcessBatchCommand } from './docs.process-batch.command.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import { RepoModule } from '../repo/repo.module.js';

@Module({
  imports: [LlmModule, ConfigModule, RepoModule],
  providers: [...DocsCommand.registerWithSubCommands(), ThemeLogger],
  exports: [DocsCommand, ProcessBatchCommand],
})
export class DocsModule {} 