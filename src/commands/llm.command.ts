import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { LlmService } from '../services/llm.service.js';

@Injectable()
@Command({
  name: 'llm',
  description: 'Generate Git commands using LLM',
})
export class LlmCommand extends CommandRunner {
  constructor(private readonly llmService: LlmService) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    if (passedParams.length === 0) {
      console.error('Please provide a description of the changes needed');
      return;
    }

    const description = passedParams.join(' ');
    console.log('Generating Git commands for:', description);

    try {
      const commands = await this.llmService.generateGitCommands(description);
      console.log('\nGenerated commands:');
      console.log(commands);
    } catch (error) {
      console.error('Error generating commands:', error);
    }
  }
} 