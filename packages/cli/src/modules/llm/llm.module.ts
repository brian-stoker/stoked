import { Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { LlmCommand } from './llm.command.js';
import { ConfigModule } from '../config/config.module.js';
import { BatchCheckCommand } from './batch-check.command.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import { LlmServiceProvider, LLM_SERVICE } from './llm.factory.js';

@Module({
  imports: [ConfigModule],
  providers: [
    LlmService,
    LlmCommand,
    BatchCheckCommand,
    ThemeLogger,
    LlmServiceProvider,
    // Provide an alias to make LlmService and LLM_SERVICE available under same token
    {
      provide: 'LLM_SERVICE_ALIAS',
      useExisting: LlmService
    }
  ],
  exports: [LlmService, LLM_SERVICE, 'LLM_SERVICE_ALIAS'],
})
export class LlmModule {}
