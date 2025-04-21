import { Inject, Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { ConfigService } from '../config/config.service.js';
import type { GitRepoPriority } from '../config/config.service.js';
import { Logger } from '@nestjs/common';
import { ThemeLogger, THEME_MAP, THEMES } from '../../logger/theme.logger.js';
import { execSync } from 'child_process';
import { RepoService } from '../repo/repo.service.js';
import { LlmService } from '../llm/llm.service.js';
import { packageClassificationPrompt } from '../llm/prompts/packageClassification.js';


/** Type alias for an array of GitHub issues */
type packageType = 'backend' | 'frontend' | 'utility' | 'cli' | 'ml' | 'sdk' | 'mobile' | 'other';

/**
 * Service responsible for interacting with GitHub repositories
 *
 * This service provides functionality for:
 * - Searching code, issues, PRs, and repositories
 * - Managing repository priorities
 * - Managing issue priorities
 * - Creating branches and pull requests
 * - Managing issue comments
 *
 * @class RepoService
 * @implements {Injectable}
 */
@Injectable()
export class AnalyzeCommand {
  
  /**
   * Creates an instance of RepoService
   * @param {ConfigService} configService - Service for managing configuration
   * @param {ThemeLogger} logger - Logger service
   */
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ThemeLogger) private readonly logger: ThemeLogger,
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(RepoService) private readonly repoService: RepoService
  ) {
    this.logger.setTheme(THEMES[1]);
  }

  async classifyProjectType(project: { owner: string, repo: string }): Promise<packageType> {
    this.configService.activeRepo = project;
    const fileStructure = await this.repoService.getFileStructure();
    const codeSnippets: Record<string, string> = {}
    const prompt = packageClassificationPrompt({ packageJson: JSON.stringify(this.repoService.packageJson), fileStructure, codeSnippets });
    const response = await this.llmService.query(prompt);
    if (response.indexOf('backend') !== -1) {
      return 'backend';
    } else if (response.indexOf('frontend') !== -1) {
      return 'frontend';
    } else if (response.indexOf('utility') !== -1) {
      return 'utility';
    } else if (response.indexOf('cli') !== -1) {
      return 'cli';
    } else if (response.indexOf('ml') !== -1) {
      return 'ml';
    } else if (response.indexOf('sdk') !== -1) {
      return 'sdk';
    } else if (response.indexOf('mobile') !== -1) {
      return 'mobile';
    } else {
      return 'other';
    }
  }
}
