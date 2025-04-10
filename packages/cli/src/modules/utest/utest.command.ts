import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';
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

/**
 * Gets the workspace root directory path
 * Checks environment variable STOKED_WORKSPACE_ROOT first,
 * falls back to ~/.stoked/.repos
 */
function getWorkspaceRoot(): string {
  // Check if STOKED_WORKSPACE_ROOT environment variable is set
  if (process.env.STOKED_WORKSPACE_ROOT) {
    return process.env.STOKED_WORKSPACE_ROOT;
  }

  // Use the standard location: ~/.stoked/.repos
  const homeDir = os.homedir();
  return path.join(homeDir, '.stoked', '.repos');
}

@Injectable()
@Command({
  name: 'utest',
  description: 'Generate unit tests for your code',
  arguments: '<owner/repo>',
})
export class UtestCommand extends CommandRunner {
  private readonly workspaceRoot: string;
  private tempDir: string;
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
  ) {
    super();
    this.workspaceRoot = getWorkspaceRoot();
    this.tempDir = path.join(this.workspaceRoot, 'temp');
    this.ensureWorkspaceDirs();
    
    // Check if test mode is enabled
    this.testMode = process.env.UTEST_TEST_MODE === 'true';
    if (this.testMode) {
      this.maxTestFiles = parseInt(process.env.TEST_FILES || '5', 10);
      this.logger.log(`🧪 TEST MODE ENABLED: Will only process up to ${this.maxTestFiles} files per package to verify API functionality`);
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
    this.logger.log(`🧪 TEST MODE ENABLED: Will only process up to ${this.maxTestFiles} files per package to verify API functionality`);
  }

  @Option({
    flags: '-d, --debug',
    description: 'Enable debug mode with verbose logging'
  })
  parseDebug(): void {
    this.debug = true;
    // Enable NODE_DEBUG for HTTP requests to see API calls
    process.env.NODE_DEBUG = 'http,https';
    this.logger.log('Debug mode enabled with verbose logging');
  }

  @Option({
    flags: '-f, --framework [framework]',
    description: 'Testing framework to use (jest, react-testing-library, etc.)'
  })
  parseFramework(val: string): void {
    // Store the framework choice to be used in the prompt
    process.env.UTEST_FRAMEWORK = val;
    this.logger.log(`Using ${val} for test generation`);
  }

  private ensureWorkspaceDirs() {
    try {
      // Remove existing temp directory to ensure clean state
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
      
      // Create fresh directories with explicit permissions
      fs.mkdirSync(this.workspaceRoot, { recursive: true, mode: 0o755 });
      fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o755 });
      
      // Verify we can write to the temp directory
      const testFile = path.join(this.tempDir, 'test.txt');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to setup workspace directories: ${err.message}`);
      process.exit(1);
    }
  }

  private cleanWorkspace() {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
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
        this.logger.warn(`Could not read .gitignore file: ${error}`);
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
      this.logger.error(`Error finding source files: ${error}`);
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
      this.logger.log(`Processing [${currentPercentage}%] ${fileName} (${this.progress.currentPackage.processedFiles}/${this.progress.currentPackage.totalFiles})`);
    } else if (this.progress.currentPackage.processedFiles % 5 === 0 || currentPercentage === 100) {
      // Log less frequently in non-debug mode
      this.logger.log(`Progress: [${currentPercentage}%] Package: ${this.progress.currentPackage.name} | [${totalPercentage}%] Total`);
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
      this.logger.warn(`Error reading package.json: ${error}`);
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
          this.logger.log(`Skipping ${path.basename(filePath)} - not identified as a React component`);
        }
        return { generatedTest: false, testCases: 0 };
      }
      
      this.logger.log(`🧪 Generating tests for ${path.basename(filePath)}`);
      
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
        this.logger.log(`✅ Created test file: ${path.basename(testFilePath)} with ${testCases} test cases`);
        
        return { generatedTest: true, testCases };
      }
      
      return { generatedTest: false, testCases: 0 };
    } catch (error) {
      this.logger.error(`Error processing file ${filePath}: ${error}`);
      return { generatedTest: false, testCases: 0 };
    }
  }

  private async generateTest(code: string, filePath: string, framework: string): Promise<{ testCode: string, testCases: number }> {
    try {
      const prompt = createUtestPrompt(code, filePath, framework);
      const response = await this.llmService.query(prompt);
      
      if (!response) {
        throw new Error('No response from LLM service');
      }
      
      // Count the number of test cases (look for test/it blocks)
      const testCases = (response.match(/\b(test|it)\s*\(/g) || []).length;
      
      return { testCode: response, testCases };
    } catch (error) {
      this.logger.error(`Error generating test for ${filePath}: ${error}`);
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
    
    this.logger.log(`📦 Processing package: ${packageName} (${files.length} files)`);
    
    // If in test mode, limit the number of files
    const filesToProcess = this.testMode ? files.slice(0, this.maxTestFiles) : files;
    
    // Process each file
    for (const file of filesToProcess) {
      const { generatedTest, testCases } = await this.processFile(file);
      this.updateTestStats(generatedTest, testCases);
      this.logFileProgress(file);
    }
    
    this.logger.log(`✅ Completed package: ${packageName} - Generated ${this.testStats.testFilesGenerated} test files with ${this.testStats.testCasesCreated} test cases`);
  }

  async run(passedParams: string[]): Promise<void> {
    const [repoArg] = passedParams;
    if (!repoArg) {
      this.logger.error('Repository argument is required (owner/repo)');
      return;
    }
    
    // Parse owner/repo format
    let [owner, repo] = repoArg.split('/');
    if (!owner || !repo) {
      this.logger.error('Invalid repository format. Use owner/repo format.');
      return;
    }
    
    const startTime = Date.now();
    this.logger.log(`🔍 Generating unit tests for ${owner}/${repo}`);
    
    try {
      const repoDir = path.join(this.workspaceRoot, owner, repo);
      
      // Check if repo directory exists
      if (!fs.existsSync(repoDir)) {
        this.logger.error(`Repository directory does not exist: ${repoDir}`);
        this.logger.log('Try using the repo command first to clone the repository');
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
      this.logger.log(`Found ${packageMap.size} packages with ${allFiles.length} source files`);
      
      // Process each package
      for (const [packagePath, files] of packageMap.entries()) {
        await this.processPackage(packagePath, files);
      }
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      this.logger.log('========================================');
      this.logger.log(`✨ Unit Test Generation Summary`);
      this.logger.log('----------------------------------------');
      this.logger.log(`Files analyzed: ${this.testStats.filesAnalyzed}`);
      this.logger.log(`Test files generated: ${this.testStats.testFilesGenerated}`);
      this.logger.log(`Test cases created: ${this.testStats.testCasesCreated}`);
      this.logger.log(`Time taken: ${duration}s`);
      this.logger.log('========================================');
      
    } catch (error) {
      this.logger.error(`Error during test generation: ${error}`);
    } finally {
      this.cleanWorkspace();
    }
  }
} 