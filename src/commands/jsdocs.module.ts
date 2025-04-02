import { Module } from '@nestjs/common';
import { JsDocsCommand } from './jsdocs.command.js';
import { ThemeLoggerModule } from '../logger/theme.logger.module.js';
import { LlmModule } from '../services/llm.module.js';
import { RepoModule } from '../services/repo.module.js';

@Module({
  imports: [ThemeLoggerModule, LlmModule, RepoModule],
  providers: [JsDocsCommand],
  exports: [JsDocsCommand],
})
export class JsDocsModule {} 