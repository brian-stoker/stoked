import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { execSync, exec } from 'child_process';
import { LlmService, LlmMode } from '../llm/llm.service.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';
import * as util from 'util';
import * as crypto from 'crypto';
import { createUtestPrompt } from '../llm/prompts/createUtest.js';
import { ConfigService } from '../config/config.service.js';

const execPromise = util.promisify(exec);

interface ExecError extends Error {
  message: string;
  code?: number;
  stdout?: string;
  stderr?: string;
}

interface TestStats {
  filesAnalyzed: number;
  testFilesGenerated: number;
  testCasesCreated: number;
}

interface StokedConfig {
  version: string;
  runs: Array<{
    timestamp: string;
    testFilesGenerated: number;
    testCasesCreated: number;
    testMode: boolean;
  }>;
}

interface Progress {
  currentPackage: {
    name: string;
    totalFiles: number;
    processedFiles: number;
  };
  total: {
    packages: number;
    files: number;
    processedFiles: number;
  };
}

@Injectable()
@SubCommand({
  name: 'unit',
  description: 'Generate unit tests for your code (Subcommand of test)',
  arguments: '<owner/repo>',
})
export class UnitTestCommand extends CommandRunner {
  private includePackages?: string[];
  private debug: boolean = false;
  private testStats: TestStats = {
    filesAnalyzed: 0,
    testFilesGenerated: 0,
    testCasesCreated: 0
  };
  private progress: Progress = {
    currentPackage: {
      name: '',
      totalFiles: 0,
      processedFiles: 0
    },
    total: {
      packages: 0,
      files: 0,
      processedFiles: 0
    }
  };

  // Test mode configuration
  private testMode = false;
  private maxTestFiles = 5; // Default number of files to process in test mode

  // Current package info
  private currentPackagePath: string = '';

  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
    private readonly configService: ConfigService,
  ) {
    super();
    
    this.testMode = process.env.UTEST_TEST_MODE === 'true';
    if (this.testMode) {
      this.maxTestFiles = parseInt(process.env.TEST_FILES || '5', 10);
      const log = this.logger || console;
      log.debug(`🧪 TEST MODE ENABLED: Will only process up to ${this.maxTestFiles} files per package to verify API functionality`);
    }
  }

  @Option({
    flags: '-i, --include [packages]',
    description: 'Specific packages to generate tests for (comma-separated)'
  })
  parseInclude(val: string): void {
    this.includePackages = val.split(',').map(p => p.trim());
  }

  @Option({
    flags: '-t, --test',
    description: 'Enable test mode (processes only a few files to verify API functionality)'
  })
  parseTest(): void {
    this.testMode = true;
    const log = this.logger || console;
    log.debug(`🧪 TEST MODE ENABLED: Will only process up to ${this.maxTestFiles} files per package to verify API functionality`);
  }

  @Option({
    flags: '-d, --debug',
    description: 'Enable debug mode with verbose logging'
  })
  parseDebug(): void {
    this.debug = true;
    // Enable NODE_DEBUG for HTTP requests to see API calls
    process.env.NODE_DEBUG = 'http,https';
    const log = this.logger || console;
    log.log('Debug mode enabled with verbose logging');
  }

  @Option({
    flags: '-f, --framework [framework]',
    description: 'Testing framework to use (jest, react-testing-library, etc.)'
  })
  parseFramework(val: string): void {
    // Store the framework choice to be used in the prompt
    process.env.UTEST_FRAMEWORK = val;
    const log = this.logger || console;
    log.log(`Using ${val} for test generation`);
  }

  private shouldProcessPackage(filePath: string): boolean {
    // Skip if specific packages were specified and this isn't one of them
    if (this.includePackages && this.includePackages.length > 0) {
      const packagePathParts = filePath.split(path.sep);
      const matchesAny = this.includePackages.some(pkg => 
        packagePathParts.includes(pkg) || filePath.includes(`/${pkg}/`) || filePath.includes(`\\${pkg}\\`)
      );
      
      if (!matchesAny) {
        return false;
      }
    }
    
    return true;
  }

  private loadGitignorePatterns(workDir: string): string[] {
    const gitignorePath = path.join(workDir, '.gitignore');
    let patterns: string[] = [];
    
    if (fs.existsSync(gitignorePath)) {
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        patterns = gitignoreContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
      } catch (error) {
        if (this.logger) {
          this.logger.warn(`Could not read .gitignore file: ${error}`);
        } else {
          console.warn(`Could not read .gitignore file: ${error}`);
        }
      }
    }
    
    // Add some default patterns for node projects
    patterns.push('node_modules', 'dist', 'build', '.git', 'coverage');
    
    return patterns;
  }

  private isIgnored(filePath: string, workDir: string, ignorePatterns: string[]): boolean {
    const relativeFilePath = path.relative(workDir, filePath);
    
    for (const pattern of ignorePatterns) {
      if (relativeFilePath.startsWith(pattern) || 
          relativeFilePath.includes(`/${pattern}/`) || 
          relativeFilePath.includes(`\\${pattern}\\`)) {
        return true;
      }
    }
    
    return false;
  }

  private findSourceFiles(workDir: string): string[] {
    const ignorePatterns = this.loadGitignorePatterns(workDir);
    const allFiles: string[] = [];
    
    const processDirectory = (dir: string) => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        
        if (this.isIgnored(filePath, workDir, ignorePatterns)) {
          continue;
        }
        
        if (stats.isDirectory()) {
          processDirectory(filePath);
          continue;
        }
        
        // Check for React component files
        if (filePath.match(/\.(jsx|tsx|js|ts)$/) && 
            !filePath.endsWith('.test.js') && 
            !filePath.endsWith('.test.ts') && 
            !filePath.endsWith('.test.jsx') && 
            !filePath.endsWith('.test.tsx') && 
            !filePath.endsWith('.spec.js') && 
            !filePath.endsWith('.spec.ts') && 
            !filePath.endsWith('.spec.jsx') && 
            !filePath.endsWith('.spec.tsx')) {
          allFiles.push(filePath);
        }
      }
    };
    
    try {
      processDirectory(workDir);
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error finding source files: ${error}`);
      } else {
        console.error(`Error finding source files: ${error}`);
      }
    }
    
    return allFiles;
  }

  private findPackageRoot(filePath: string): string | null {
    let currentDir = path.dirname(filePath);
    
    while (currentDir !== path.parse(currentDir).root) {
      if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }

  private isReactComponent(code: string): boolean {
    // Check for React imports
    const hasReactImport = code.includes('import React') || 
                          code.includes('from "react"') || 
                          code.includes('from \'react\'');
    
    // Check for component patterns (function component or class component)
    const hasFunctionComponent = Boolean(code.match(/function\s+\w+\s*\([\s\S]*?\)\s*{[\s\S]*?return\s*\(/));
    const hasArrowFunctionComponent = Boolean(code.match(/const\s+\w+\s*=\s*\([\s\S]*?\)\s*=>\s*\(/));
    const hasClassComponent = Boolean(code.match(/class\s+\w+\s+extends\s+(React\.)?Component/));
    
    return hasReactImport && (hasFunctionComponent || hasArrowFunctionComponent || hasClassComponent);
  }

  private logFileProgress(filePath: string): void {
    this.progress.currentPackage.processedFiles++;
    this.progress.total.processedFiles++;
    
    // Calculate the percentage for both current package and total progress
    const currentPercentage = Math.round((this.progress.currentPackage.processedFiles / this.progress.currentPackage.totalFiles) * 100);
    const totalPercentage = Math.round((this.progress.total.processedFiles / this.progress.total.files) * 100);
    
    const fileName = path.basename(filePath);
    if (this.debug) {
      if (this.logger) {
        this.logger.log(`Processing [${currentPercentage}%] ${fileName} (${this.progress.currentPackage.processedFiles}/${this.progress.currentPackage.totalFiles})`);
      } else {
        console.log(`Processing [${currentPercentage}%] ${fileName} (${this.progress.currentPackage.processedFiles}/${this.progress.currentPackage.totalFiles})`);
      }
    } else if (this.progress.currentPackage.processedFiles % 5 === 0 || currentPercentage === 100) {
      // Log less frequently in non-debug mode
      if (this.logger) {
        this.logger.log(`Progress: [${currentPercentage}%] Package: ${this.progress.currentPackage.name} | [${totalPercentage}%] Total`);
      } else {
        console.log(`Progress: [${currentPercentage}%] Package: ${this.progress.currentPackage.name} | [${totalPercentage}%] Total`);
      }
    }
  }

  private getStokedVersion(): string {
    try {
      const packageJsonPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version || '0.0.0';
      }
    } catch (error) {
      if (this.logger) {
        this.logger.warn(`Error reading package.json: ${error}`);
      } else {
        console.warn(`Error reading package.json: ${error}`);
      }
    }
    return '0.0.0';
  }

  private updateTestStats(testFile: boolean, testCases: number): void {
    this.testStats.filesAnalyzed++;
    if (testFile) this.testStats.testFilesGenerated++;
    this.testStats.testCasesCreated += testCases;
  }

  private async processFile(filePath: string): Promise<{generatedTest: boolean, testCases: number}> {
    try {
      const code = fs.readFileSync(filePath, 'utf8');
      
      // Skip if not a React component (for initial version focusing on React)
      if (!this.isReactComponent(code)) {
        if (this.debug) {
          if (this.logger) {
            this.logger.log(`Skipping ${path.basename(filePath)} - not identified as a React component`);
          } else {
            console.log(`Skipping ${path.basename(filePath)} - not identified as a React component`);
          }
        }
        return { generatedTest: false, testCases: 0 };
      }
      
      if (this.logger) {
        this.logger.log(`🧪 Generating tests for ${path.basename(filePath)}`);
      } else {
        console.log(`🧪 Generating tests for ${path.basename(filePath)}`);
      }
      
      const framework = process.env.UTEST_FRAMEWORK || 'react-testing-library';
      const { testCode, testCases } = await this.generateTest(code, filePath, framework);
      
      if (testCode) {
        // Determine the test file path
        const dir = path.dirname(filePath);
        const fileName = path.basename(filePath);
        const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        const fileExt = path.extname(filePath);
        const testFilePath = path.join(dir, `${fileNameWithoutExt}.test${fileExt}`);
        
        // Write the test file
        fs.writeFileSync(testFilePath, testCode);
        if (this.logger) {
          this.logger.log(`✅ Created test file: ${path.basename(testFilePath)} with ${testCases} test cases`);
        } else {
          console.log(`✅ Created test file: ${path.basename(testFilePath)} with ${testCases} test cases`);
        }
        
        return { generatedTest: true, testCases };
      }
      
      return { generatedTest: false, testCases: 0 };
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error processing file ${filePath}: ${error}`);
      } else {
        console.error(`Error processing file ${filePath}: ${error}`);
      }
      return { generatedTest: false, testCases: 0 };
    }
  }

  private async generateTest(code: string, filePath: string, framework: string): Promise<{ testCode: string, testCases: number }> {
    try {
      const prompt = createUtestPrompt({code, filePath, framework});
      const response = await this.llmService.query(prompt);
      
      if (!response) {
        throw new Error('No response from LLM service');
      }
      
      // Count the number of test cases (look for test/it blocks)
      const testCases = (response.match(/\b(test|it)\s*\(/g) || []).length;
      
      return { testCode: response, testCases };
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error generating test for ${filePath}: ${error}`);
      } else {
        console.error(`Error generating test for ${filePath}: ${error}`);
      }
      return { testCode: '', testCases: 0 };
    }
  }

  private async processPackage(packagePath: string, files: string[]): Promise<void> {
    const packageName = path.basename(packagePath);
    this.currentPackagePath = packagePath;
    
    this.progress.currentPackage = {
      name: packageName,
      totalFiles: files.length,
      processedFiles: 0
    };
    
    if (this.logger) {
      this.logger.log(`📦 Processing package: ${packageName} (${files.length} files)`);
    } else {
      console.log(`📦 Processing package: ${packageName} (${files.length} files)`);
    }
    
    // If in test mode, limit the number of files
    const filesToProcess = this.testMode ? files.slice(0, this.maxTestFiles) : files;
    
    // Process each file
    for (const file of filesToProcess) {
      const { generatedTest, testCases } = await this.processFile(file);
      this.updateTestStats(generatedTest, testCases);
      this.logFileProgress(file);
    }
    
    if (this.logger) {
      this.logger.log(`✅ Completed package: ${packageName} - Generated ${this.testStats.testFilesGenerated} test files with ${this.testStats.testCasesCreated} test cases`);
    } else {
      console.log(`✅ Completed package: ${packageName} - Generated ${this.testStats.testFilesGenerated} test files with ${this.testStats.testCasesCreated} test cases`);
    }
  }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const log = this.logger || console;
    log.log(`[Utest Subcommand] Running with params: ${passedParams}, options: ${JSON.stringify(options)}`);
    await this.executeUtestLogic(passedParams, options);
  }

  private async executeUtestLogic(passedParams: string[], options?: Record<string, any>): Promise<void> {
    const log = this.logger || console;
    const workspaceRoot = this.configService.workspaceRoot;

    const [repoArg] = passedParams;
    if (!repoArg) {
      log.error('Repository argument is required (owner/repo)');
      return;
    }
    
    // Parse owner/repo format
    let [owner, repo] = repoArg.split('/');
    if (!owner || !repo) {
      log.error('Invalid repository format. Use owner/repo format.');
      return;
    }
    
    const startTime = Date.now();
    log.log(`🔍 Generating unit tests for ${owner}/${repo}`);
    
    try {
      const repoDir = path.join(workspaceRoot, owner, repo);
      
      // Check if repo directory exists
      if (!fs.existsSync(repoDir)) {
        log.error(`Repository directory does not exist: ${repoDir}`);
        log.log('Try using the repo command first to clone the repository');
        return;
      }
      
      // Find source files in repository
      const allFiles = this.findSourceFiles(repoDir);
      this.progress.total.files = allFiles.length;
      
      // Group files by package
      const packageMap = new Map<string, string[]>();
      
      for (const file of allFiles) {
        const packageRoot = this.findPackageRoot(file) || repoDir;
        
        if (!this.shouldProcessPackage(packageRoot)) {
          continue;
        }
        
        if (!packageMap.has(packageRoot)) {
          packageMap.set(packageRoot, []);
        }
        
        packageMap.get(packageRoot)?.push(file);
      }
      
      this.progress.total.packages = packageMap.size;
      log.log(`Found ${packageMap.size} packages with ${allFiles.length} source files`);
      
      // Process each package
      for (const [packagePath, files] of packageMap.entries()) {
        await this.processPackage(packagePath, files);
      }
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      log.log('========================================');
      log.log(`✨ Unit Test Generation Summary`);
      log.log('----------------------------------------');
      log.log(`Files analyzed: ${this.testStats.filesAnalyzed}`);
      log.log(`Test files generated: ${this.testStats.testFilesGenerated}`);
      log.log(`Test cases created: ${this.testStats.testCasesCreated}`);
      log.log(`Time taken: ${duration}s`);
      log.log('========================================');
      
    } catch (error) {
      log.error(`Error during test generation: ${error}`);
    }
    log.log('Utest execution finished.');
  }
} 