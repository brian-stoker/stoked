import { Module } from '@nestjs/common';
import { AnalyzeCommand } from './analyze.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [
    LlmModule,
    ConfigModule,
  ],
  providers: [AnalyzeCommand],
  exports: [AnalyzeCommand],
})
export class AnalyzeModule {} 