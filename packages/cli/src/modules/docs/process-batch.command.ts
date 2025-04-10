import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { ThemeLogger } from '../../logger/theme.logger.js';
import { LlmService } from '../llm/llm.service.js';

@Injectable()
@Command({
  name: 'process-batch',
  description: 'Process documentation batch files'
})
export class ProcessBatchCommand extends CommandRunner {
  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
  }

  @Option({
    flags: '-d, --debug',
    description: 'Enable debug mode with verbose logging'
  })
  parseDebug(): void {
    // Enable NODE_DEBUG for HTTP requests to see API calls
    process.env.NODE_DEBUG = 'http,https';
    this.logger.log('Debug mode enabled with verbose logging');
  }

  async run(passedParams: string[]): Promise<void> {
    this.logger.log('Processing documentation batch files...');
    // Implementation will be added later
  }
} 