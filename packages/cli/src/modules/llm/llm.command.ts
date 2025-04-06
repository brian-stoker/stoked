import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { BatchCheckCommand } from './batch-check.command.js';

@Injectable()
@Command({
  name: 'llm',
  description: 'Language model utilities and operations',
  subCommands: [BatchCheckCommand],
})
export class LlmCommand extends CommandRunner {
  constructor(
    private readonly llmService: LlmService,
  ) {
    super();
  }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    this.command.help();
  }
} 