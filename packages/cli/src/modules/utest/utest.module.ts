import { Module } from '@nestjs/common';
import { UtestCommand } from './utest.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConfigModule } from '../config/config.module.js';
import { ThemeLogger } from '../../logger/theme.logger.js';

@Module({
  imports: [LlmModule, ConfigModule],
  providers: [UtestCommand, ThemeLogger],
  exports: [UtestCommand],
})
export class UtestModule {} 