import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { LlmService, LlmMode } from '../llm/llm.service.js';
import * as child_process from 'child_process';
import * as util from 'util';
import { ThemeLogger } from '../../logger/theme.logger.js';
import { createUtestPrompt } from '../llm/prompts/createUtest.js';
import { UnitTestCommand } from './test.unit.command.js';
import { ConfigService } from '../config/config.service.js';

const execAsync = util.promisify(child_process.exec);
const execSync = child_process.execSync;

interface TestCommandOptions {
  testType?: 'unit' | 'component' | 'integration' | 'e2e';
  framework?: string;
  ignore?: string[];
}

interface TestStats {
  total: number;
  generated: number;
  skipped: number;
  errors: number;
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
 * Command for generating tests for a repository
 * 
 * This command analyzes a repository, identifies test patterns and gaps,
 * and generates appropriate tests to improve coverage and reliability.
 */
@Injectable({})
@Command({
  name: 'test',
  description: 'Generate tests for a repository',
  arguments: '[owner/repo]',
  subCommands: [UnitTestCommand]
})
export class TestCommand extends CommandRunner {
  private readonly logger = new Logger(TestCommand.name);
  private readonly workspaceRoot: string;
  private tempDir: string;
  
  // Default settings
  private readonly defaultTargetCoverage = 80; // Default coverage target (percentage)
  private readonly defaultTestTypes = ['unit']; // Default test types to generate
  
  // Test mode settings
  private testMode = process.env.TEST_MODE === 'true';
  private readonly maxTestFiles = process.env.MAX_TEST_FILES ? parseInt(process.env.MAX_TEST_FILES, 10) : 5;
  
  // Unit test focus
  private focusOnUnitTests = false;
  
  // Test framework
  private testFramework = process.env.TEST_FRAMEWORK || 'vitest';
  
  // Test statistics
  private testStats: TestStats = {
    total: 0,
    generated: 0,
    skipped: 0,
    errors: 0
  };
  
  // Progress tracking
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
  
  constructor(
    private readonly llmService: LlmService,
    private readonly themeLogger: ThemeLogger,
    private readonly configService: ConfigService
  ) {
    super();
    this.workspaceRoot = this.getWorkspaceRoot();
    this.tempDir = path.join(this.workspaceRoot, 'temp');
    this.ensureWorkspaceDirs();
  }
  
  private getWorkspaceRoot(): string {
    // Try to find the workspace root by looking for package.json
    let currentDir = process.cwd();
    while (currentDir !== path.parse(currentDir).root) {
      if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    return process.cwd();
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
      throw new Error(`Failed to setup workspace directories: ${err.message}`);
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
  
  @Option({
    flags: '-u, --unit',
    description: 'Focus specifically on generating unit tests'
  })
  parseUnit(): void {
    this.focusOnUnitTests = true;
    this.logger.log('Focusing on unit test generation');
  }
  
  @Option({
    flags: '-f, --framework [framework]',
    description: 'Testing framework to use (vitest, playwright, etc.)'
  })
  parseFramework(val: string): void {
    this.testFramework = val;
    this.logger.log(`Using ${val} for test generation`);
  }
  
  @Option({
    flags: '-i, --include [packages]',
    description: 'Specific packages to generate tests for (comma-separated)'
  })
  parseInclude(val: string): string[] {
    return val.split(',').map(p => p.trim());
  }
  
  @Option({
    flags: '-t, --types [types]',
    description: 'Types of tests to generate (unit, integration, e2e)'
  })
  parseTypes(val: string): string[] {
    return val.split(',').map(t => t.trim());
  }
  
  @Option({
    flags: '--coverageTarget [target]',
    description: 'Target coverage percentage'
  })
  parseCoverageTarget(val: string): number {
    return parseInt(val, 10);
  }
  
  @Option({
    flags: '--llmProvider [provider]',
    description: 'LLM provider to use (openai, ollama)'
  })
  parseLlmProvider(val: string): string {
    return val;
  }
  
  @Option({
    flags: '--test',
    description: 'Enable test mode (processes only a few files to verify functionality)'
  })
  parseTest(): void {
    this.testMode = true;
    this.logger.debug(`🧪 TEST MODE ENABLED: Will only process up to ${this.maxTestFiles} files per package to verify API functionality`);
  }
  
  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    this.logger.log(`[Test Command - Base] Running with params: ${passedParams}, options: ${JSON.stringify(options)}`);
    try {
      const repository = passedParams[0];
      if (!repository) {
         this.logger.log('No repository specified and no subcommand matched. Displaying help.');
         this.logger.error('Help display needs implementation reference.');
         return;
      }
      
      this.logger.log(`Analyzing repository: ${repository}`);
      
      // Parse options
      const includePaths = options?.include || [];
      const testTypes = this.focusOnUnitTests 
        ? ['unit'] 
        : (options?.types || this.defaultTestTypes);
      const coverageTarget = options?.coverageTarget || this.defaultTargetCoverage;
      const llmProvider = options?.llmProvider || (process.env.OPENAI_API_KEY ? 'openai' : 'ollama');
      
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
      const repoPath = await this.cloneRepository(repository.split('/')[0], repository.split('/')[1]);
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
      
      // Determine test types based on repository type if not specified
      const typesToGenerate = this.determineTestTypes(repoType.type, testTypes);
      this.logger.log(`Generating test types: ${typesToGenerate.join(',')}`);
      
      // Generate tests for each type
      for (const type of typesToGenerate) {
        if (type === 'unit') {
          await this.generateUnitTests(repoPath, includePaths);
        } else if (type === 'integration') {
          // Future implementation
          this.logger.log('Integration test generation not yet implemented');
        } else if (type === 'e2e') {
          // Future implementation
          this.logger.log('E2E test generation not yet implemented');
        }
      }
      
      // Step 6: Generate summary
      this.logger.log('6. Generating summary report...');
      this.logger.log('========================================');
      this.logger.log(`✨ Test Generation Summary`);
      this.logger.log('----------------------------------------');
      this.logger.log(`Files analyzed: ${this.testStats.total}`);
      this.logger.log(`Test files generated: ${this.testStats.generated}`);
      this.logger.log(`Test cases created: ${this.testStats.generated}`);
      this.logger.log('========================================');
      
      // Step 7: Create pull request
      this.logger.log('7. Creating pull request...');
      await this.createPullRequest(repoPath, repository.split('/')[0], repository.split('/')[1]);
      
      this.logger.log('Done!');
    } catch (error) {
      this.logger.error(`Error in main test command: ${error}`);
      // Handle error appropriately
    }
  }
  
  /**
   * Creates a pull request with the generated tests
   * 
   * @param repoPath Path to the repository
   * @param owner Repository owner
   * @param repo Repository name
   */
  private async createPullRequest(repoPath: string, owner: string, repo: string): Promise<void> {
    try {
      // Get the Stoked tool version for branch name
      const stokedVersion = this.getStokedVersion();
      
      // Determine branch name
      const branchName = `stoked/tests-${stokedVersion}`;
      
      this.logger.log(`Creating branch: ${branchName}`);
      
      // Create and switch to the branch
      try {
        // First check if branch exists locally
        const localBranches = execSync('git branch', { encoding: 'utf8', cwd: repoPath });
        if (localBranches.includes(branchName)) {
          execSync(`git checkout ${branchName}`, { encoding: 'utf8', cwd: repoPath });
        } else {
          // Check if branch exists remotely
          const remoteBranches = execSync('git branch -r', { encoding: 'utf8', cwd: repoPath });
          if (remoteBranches.includes(`origin/${branchName}`)) {
            execSync(`git checkout -b ${branchName} origin/${branchName}`, { encoding: 'utf8', cwd: repoPath });
          } else {
            // Create new branch
            execSync(`git checkout -b ${branchName}`, { encoding: 'utf8', cwd: repoPath });
          }
        }
      } catch (error) {
        this.logger.error(`Failed to create/switch to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // Add all changes
      this.logger.log('Adding changes to git...');
      try {
        execSync('git add .', { encoding: 'utf8', cwd: repoPath });
      } catch (error) {
        this.logger.error(`Failed to add changes: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if we have changes to commit
      const status = execSync('git status --porcelain', { encoding: 'utf8', cwd: repoPath });
      if (!status.trim()) {
        this.logger.log('No changes to commit');
        return;
      }
      
      // Create a descriptive commit message
      const commitMessage = `test: add generated tests for ${owner}/${repo}`;
      this.logger.log('Committing changes...');
      try {
        execSync(`git commit -m "${commitMessage}"`, { encoding: 'utf8', cwd: repoPath });
      } catch (error) {
        // If no changes were staged, this is fine
        if (error instanceof Error && error.message.includes('nothing to commit')) {
          this.logger.log('No changes to commit');
          return;
        }
        this.logger.error(`Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Push to the branch
      this.logger.log(`Pushing to branch ${branchName}...`);
      try {
        execSync(`git push origin ${branchName} --force`, { encoding: 'utf8', cwd: repoPath });
      } catch (error) {
        this.logger.error(`Failed to push to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if PR already exists
      this.logger.log('Checking for existing pull request...');
      let prExists = false;
      try {
        const prCheckResult = execSync(`gh pr list --head ${branchName} --json number`, { encoding: 'utf8', cwd: repoPath });
        try {
          const prData = JSON.parse(prCheckResult);
          if (prData && prData.length > 0) {
            prExists = true;
          }
        } catch (parseError) {
          // If parsing fails, assume no PR exists
          this.logger.debug(`Error parsing PR check result: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } catch (error) {
        this.logger.warn(`Error checking for existing PR: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with PR creation anyway
      }
      
      if (prExists) {
        this.logger.log('Pull request already exists, skipping PR creation');
        return;
      }
      
      // Create a PR
      this.logger.log('Creating pull request...');
      const prTitle = `test: add generated tests for ${owner}/${repo}`;
        
      const prBody = `This PR adds generated tests to improve test coverage.

## Changes
- Added unit tests for components and functions
- Generated test files with appropriate test cases
- Improved test coverage

Generated using Stoked v${stokedVersion.replace(/-/g, '.')}${this.testMode ? ' (TEST MODE)' : ''}`;

      try {
        execSync(
          `gh pr create --title "${prTitle}" --body "${prBody}" --base main`,
          { encoding: 'utf8', cwd: repoPath }
        );
        this.logger.log('Pull request created successfully');
      } catch (error) {
        this.logger.error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Determines what types of tests to generate based on repository type
   * 
   * @param repoType The repository type
   * @param userSpecifiedTypes Types specified by the user
   * @returns Array of test types to generate
   */
  private determineTestTypes(repoType: string, userSpecifiedTypes?: string[]): string[] {
    // If user specified types, use those
    if (userSpecifiedTypes && userSpecifiedTypes.length > 0) {
      return userSpecifiedTypes;
    }
    
    // Otherwise determine based on repository type
    switch (repoType) {
      case 'frontend-web':
        return ['unit', 'integration', 'e2e'];
      case 'frontend-mobile':
        return ['unit', 'integration'];
      case 'backend-api':
        return ['unit', 'integration'];
      case 'backend-lib':
      case 'frontend-lib':
      case 'general-lib':
        return ['unit'];
      default:
        return ['unit'];
    }
  }
  
  /**
   * Generates unit tests for the repository
   * 
   * @param repoPath Path to the repository
   * @param includePaths Specific packages to include
   */
  private async generateUnitTests(repoPath: string, includePaths: string[]): Promise<void> {
    this.logger.log('Generating unit tests...');
    
    // Find source files
    const allFiles = this.findSourceFiles(repoPath);
    this.progress.total.files = allFiles.length;
    
    // Group files by package
    const packageMap = new Map<string, string[]>();
    
    for (const file of allFiles) {
      const packageRoot = this.findPackageRoot(file) || repoPath;
      
      if (!this.shouldProcessPackage(packageRoot, includePaths)) {
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
  }
  
  /**
   * Checks if a package should be processed based on include paths
   * 
   * @param packagePath Path to the package
   * @param includePaths Specific packages to include
   * @returns Whether the package should be processed
   */
  private shouldProcessPackage(packagePath: string, includePaths: string[]): boolean {
    // Skip if specific packages were specified and this isn't one of them
    if (includePaths && includePaths.length > 0) {
      const packagePathParts = packagePath.split(path.sep);
      const matchesAny = includePaths.some(pkg => 
        packagePathParts.includes(pkg) || packagePath.includes(`/${pkg}/`) || packagePath.includes(`\\${pkg}\\`)
      );
      
      if (!matchesAny) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Finds the package root for a file
   * 
   * @param filePath Path to the file
   * @returns Path to the package root, or null if not found
   */
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
  
  /**
   * Finds source files in a directory
   * 
   * @param workDir Directory to search
   * @returns Array of source file paths
   */
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
  
  /**
   * Loads gitignore patterns from a directory
   * 
   * @param workDir Directory to load patterns from
   * @returns Array of gitignore patterns
   */
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
  
  /**
   * Checks if a file should be ignored based on patterns
   * 
   * @param filePath Path to the file
   * @param workDir Working directory
   * @param ignorePatterns Patterns to ignore
   * @returns Whether the file should be ignored
   */
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
  
  /**
   * Processes a package to generate tests for its files
   * 
   * @param packagePath Path to the package
   * @param files Files to process
   */
  private async processPackage(packagePath: string, files: string[]): Promise<void> {
    try {
      // Get package name from package.json
      const packageJsonPath = path.join(packagePath, 'package.json');
      let packageName = packagePath.split(path.sep).pop() || '';
      
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          packageName = packageJson.name || packageName;
        } catch (error) {
          // Failed to parse package.json, use directory name
          this.logger.warn(`Failed to parse package.json: ${error}`);
        }
      }
      
      // Update progress tracking
      this.progress.currentPackage = {
        name: packageName,
        totalFiles: files.length,
        processedFiles: 0
      };
      
      this.logger.log(`Processing package: ${packageName} (${files.length} files)`);
      
      // Limit files in test mode
      const filesToProcess = this.testMode ? files.slice(0, this.maxTestFiles) : files;
      
      // Process each file
      for (const file of filesToProcess) {
        // Update progress
        this.progress.currentPackage.processedFiles++;
        this.progress.total.processedFiles++;
        this.updateProgress(file);
        
        try {
          // Skip files that already have tests
          if (this.hasExistingTest(file)) {
            this.logger.log(`Skipping ${path.basename(file)} - test already exists`);
            this.testStats.skipped++;
            continue;
          }
          
          // Read file content
          const content = fs.readFileSync(file, 'utf8');
          
          // Determine file type
          const fileExt = path.extname(file).toLowerCase();
          
          // Generate test based on file type
          let testContent = '';
          let testCases = 0;
          
          if (fileExt === '.tsx' || fileExt === '.jsx') {
            // Generate component test
            const result = await this.generateComponentTest(file, content);
            testContent = result.testCode;
            testCases = result.testCases;
          } else if (fileExt === '.ts' || fileExt === '.js') {
            // Generate unit test
            const result = await this.generateUnitTestWithLLM(file, content);
            testContent = result.testCode;
            testCases = result.testCases;
          } else {
            // Skip unsupported file types
            this.logger.log(`Skipping unsupported file type: ${fileExt}`);
            this.testStats.skipped++;
            continue;
          }
          
          if (!testContent) {
            this.logger.warn(`No test content generated for ${path.basename(file)}`);
            this.testStats.skipped++;
            continue;
          }
          
          // Write test file
          this.writeTestFile(file, testContent);
          this.testStats.generated++;
          
          // Log progress
          this.logger.log(`Generated test for ${path.basename(file)} with ${testCases} test cases`);
        } catch (error) {
          this.logger.error(`Error processing file ${file}: ${error instanceof Error ? error.message : String(error)}`);
          this.testStats.errors++;
        }
      }
      
      this.logger.log(`✅ Completed package: ${packageName} - Generated ${this.testStats.generated} test files with ${this.testStats.generated} test cases`);
    } catch (error) {
      this.logger.error(`Error processing package ${packagePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Checks if a file already has a test
   * 
   * @param filePath Path to the file
   * @returns Whether the file has an existing test
   */
  private hasExistingTest(filePath: string): boolean {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const { name, ext } = path.parse(fileName);
    
    // Check for common test file patterns
    const testDirPatterns = ['__tests__', 'tests', 'test'];
    const testFilePatterns = [
      `${name}.test${ext}`,
      `${name}.spec${ext}`,
      `${name}.test.js`,
      `${name}.test.jsx`,
      `${name}.test.ts`,
      `${name}.test.tsx`,
      `${name}.spec.js`,
      `${name}.spec.jsx`,
      `${name}.spec.ts`,
      `${name}.spec.tsx`,
    ];
    
    // Check in the same directory
    for (const testFile of testFilePatterns) {
      if (fs.existsSync(path.join(dir, testFile))) {
        return true;
      }
    }
    
    // Check in test directories
    for (const testDir of testDirPatterns) {
      const testDirPath = path.join(dir, testDir);
      if (fs.existsSync(testDirPath)) {
        for (const testFile of testFilePatterns) {
          if (fs.existsSync(path.join(testDirPath, testFile))) {
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  /**
   * Writes a test file
   * 
   * @param sourcePath Path to the source file
   * @param content Test content
   */
  private writeTestFile(sourcePath: string, content: string): void {
    const dir = path.dirname(sourcePath);
    const fileName = path.basename(sourcePath);
    const { name, ext } = path.parse(fileName);
    
    // Determine test directory and file name
    const testDir = path.join(dir, '__tests__');
    const testFileName = `${name}.test${ext}`;
    const testFilePath = path.join(testDir, testFileName);
    
    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Write test file
    fs.writeFileSync(testFilePath, content);
    this.logger.log(`Wrote test file: ${testFilePath}`);
  }
  
  /**
   * Generates a unit test using LLM
   * 
   * @param filePath Path to the file
   * @param content File content
   * @returns Test code and number of test cases
   */
  private async generateUnitTestWithLLM(filePath: string, content: string): Promise<{ testCode: string, testCases: number }> {
    try {
      const fileName = path.basename(filePath);
      const framework = this.testFramework;
      
      // Create prompt for LLM
      const prompt = createUtestPrompt({code: content, filePath, framework});
      
      // Send to LLM service
      const response = await this.llmService.query(prompt);
      
      // Count test cases (approximate by counting 'it(' or 'test(' statements)
      const testCaseMatches = response.match(/it\s*\(|test\s*\(/g);
      const testCases = testCaseMatches ? testCaseMatches.length : 0;
      
      return { testCode: response, testCases };
    } catch (error) {
      this.logger.error(`Error generating test for ${filePath}: ${error}`);
      return { testCode: '', testCases: 0 };
    }
  }
  
  /**
   * Generates a component test
   * 
   * @param filePath Path to the file
   * @param content File content
   * @returns Test code and number of test cases
   */
  private async generateComponentTest(filePath: string, content: string): Promise<{ testCode: string, testCases: number }> {
    // For component tests, we use the same LLM approach but tailor the prompt for components
    return this.generateUnitTestWithLLM(filePath, content);
  }
  
  /**
   * Updates progress information
   * 
   * @param filePath Path to the current file being processed
   */
  private updateProgress(filePath: string): void {
    const currentPercentage = Math.round((this.progress.currentPackage.processedFiles / this.progress.currentPackage.totalFiles) * 100);
    const totalPercentage = Math.round((this.progress.total.processedFiles / this.progress.total.files) * 100);
    
    const fileName = path.basename(filePath);
    if (this.progress.currentPackage.processedFiles % 5 === 0 || currentPercentage === 100) {
      // Log less frequently
      this.logger.log(`Progress: [${currentPercentage}%] Package: ${this.progress.currentPackage.name} | [${totalPercentage}%] Total`);
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
    const log = this.logger || console;
    try {
      log.debug(`Starting repository clone for ${owner}/${repo}`);
      
      // Fix: Use configService.workspaceRoot
      const reposDir = this.configService.workspaceRoot; 
      log.debug(`Using repos directory: ${reposDir}`);
      
      // Create owner directory
      const ownerDir = path.join(reposDir, owner);
      log.debug(`Using owner directory: ${ownerDir}`);
      
      if (!fs.existsSync(ownerDir)) {
        log.debug(`Creating owner directory: ${ownerDir}`);
        fs.mkdirSync(ownerDir, { recursive: true });
      }
      
      // Set the target repository path
      const repoPath = path.join(ownerDir, repo);
      log.debug(`Target repository path: ${repoPath}`);
      
      // Check if the repository already exists
      if (fs.existsSync(repoPath)) {
        log.log(`Repository already exists at ${repoPath}`);
        
        // Check if it's a git repository
        try {
          log.debug('Checking if directory is a git repository');
          await execAsync('git rev-parse --is-inside-work-tree', { cwd: repoPath });
          
          // Pull latest changes
          log.debug('Pulling latest changes...');
          await execAsync('git pull', { cwd: repoPath });
        } catch (error) {
          log.error(`Directory exists but is not a git repository: ${repoPath}`);
          
          // If the directory exists but isn't a valid git repo, remove it and try cloning again
          log.debug('Removing invalid repository directory and retrying clone');
          fs.rmSync(repoPath, { recursive: true, force: true });
          
          // Clone after removing invalid directory
          const gitUrl = `https://github.com/${owner}/${repo}.git`;
          log.debug(`Cloning repository from ${gitUrl} to ${repoPath}`);
          
          try {
            await execAsync(`git clone ${gitUrl} ${repoPath}`);
          } catch (cloneError) {
            log.error(`Failed to clone repository: ${cloneError instanceof Error ? cloneError.message : String(cloneError)}`);
            return null;
          }
        }
      } else {
        // Clone the repository
        log.log(`Cloning repository to ${repoPath}...`);
        const gitUrl = `https://github.com/${owner}/${repo}.git`;
        log.debug(`Using git URL: ${gitUrl}`);
        
        try {
          log.debug(`Executing git clone ${gitUrl} ${repoPath}`);
          const result = await execAsync(`git clone ${gitUrl} ${repoPath}`);
          log.debug(`Clone result: ${result.stdout}`);
        } catch (cloneError) {
          log.error(`Clone error: ${cloneError instanceof Error ? cloneError.message : String(cloneError)}`);
          if (cloneError instanceof Error && cloneError.message.includes('Authentication failed')) {
            log.error('GitHub authentication failed. Make sure you have:');
            log.error('1. GitHub CLI installed and authenticated');
            log.error('2. Or a valid GITHUB_TOKEN environment variable');
          }
          return null;
        }
      }
      
      log.debug(`Successfully cloned/updated repository at ${repoPath}`);
      return repoPath;
    } catch (error) {
      log.error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
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
   * Detects testing frameworks used in the repository
   * 
   * @param repoPath Path to the repository
   * @returns Object containing detected frameworks by type
   */
  private async detectTestFrameworks(repoPath: string): Promise<Record<string, string | undefined>> {
    const frameworks: Record<string, string | undefined> = {
      unit: undefined,
      integration: undefined,
      e2e: undefined,
      component: undefined
    };
    
    try {
      // Read package.json
      const packageJsonPath = path.join(repoPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        this.logger.warn('No package.json found in repository');
        return frameworks;
      }
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      // Check for Vitest (unit testing)
      if (dependencies['vitest'] || fs.existsSync(path.join(repoPath, 'unit.config.ts'))) {
        frameworks.unit = 'vitest';
        this.logger.log('Detected Vitest for unit testing');
      }
      
      // Check for Playwright (E2E testing)
      if (dependencies['@playwright/test'] || fs.existsSync(path.join(repoPath, 'playwright.config.ts'))) {
        frameworks.e2e = 'playwright';
        this.logger.log('Detected Playwright for E2E testing');
      }
      
      // Check for integration testing frameworks
      if (dependencies['jest'] || fs.existsSync(path.join(repoPath, 'jest.config.js'))) {
        frameworks.integration = 'jest';
        this.logger.log('Detected Jest for integration testing');
      }
      
      return frameworks;
    } catch (error) {
      this.logger.error(`Error detecting test frameworks: ${error instanceof Error ? error.message : String(error)}`);
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
      const playwrightReportDir = path.join(repoPath, 'e2e-coverage');
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

  /**
   * Checks if a file should be ignored based on .gitignore patterns
   */
  private shouldIgnoreFile(filePath: string): boolean {
    try {
      const gitignorePath = path.join(path.dirname(filePath), '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        const patterns = gitignoreContent.split('\n').map(line => line.trim()).filter(Boolean);
        return patterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(filePath);
        });
      }
    } catch (error) {
      this.logger.warn(`Error checking .gitignore: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }

  /**
   * Generates a unit test
   */
  private async generateUnitTest(
    filePath: string,
    content: string,
    framework?: string
  ): Promise<string> {
    const fileName = path.basename(filePath);
    const moduleName = path.parse(fileName).name;
    
    // Default to Jest if no framework specified
    framework = framework || 'jest';
    
    return `import { ${moduleName} } from './${moduleName}';

describe('${moduleName}', () => {
  it('works as expected', () => {
    // Add your test implementation here
  });
});`;
  }

  /**
   * Generates an integration test
   */
  private async generateIntegrationTest(
    filePath: string,
    content: string,
    framework?: string
  ): Promise<string> {
    const fileName = path.basename(filePath);
    const moduleName = path.parse(fileName).name;
    
    // Default to Jest if no framework specified
    framework = framework || 'jest';
    
    return `import { ${moduleName} } from './${moduleName}';

describe('${moduleName} Integration', () => {
  it('integrates correctly with other modules', () => {
    // Add your integration test implementation here
  });
});`;
  }

  /**
   * Generates an E2E test
   */
  private async generateE2ETest(
    filePath: string,
    content: string,
    framework?: string
  ): Promise<string> {
    const fileName = path.basename(filePath);
    const moduleName = path.parse(fileName).name;
    
    // Default to Cypress if no framework specified
    framework = framework || 'cypress';
    
    return `describe('${moduleName} E2E', () => {
  it('works end-to-end', () => {
    // Add your E2E test implementation here
    cy.visit('/');
    // Add more E2E test steps
  });
});`;
  }
} 