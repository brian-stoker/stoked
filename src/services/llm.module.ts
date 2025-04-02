import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ThemeLoggerModule } from '../logger/theme.logger.module';

@Module({
  imports: [ThemeLoggerModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {} 