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
    // Display help information about available subcommands
    console.log('Language model utilities and operations');
    console.log('\nAvailable commands:');
    console.log('  batch-check    Check status of all pending OpenAI batch operations');
    console.log('\nRun with --help for more information on each command.');
  }
} 