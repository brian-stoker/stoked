import { Module } from '@nestjs/common';
import { LlmService } from '../../services/llm.service.js';
import { LlmCommand } from '../../commands/llm.command.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [ConfigModule],
  providers: [LlmService, LlmCommand],
  exports: [LlmService],
})
export class LlmModule {}
