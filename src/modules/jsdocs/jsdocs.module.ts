import { Module } from '@nestjs/common';
import { JsDocsCommand } from '../../commands/jsdocs.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [LlmModule, ConfigModule],
  providers: [JsDocsCommand],
  exports: [JsDocsCommand],
})
export class JsDocsModule {} 