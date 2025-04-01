import { Command, CommandRunner } from 'nest-commander';
import { LlmService } from '../services/llm.service.js';

@Command({
  name: 'llm',
  description: 'Use LLM to generate and execute Git commands based on natural language description',
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
      console.error('Please provide a description of the changes you want to make');
      process.exit(1);
    }

    const description = passedParams.join(' ');
    console.log('Generating Git commands for:', description);

    try {
      const commands = await this.llmService.generateGitCommands(description);
      console.log('\nExecuting commands:');
      commands.forEach((cmd, index) => {
        console.log(`${index + 1}. ${cmd}`);
      });

      await this.llmService.executeGitCommands(commands);
      console.log('Commands executed successfully!');
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  }
} 