import { Command, CommandRunner, Option } from 'nest-commander';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import { ConfigService } from '../config/config.service.js';

@Injectable()
@Command({
  name: 'schedule',
  description: 'Schedule a prompt based task to run via the operating system\'s native scheduler',
})
export class ScheduleCommand extends CommandRunner {
  
  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(ThemeLogger) private readonly logger: ThemeLogger,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    super();
    this.logger.setTheme(THEMES[5]);
  }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    try {
     
    } catch (error) {
    }
  }
} 