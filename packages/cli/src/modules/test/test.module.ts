import { Module } from '@nestjs/common';
import { TestCommand } from './test.command.js';
import { LlmModule } from '../llm/llm.module.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import { UnitTestCommand } from './test.unit.command.js';
import { ConfigModule } from '../config/config.module.js';

/**
 * Module for test generation functionality
 * 
 * Provides commands and services for:
 * - Analyzing repository structure
 * - Detecting test frameworks
 * - Generating tests based on repository type
 */
@Module({
  imports: [
    LlmModule,
    ConfigModule,
  ],
  providers: [
    TestCommand,
    UnitTestCommand,
    ThemeLogger,
  ],
  exports: [
    TestCommand,
  ],
})
export class TestModule {} 