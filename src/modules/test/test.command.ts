import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { LlmService, LlmMode } from '../llm/llm.service.js';
import * as child_process from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(child_process.exec);

/**
 * Command for generating tests for a repository
 * 
 * This command analyzes a repository, identifies test patterns and gaps,
 * and generates appropriate tests to improve coverage and reliability.
 */
@Injectable()
@Command({
  name: 'test',
  description: 'Generate tests for a repository',
})
export class TestCommand extends CommandRunner {
  private readonly logger = new Logger(TestCommand.name);
  
  // Default settings
  private readonly defaultTargetCoverage = 80; // Default coverage target (percentage)
  private readonly defaultTestTypes = ['unit']; // Default test types to generate
  
  // Test mode settings
  private readonly testMode = process.env.TEST_MODE === 'true';
  private readonly maxTestFiles = process.env.MAX_TEST_FILES ? parseInt(process.env.MAX_TEST_FILES, 10) : 5;
  
  constructor(
    private readonly llmService: LlmService
    // Will add more services as we implement them:
    // private readonly repoManager: RepoManagerService,
    // private readonly testDetection: TestDetectionService,
    // private readonly coverageAnalyzer: CoverageAnalyzerService,
  ) {
    super();
  }
  
  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      if (!passedParams || passedParams.length === 0) {
        this.logger.error('Repository parameter is required. Usage: stoked test owner/repo');
        return;
      }
      
      const repository = passedParams[0];
      
      // Parse repository format (owner/repo)
      const [owner, repo] = repository.split('/');
      if (!owner || !repo) {
        this.logger.error('Invalid repository format. Expected format: owner/repo');
        return;
      }
      
      this.logger.log(`Analyzing repository: ${owner}/${repo}`);
      
      // Parse options
      const includePaths = options?.include?.split(',') || [];
      const testTypes = options?.types?.split(',') || this.defaultTestTypes;
      const coverageTarget = options?.coverageTarget || this.defaultTargetCoverage;
      const llmProvider = options?.llmProvider || (process.env.OPENAI_API_KEY ? 'openai' : 'ollama');
      const useBatch = options?.batch === true;
      
      // Validate options
      if (useBatch && llmProvider !== 'openai') {
        this.logger.warn('Batch processing is only available with OpenAI. Ignoring --batch flag.');
      }
      
      // Log configuration
      this.logger.log(`Test types to generate: ${testTypes.join(', ')}`);
      this.logger.log(`Coverage target: ${coverageTarget}%`);
      this.logger.log(`Using LLM provider: ${llmProvider}`);
      
      if (includePaths.length > 0) {
        this.logger.log(`Including paths: ${includePaths.join(', ')}`);
      } else {
        this.logger.log('Including all paths');
      }
      
      // Step 1: Clone repository
      this.logger.log('1. Cloning repository...');
      const repoPath = await this.cloneRepository(owner, repo);
      if (!repoPath) {
        this.logger.error('Failed to clone repository');
        return;
      }
      
      // Step 2: Analyze repository structure
      this.logger.log('2. Analyzing repository structure...');
      const repoType = await this.analyzeRepositoryType(repoPath);
      this.logger.log(`Detected repository type: ${repoType.type}`);
      if (repoType.isMonorepo) {
        this.logger.log(`Detected monorepo structure with packages:`);
        if (repoType.packages && repoType.packages.length > 0) {
          repoType.packages.forEach(pkg => this.logger.log(` - ${pkg}`));
        }
      }
      
      // Step 3: Detect testing frameworks
      this.logger.log('3. Detecting existing test frameworks...');
      const frameworks = await this.detectTestFrameworks(repoPath);
      this.logger.log(`Detected test frameworks:`);
      Object.entries(frameworks).forEach(([type, framework]) => {
        this.logger.log(` - ${type}: ${framework || 'None detected'}`);
      });
      
      // Step 4: Analyze coverage
      this.logger.log('4. Analyzing current test coverage...');
      const coverage = await this.analyzeCoverage(repoPath);
      if (coverage) {
        this.logger.log(`Current test coverage: ${coverage.overall}%`);
        this.logger.log(`Coverage by type:`);
        Object.entries(coverage.byType).forEach(([type, value]) => {
          this.logger.log(` - ${type}: ${value}%`);
        });
      } else {
        this.logger.log('No coverage information found');
      }
      
      // Step 5: Generate tests
      this.logger.log('5. Generating tests...');
      // TODO: Implement test generation
      
      // Step 6: Generate summary
      this.logger.log('6. Generating summary report...');
      
      this.logger.log('Done!');
    } catch (error) {
      this.logger.error(`Error generating tests: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Clones the repository to a local directory
   * 
   * @param owner The repository owner
   * @param repo The repository name
   * @returns The path to the cloned repository, or null if the operation failed
   */
  private async cloneRepository(owner: string, repo: string): Promise<string | null> {
    try {
      // Create a temporary directory for repositories if it doesn't exist
      const reposDir = path.join(os.homedir(), '.stoked', '.repos');
      if (!fs.existsSync(reposDir)) {
        fs.mkdirSync(reposDir, { recursive: true });
      }
      
      // Create owner directory
      const ownerDir = path.join(reposDir, owner);
      if (!fs.existsSync(ownerDir)) {
        fs.mkdirSync(ownerDir, { recursive: true });
      }
      
      // Set the target repository path
      const repoPath = path.join(ownerDir, repo);
      
      // Check if the repository already exists
      if (fs.existsSync(repoPath)) {
        this.logger.log(`Repository already exists at ${repoPath}`);
        
        // Check if it's a git repository
        try {
          await execAsync('git rev-parse --is-inside-work-tree', { cwd: repoPath });
          
          // Pull latest changes
          this.logger.log('Pulling latest changes...');
          await execAsync('git pull', { cwd: repoPath });
        } catch (error) {
          this.logger.error(`Directory exists but is not a git repository: ${repoPath}`);
          return null;
        }
      } else {
        // Clone the repository
        this.logger.log(`Cloning repository to ${repoPath}...`);
        const gitUrl = `https://github.com/${owner}/${repo}.git`;
        await execAsync(`git clone ${gitUrl} ${repoPath}`);
      }
      
      return repoPath;
    } catch (error) {
      this.logger.error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Analyzes the repository structure to determine its type
   * 
   * @param repoPath The path to the repository
   * @returns The repository type information
   */
  private async analyzeRepositoryType(repoPath: string): Promise<{
    type: 'frontend-web' | 'frontend-mobile' | 'frontend-lib' | 'backend-api' | 'backend-lib' | 'general-lib' | 'unknown';
    isMonorepo: boolean;
    packages?: string[];
  }> {
    try {
      // Check for monorepo structure
      const isLerna = fs.existsSync(path.join(repoPath, 'lerna.json'));
      const hasWorkspaces = await this.hasPackageWorkspaces(repoPath);
      const isMonorepo = isLerna || hasWorkspaces;
      
      // Get packages if it's a monorepo
      let packages: string[] = [];
      if (isMonorepo) {
        packages = await this.getMonorepoPackages(repoPath);
      }
      
      // Determine repository type based on dependencies and structure
      const packageJsonPath = path.join(repoPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return {
          type: 'unknown',
          isMonorepo,
          packages,
        };
      }
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };
      
      // Frontend web detection
      if (
        allDeps.react || 
        allDeps.vue || 
        allDeps.angular || 
        allDeps.svelte || 
        allDeps.next || 
        allDeps.nuxt
      ) {
        return {
          type: 'frontend-web',
          isMonorepo,
          packages,
        };
      }
      
      // Frontend mobile detection
      if (
        allDeps['react-native'] || 
        allDeps.expo || 
        allDeps.flutter || 
        allDeps.ionic
      ) {
        return {
          type: 'frontend-mobile',
          isMonorepo,
          packages,
        };
      }
      
      // Backend API detection
      if (
        allDeps.express || 
        allDeps.fastify || 
        allDeps.koa || 
        allDeps.hapi || 
        allDeps['@nestjs/core'] ||
        allDeps['@apollo/server'] ||
        allDeps['graphql-yoga']
      ) {
        return {
          type: 'backend-api',
          isMonorepo,
          packages,
        };
      }
      
      // Component library detection
      if (
        packageJson.name?.includes('components') ||
        packageJson.name?.includes('ui') ||
        packageJson.name?.includes('design-system') ||
        packageJson.keywords?.includes('components') ||
        packageJson.keywords?.includes('ui-library') ||
        packageJson.keywords?.includes('design-system')
      ) {
        return {
          type: 'frontend-lib',
          isMonorepo,
          packages,
        };
      }
      
      // Backend library detection
      if (
        packageJson.keywords?.includes('nestjs') ||
        packageJson.keywords?.includes('backend') ||
        packageJson.keywords?.includes('server')
      ) {
        return {
          type: 'backend-lib',
          isMonorepo,
          packages,
        };
      }
      
      // General library detection (default)
      return {
        type: 'general-lib',
        isMonorepo,
        packages,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze repository type: ${error instanceof Error ? error.message : String(error)}`);
      return {
        type: 'unknown',
        isMonorepo: false,
      };
    }
  }
  
  /**
   * Checks if the package.json has workspaces defined (yarn/npm workspaces)
   */
  private async hasPackageWorkspaces(repoPath: string): Promise<boolean> {
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return !!packageJson.workspaces;
    } catch {
      return false;
    }
  }
  
  /**
   * Gets the list of packages in a monorepo
   */
  private async getMonorepoPackages(repoPath: string): Promise<string[]> {
    const packages: string[] = [];
    
    // Check for lerna packages
    const lernaJsonPath = path.join(repoPath, 'lerna.json');
    if (fs.existsSync(lernaJsonPath)) {
      try {
        const lernaJson = JSON.parse(fs.readFileSync(lernaJsonPath, 'utf8'));
        const packagePatterns = lernaJson.packages || ['packages/*'];
        
        for (const pattern of packagePatterns) {
          // Simple glob matching for common patterns
          if (pattern.endsWith('/*')) {
            const dirPath = path.join(repoPath, pattern.replace('/*', ''));
            if (fs.existsSync(dirPath)) {
              const items = fs.readdirSync(dirPath);
              for (const item of items) {
                const itemPath = path.join(dirPath, item);
                if (fs.statSync(itemPath).isDirectory() && fs.existsSync(path.join(itemPath, 'package.json'))) {
                  packages.push(path.relative(repoPath, itemPath));
                }
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to parse lerna.json: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Check for yarn/npm workspaces
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const workspaces = packageJson.workspaces;
        
        if (Array.isArray(workspaces)) {
          for (const pattern of workspaces) {
            if (pattern.endsWith('/*')) {
              const dirPath = path.join(repoPath, pattern.replace('/*', ''));
              if (fs.existsSync(dirPath)) {
                const items = fs.readdirSync(dirPath);
                for (const item of items) {
                  const itemPath = path.join(dirPath, item);
                  if (fs.statSync(itemPath).isDirectory() && fs.existsSync(path.join(itemPath, 'package.json'))) {
                    const relativePath = path.relative(repoPath, itemPath);
                    if (!packages.includes(relativePath)) {
                      packages.push(relativePath);
                    }
                  }
                }
              }
            }
          }
        } else if (workspaces?.packages && Array.isArray(workspaces.packages)) {
          for (const pattern of workspaces.packages) {
            if (pattern.endsWith('/*')) {
              const dirPath = path.join(repoPath, pattern.replace('/*', ''));
              if (fs.existsSync(dirPath)) {
                const items = fs.readdirSync(dirPath);
                for (const item of items) {
                  const itemPath = path.join(dirPath, item);
                  if (fs.statSync(itemPath).isDirectory() && fs.existsSync(path.join(itemPath, 'package.json'))) {
                    const relativePath = path.relative(repoPath, itemPath);
                    if (!packages.includes(relativePath)) {
                      packages.push(relativePath);
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to parse package.json: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return packages;
  }
  
  /**
   * Detects the testing frameworks used in the repository
   */
  private async detectTestFrameworks(repoPath: string): Promise<{
    unit?: string;
    integration?: string;
    e2e?: string;
    component?: string;
  }> {
    const frameworks: {
      unit?: string;
      integration?: string;
      e2e?: string;
      component?: string;
    } = {};
    
    try {
      const packageJsonPath = path.join(repoPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return frameworks;
      }
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };
      
      // Detect unit testing frameworks
      if (allDeps.jest) {
        frameworks.unit = 'jest';
      } else if (allDeps.mocha) {
        frameworks.unit = 'mocha';
      } else if (allDeps.jasmine) {
        frameworks.unit = 'jasmine';
      } else if (allDeps.vitest) {
        frameworks.unit = 'vitest';
      } else if (allDeps.ava) {
        frameworks.unit = 'ava';
      } else if (allDeps.tape) {
        frameworks.unit = 'tape';
      }
      
      // Detect E2E testing frameworks
      if (allDeps.cypress) {
        frameworks.e2e = 'cypress';
      } else if (allDeps.playwright) {
        frameworks.e2e = 'playwright';
      } else if (allDeps.puppeteer) {
        frameworks.e2e = 'puppeteer';
      } else if (allDeps.selenium) {
        frameworks.e2e = 'selenium';
      } else if (allDeps.webdriverio) {
        frameworks.e2e = 'webdriverio';
      } else if (allDeps.protractor) {
        frameworks.e2e = 'protractor';
      }
      
      // Detect component testing
      if (allDeps['@testing-library/react']) {
        frameworks.component = 'react-testing-library';
      } else if (allDeps['@testing-library/vue']) {
        frameworks.component = 'vue-testing-library';
      } else if (allDeps.enzyme) {
        frameworks.component = 'enzyme';
      } else if (allDeps['@vue/test-utils']) {
        frameworks.component = 'vue-test-utils';
      }
      
      // Detect integration testing
      if (allDeps.supertest) {
        frameworks.integration = 'supertest';
      } else if (allDeps['@nestjs/testing']) {
        frameworks.integration = 'nestjs-testing';
      } else if (allDeps.pactum) {
        frameworks.integration = 'pactum';
      }
      
      // Check for configuration files
      if (fs.existsSync(path.join(repoPath, 'jest.config.js')) || 
          fs.existsSync(path.join(repoPath, 'jest.config.json')) || 
          fs.existsSync(path.join(repoPath, 'jest.config.ts'))) {
        frameworks.unit = 'jest';
      }
      
      if (fs.existsSync(path.join(repoPath, 'cypress.json')) || 
          fs.existsSync(path.join(repoPath, 'cypress.config.js')) || 
          fs.existsSync(path.join(repoPath, 'cypress.config.ts'))) {
        frameworks.e2e = 'cypress';
      }
      
      if (fs.existsSync(path.join(repoPath, 'playwright.config.js')) || 
          fs.existsSync(path.join(repoPath, 'playwright.config.ts'))) {
        frameworks.e2e = 'playwright';
      }
      
      if (fs.existsSync(path.join(repoPath, 'vitest.config.js')) || 
          fs.existsSync(path.join(repoPath, 'vitest.config.ts'))) {
        frameworks.unit = 'vitest';
      }
      
      return frameworks;
    } catch (error) {
      this.logger.error(`Failed to detect test frameworks: ${error instanceof Error ? error.message : String(error)}`);
      return frameworks;
    }
  }
  
  /**
   * Analyzes test coverage information from coverage reports
   */
  private async analyzeCoverage(repoPath: string): Promise<{
    overall: number;
    byType: {
      lines?: number;
      statements?: number;
      functions?: number;
      branches?: number;
    };
  } | null> {
    try {
      // Look for coverage directory
      const coverageDirs = [
        path.join(repoPath, 'coverage'),
        path.join(repoPath, '.coverage'),
        path.join(repoPath, '.nyc_output'),
      ];
      
      let coverageDir: string | null = null;
      for (const dir of coverageDirs) {
        if (fs.existsSync(dir)) {
          coverageDir = dir;
          break;
        }
      }
      
      if (!coverageDir) {
        this.logger.warn('No coverage directory found');
        return null;
      }
      
      // Look for lcov.info file
      const lcovPath = path.join(coverageDir, 'lcov.info');
      if (fs.existsSync(lcovPath)) {
        // This is a placeholder for actual lcov parsing
        // In a real implementation, we would parse the lcov.info file
        return {
          overall: 65, // Placeholder
          byType: {
            lines: 70,
            statements: 65,
            functions: 60,
            branches: 55,
          },
        };
      }
      
      // Look for coverage-summary.json
      const summaryPath = path.join(coverageDir, 'coverage-summary.json');
      if (fs.existsSync(summaryPath)) {
        try {
          const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
          if (summary.total) {
            return {
              overall: summary.total.lines?.pct || summary.total.statements?.pct || 0,
              byType: {
                lines: summary.total.lines?.pct,
                statements: summary.total.statements?.pct,
                functions: summary.total.functions?.pct,
                branches: summary.total.branches?.pct,
              },
            };
          }
        } catch (error) {
          this.logger.warn(`Failed to parse coverage summary: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Look for Playwright HTML report
      const playwrightReportDir = path.join(repoPath, 'playwright-report');
      if (fs.existsSync(playwrightReportDir)) {
        return {
          overall: 50, // Placeholder
          byType: {
            lines: 50,
            statements: 50,
            functions: 50,
            branches: 50,
          },
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Failed to analyze coverage: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
} 