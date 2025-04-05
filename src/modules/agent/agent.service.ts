import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { RepoService } from '../repo/repo.service.js';
import { LlmService } from '../llm/llm.service.js';
import {ThemeLogger, THEMES} from '../../logger/theme.logger.js';
import type { GitRepoPriority } from '../config/config.service.js';

/**
 * Service responsible for managing the GitHub agent's operations
 *
 * This service provides functionality for:
 * - Running the agent to process GitHub repositories
 * - Selecting issues to work on using LLM
 * - Generating code for selected issues
 * - Managing repository priorities
 * - Logging agent operations
 *
 * @class AgentService
 * @implements {Injectable}
 */
@Injectable()
export class AgentService {
  /**
   * Creates an instance of AgentService
   * @param {ConfigService} configService - Service for managing configuration
   * @param {RepoService} RepoService - Service for interacting with GitHub repositories
   * @param {LlmService} llmService - Service for LLM interactions
   * @param {ThemeLogger} logger - Logger instance with custom theming
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly RepoService: RepoService,
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    this.logger.setTheme(THEMES[0])
  }

  /**
   * Runs the agent to process GitHub repositories
   *
   * This method:
   * 1. Gets all configured repositories
   * 2. For each repository:
   *    - Fetches open issues
   *    - Uses LLM to select an issue to work on
   *    - Generates code for the selected issue
   *    - Logs the completion
   *
   * @returns {Promise<void>}
   * @throws {Error} If no repositories are configured or if issue selection fails
   * @example
   * await agentService.run();
   */
  async run() {
    this.logger.log('Running LLM test...');
    
    // Simple test prompt
    const testPrompt = 'Write "hello world" in TypeScript.';
    
    this.logger.log('Sending test prompt to LLM...');
    const response = await this.llmService.query(testPrompt);
    
    this.logger.log('LLM Response:');
    this.logger.log('----------------------------------------');
    this.logger.log(response);
    this.logger.log('----------------------------------------');
    
    // Don't post anything, just show the response
    this.logger.log('Test complete - verify the response above');
  }
}
