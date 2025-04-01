import { Module } from '@nestjs/common';
import { LlmService } from '../../services/llm.service.js';
import { LlmCommand } from '../../commands/llm.command.js';

@Module({
  imports: [],
  providers: [LlmService, LlmCommand],
  exports: [LlmService],
})
export class LlmModule {}
