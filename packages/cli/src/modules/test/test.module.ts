import { Module } from '@nestjs/common';
import { TestCommand } from './test.command.js';
import { LlmModule } from '../llm/llm.module.js';

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
  ],
  providers: [
    TestCommand,
  ],
  exports: [
    TestCommand,
  ],
})
export class TestModule {} 