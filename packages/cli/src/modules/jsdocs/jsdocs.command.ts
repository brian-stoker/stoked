import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { execSync, exec } from 'child_process';
import { LlmService, JsdocsMode, LlmMode } from '../llm/llm.service.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';
import * as util from 'util';
import * as crypto from 'crypto';
import { ProcessBatchCommand } from './process-batch.command.js';
import { createJsdocsPrompt } from '../llm/prompts/createJsdocs.js';

const execPromise = util.promisify(exec);

interface ExecError extends Error {
  message: string;
  code?: number;
  stdout?: string;
  stderr?: string;
}

interface ComponentDoc {
  name: string;
  filePath: string;
  description: string;
  props?: string;
  usage?: string;
}

interface StokedConfig {
  version: string;
  runs: Array<{
    timestamp: string;
    jsDocBlocksAdded: number;
    componentsDocumented: number;
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

// Define BatchItem interface
interface BatchItem {
  code: string; 
  filePath: string; 
  requestId: number;
  isEntryPoint: boolean;
  filePathId?: string; // Add a filePathId field for reliable matching
  filePathIndex?: number; // Add a filePathIndex field for reliable index-based matching
  commitHash?: string; // Add commitHash to track which commit version this batch was created from
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

  // Use the new standard location: ~/.stoked/.repos
  const homeDir = os.homedir();
  return path.join(homeDir, '.stoked', '.repos');
}

@Injectable()
@Command({
  name: 'jsdocs',
  description: 'Generate JSDoc comments for your code',
  arguments: '<owner/repo>',
  subCommands: [ProcessBatchCommand]
})
export class JsdocsCommand extends CommandRunner {
  private readonly workspaceRoot: string;
  private tempDir: string;
  private componentDocs: ComponentDoc[] = [];
  private includePackages?: string[];
  private debug: boolean = false;
  private verbose: boolean = false;
  private timingStats = {
    startTime: 0,
    fileTimings: new Map<string, number>(),
    totalProcessingTime: 0,
    detailedTimings: new Map<string, {
      llmServiceTime: number;
      validationTime: number;
      extractionTime: number;
      fileWriteTime: number;
      totalTime: number;
    }>()
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

  // Batch processing configuration
  private batchMode = false;
  private batchSize = 10; // Default batch size
  private pendingBatchPrompts: Array<BatchItem> = [];
  
  // Properties to fix TypeScript errors
  private currentPackagePath: string = '';
  private skipPrCreation: boolean = false;

  // Test mode configuration
  private testMode = false;
  private maxTestFiles = 5; // Default number of files to process in test mode

  // Add a new method to track package stats
  private packageStats = {
    jsDocBlocksAdded: 0,
    componentsDocumented: 0
  };

  private successfulBatchSubmissions: number = 0; // Track successful batch submissions
  private dryRun: boolean = false; // Add dryRun flag property

  // Add tracking for all package submissions
  private totalBatchStats = {
    successfulBatchSubmissions: 0,
    totalFilesQueued: 0,
    processedPackages: [] as string[]
  };

  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.workspaceRoot = getWorkspaceRoot();
    this.tempDir = path.join(this.workspaceRoot, 'temp');
    this.ensureWorkspaceDirs();

    // Check if batch mode is enabled
    const llmMode = process.env.LLM_MODE as LlmMode || LlmMode.OLLAMA;
    const jsdocsMode = process.env.JSDOCS_MODE as JsdocsMode || JsdocsMode.DEFAULT;
    
    this.batchMode = llmMode === LlmMode.OPENAI && jsdocsMode === JsdocsMode.BATCH;
    
    // Check if test mode is enabled
    this.testMode = process.env.JSDOCS_TEST_MODE === 'true';
    if (this.testMode) {
      this.maxTestFiles = parseInt(process.env.TEST_FILES || '5', 10);
      this.logger.log(`🧪 TEST MODE ENABLED: Will only process up to ${this.maxTestFiles} files per package to verify API functionality`);
    }
  }

  @Option({
    flags: '-i, --include [packages]',
    description: 'Specific packages to document (comma-separated)'
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
    flags: '--dry-run',
    description: 'Create batch files without submitting them to OpenAI API'
  })
  parseDryRun(): void {
    this.dryRun = true;
    this.logger.log('🧪 DRY RUN MODE ENABLED: Batch files will be created but not submitted to OpenAI API');
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

  private generateComponentsDocs(packageRoot: string): void {
    const components = this.componentDocs.filter(doc => doc.filePath.startsWith(packageRoot));
    
    if (components.length === 0) {
      return;
    }

    const content = `# Components Documentation

This documentation is automatically generated from JSDoc comments in the codebase.

## Table of Contents
${components.map(doc => `- [${doc.name}](#${doc.name.toLowerCase()})`).join('\n')}

${components.map(doc => `
## ${doc.name}

${doc.description}

**File:** \`${doc.filePath}\`

${doc.props ? `### Props\n\n${doc.props}\n` : ''}
${doc.usage ? `### Usage\n\n\`\`\`tsx\n${doc.usage}\n\`\`\`\n` : ''}
`).join('\n---\n')}
`;

    const docsPath = path.join(packageRoot, 'components.md');
    fs.writeFileSync(docsPath, content);
    this.logger.log(`Generated components.md with documentation for ${components.length} components at ${docsPath}`);
  }

  private shouldProcessPackage(filePath: string): boolean {
    if (!this.includePackages || this.includePackages.length === 0) {
      return true;
    }

    // Find the nearest package.json
    let dir = path.dirname(filePath);
    while (dir !== this.workspaceRoot && dir !== path.dirname(dir)) {
      const pkgJsonPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          const pkgName = pkgJson.name;
          
          return this.includePackages.some(includeName => {
            // If they provided the exact package name
            if (includeName === pkgName) {
              return true;
            }
            
            // If they provided a non-scoped name and it matches the end
            if (!includeName.startsWith('@') && pkgName.endsWith(includeName)) {
              return true;
            }
            
            // If they provided a scoped name and we need to check for mapping
            if (includeName.startsWith('@')) {
              const [scope, pkg] = includeName.slice(1).split('/');
              // Handle cases like @stoked-ui/editor matching @sui/editor
              if (scope === 'stoked-ui') {
                return pkgName === `@sui/${pkg}` || pkgName === `sui-${pkg}`;
              }
              return pkgName === includeName;
            }
            
            return false;
          });
        } catch (error) {
          this.logger.debug(`Failed to parse package.json at ${pkgJsonPath}`);
        }
      }
      dir = path.dirname(dir);
    }
    
    return false;
  }

  private loadGitignorePatterns(workDir: string): string[] {
    const patterns: string[] = [];
    let currentDir = workDir;
    
    while (currentDir !== path.dirname(currentDir)) {
      const gitignorePath = path.join(currentDir, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        patterns.push(...content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
        );
      }
      currentDir = path.dirname(currentDir);
    }
    
    return patterns;
  }

  private isIgnored(filePath: string, workDir: string, ignorePatterns: string[]): boolean {
    const relativePath = path.relative(workDir, filePath);
    
    return ignorePatterns.some(pattern => {
      // Remove leading and trailing slashes
      pattern = pattern.replace(/^\/+|\/+$/g, '');
      
      // Convert pattern to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')  // Escape dots
        .replace(/\*/g, '.*')   // Convert * to .*
        .replace(/\?/g, '.');   // Convert ? to .
      
      const regex = new RegExp(`^${regexPattern}$|^${regexPattern}/|/${regexPattern}$|/${regexPattern}/`);
      return regex.test(relativePath);
    });
  }

  private findJsFiles(workDir: string): string[] {
    const jsFiles: string[] = [];
    const ignorePatterns = this.loadGitignorePatterns(workDir);
    
    const processDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip ignored files and directories
        if (this.isIgnored(fullPath, workDir, ignorePatterns)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Skip common build and dependency directories
          if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
            continue;
          }
          processDirectory(fullPath);
        } else if (entry.isFile()) {
          // Include all JS/TS file types
          if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            // Only include if it matches the package filter
            if (this.shouldProcessPackage(fullPath)) {
              jsFiles.push(fullPath);
            }
          }
        }
      }
    };

    processDirectory(workDir);
    
    // Log found files for debugging
    if (jsFiles.length > 0) {
      this.logger.debug(`Found files in filtered packages:\n${jsFiles.map(f => `- ${path.relative(workDir, f)}`).join('\n')}`);
    } else {
      this.logger.debug('No matching files found. Searched packages:');
      // List all package.json files and their names for debugging
      const findPackages = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (!this.isIgnored(fullPath, workDir, ignorePatterns) && 
              entry.isDirectory() && 
              !['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
            findPackages(fullPath);
          } else if (entry.name === 'package.json') {
            try {
              const pkgJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
              this.logger.debug(`  - ${pkgJson.name} (${path.relative(workDir, dir)})`);
            } catch (error) {
              this.logger.debug(`  - Failed to parse ${fullPath}`);
            }
          }
        }
      };
      findPackages(workDir);
    }
    
    return jsFiles;
  }

  async run(passedParams: string[]): Promise<void> {
    // Log batch mode status only when the command is actually run
    if (this.batchMode) {
      this.logger.log('🔄 BATCH MODE ENABLED: Files will be processed asynchronously via OpenAI Batch API');
      this.logger.log('📝 No PRs will be created immediately. Run process-batch command later to generate PRs.');
      this.logger.log(`(LLM_MODE=${process.env.LLM_MODE}, JSDOCS_MODE=${process.env.JSDOCS_MODE})`);
    }

    try {
      // Start timing for the entire run
      this.timingStats.startTime = Date.now();
      
      // Set skipPrCreation flag immediately if in batch mode
      if (this.batchMode) {
        this.skipPrCreation = true;
      }
      
      if (!passedParams || passedParams.length === 0) {
        this.logger.error('Repository must be specified in format owner/repo');
        return;
      }

      const [owner, repo] = passedParams[0].split('/');
      if (!owner || !repo) {
        this.logger.error('Repository must be in format owner/repo');
        return;
      }

      this.logger.log(`Processing ${owner}/${repo}`);
      
      // Clean up temp directory
      this.cleanWorkspace();
      
      // Path to local repository
      const repoDir = path.join(this.workspaceRoot, owner, repo);
      const workDir = path.join(repoDir);
      
      // Check if we have the repo already
      if (fs.existsSync(repoDir)) {
        this.logger.log('Found existing repository clone, checking state...');
        
        // Switch to the repo dir
        process.chdir(repoDir);
        
        // Check if we're up to date
        try {
          execSync('git fetch origin');
          const localHash = execSync('git rev-parse HEAD').toString().trim();
          const remoteHash = execSync('git rev-parse origin/main').toString().trim();
          
          if (localHash !== remoteHash) {
            execSync('git reset --hard origin/main');
            this.logger.log('Local repository updated to match origin/main');
          } else {
            this.logger.log('Local repository is up to date');
          }
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Failed to update repository: ${err.message}`);
          return;
        }
        
        // Check if claude/jsdocs branch exists
        try {
          // Get the Stoked tool version for branch name
          const stokedVersion = this.getStokedVersion();
          let branchName = `stoked/jsdocs-${stokedVersion}`;
          
          const branches = execSync('git branch').toString();
          if (branches.includes(branchName)) {
            execSync(`git checkout ${branchName}`);
            this.logger.log(`Found existing ${branchName} branch, continuing with existing work...`);
          } else {
            execSync(`git checkout -b ${branchName}`);
            this.logger.log(`Created new ${branchName} branch`);
          }
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Failed to check/create branch: ${err.message}`);
          return;
        }
      } else {
        // Clone the repository
        this.logger.log(`Cloning ${owner}/${repo}`);
        try {
          // Create directory structure
          fs.mkdirSync(path.join(this.workspaceRoot, owner), { recursive: true });
          
          // Clone the repo
          execSync(`git clone https://github.com/${owner}/${repo}.git ${repoDir}`);
          
          // Switch to the repo dir
          process.chdir(repoDir);
          
          // Create a new branch
          // Get the Stoked tool version for branch name
          const stokedVersion = this.getStokedVersion();
          const branchName = `stoked/jsdocs-${stokedVersion}`;
          execSync(`git checkout -b ${branchName}`);
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Failed to clone repository: ${err.message}`);
          return;
        }
      }
      
      // Filter packages if specified
      if (this.includePackages) {
        this.logger.log(`Filtering for packages: ${this.includePackages.join(', ')}`);
      }
      
      // Find all JS/TS files
      const jsFiles = this.findJsFiles(workDir);
      
      // Initialize total progress
      this.progress.total = {
        packages: this.includePackages?.length || 1,
        files: jsFiles.length,
        processedFiles: 0
      };

      this.logger.log(`Found ${jsFiles.length} JavaScript/TypeScript files to process`);

      // Group files by package
      const packageFiles = new Map<string, string[]>();
      for (const file of jsFiles) {
        const pkgDir = this.findPackageRoot(file);
        if (pkgDir) {
          const files = packageFiles.get(pkgDir) || [];
          files.push(file);
          packageFiles.set(pkgDir, files);
        }
      }
      
      // Extract the names of packages being processed
      const packageNames: string[] = [];
      for (const packagePath of packageFiles.keys()) {
        try {
          const pkgJsonPath = path.join(packagePath, 'package.json');
          if (fs.existsSync(pkgJsonPath)) {
            const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
            if (pkgJson.name) {
              packageNames.push(pkgJson.name);
            } else {
              packageNames.push(path.basename(packagePath));
            }
          } else {
            packageNames.push(path.basename(packagePath));
          }
        } catch (error) {
          // If any error occurs, use the directory name
          packageNames.push(path.basename(packagePath));
        }
      }

      // Process each package
      try {
        for (const [packagePath, files] of packageFiles) {
          await this.processPackage(packagePath, files);
        }
        
        // If we're in batch mode, show a final summary
        if (this.batchMode) {
          this.showBatchSummary();
        }
        
        // Create pull request with all the changes
        // Skip PR creation in batch mode - it will be created by process-batch command later
        if (packageNames.length > 0 && !this.skipPrCreation) {
          await this.createPullRequest(packageNames);
        }
      } catch (packageError) {
        // If batch processing fails, we don't want to create a pull request
        // Since the whole point of batch mode is to reduce cost
        if (this.batchMode) {
          this.logger.error(`Batch processing failed: ${packageError instanceof Error ? packageError.message : String(packageError)}`);
          this.logger.error('Aborting without creating a pull request to avoid partial/inconsistent documentation.');
          process.exit(1);
        } else {
          // For non-batch mode, we can still create a PR with partial changes
          this.logger.warn(`Some packages failed to process: ${packageError instanceof Error ? packageError.message : String(packageError)}`);
          if (packageNames.length > 0) {
            this.logger.log('Creating pull request with successfully processed packages...');
            await this.createPullRequest(packageNames);
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to process repository: ${err.message}`);
      process.exit(1);
    }
  }

  private findPackageRoot(filePath: string): string | null {
    let dir = path.dirname(filePath);
    while (dir !== this.workspaceRoot) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    return null;
  }

  private cleanLLMResponse(response: string): string {
    // Remove any markdown code block markers
    let cleaned = response.replace(/^```(?:typescript|javascript)?\n/m, '');
    cleaned = cleaned.replace(/\n```$/m, '');
    
    // Verify we haven't accidentally removed code
    if (cleaned.trim().length < response.trim().length / 2) {
      this.logger.warn('Significant content loss after cleaning response, using original');
      return response;
    }
    
    return cleaned;
  }

  private isPackageEntryPoint(filePath: string): boolean {
    // Check if the file is named index.ts, index.js, main.ts, or main.js
    const fileName = path.basename(filePath);
    const isIndexOrMainFile = ['index.ts', 'index.js', 'main.ts', 'main.js'].includes(fileName);
    
    if (!isIndexOrMainFile) {
      return false;
    }
    
    // Get the package directory
    const packageDir = this.findPackageRoot(filePath);
    if (!packageDir) {
      return false;
    }
    
    // Check if this file is referenced in package.json
    const packageJsonPath = path.join(packageDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const relativeFilePath = path.relative(packageDir, filePath);
        
        // Check if this file is referenced in main, module, or types fields
        const mainField = packageJson.main || '';
        const moduleField = packageJson.module || '';
        const typesField = packageJson.types || packageJson.typings || '';
        const libField = packageJson.lib || '';
        
        if ([mainField, moduleField, typesField, libField].some(field => {
          // Check if the field points to this file or to a directory containing this file
          return field === relativeFilePath || 
                 path.dirname(field) === path.dirname(relativeFilePath);
        })) {
          return true;
        }
      } catch (error) {
        // If we can't parse the package.json, just use the file name heuristic
        this.logger.debug(`Failed to parse package.json for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // If the file is in the src directory and is index.ts/js, it's likely an entry point
    const isInSrcDir = path.dirname(filePath).endsWith('/src') || path.dirname(filePath).endsWith('\\src');
    if (isInSrcDir && ['index.ts', 'index.js'].includes(fileName)) {
      return true;
    }
    
    // If we're at the root of the package and it's index.ts/js, it's likely an entry point
    if (path.dirname(filePath) === packageDir && ['index.ts', 'index.js'].includes(fileName)) {
      return true;
    }
    
    return false;
  }

  private async processCodeChunk(code: string, filePath: string): Promise<{ documentedCode: string; newDocsCount: number }> {
    const requestId = Date.now();
    const requestFile = path.join(this.tempDir, `request-${requestId}.json`);
    const responseFile = path.join(this.tempDir, `response-${requestId}.json`);

    // Determine if this file should have a package documentation tag
    const isEntryPoint = this.isPackageEntryPoint(filePath);

    // Write request to temp file for debugging
    const request = {
      code,
      filePath,
      requestId,
      isEntryPoint
    };
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));

    try {
      // Prepare the prompt for the LLM
      const prompt = createJsdocsPrompt(code, isEntryPoint);

      // Call LLM service
      const response = await this.llmService.query(prompt);
      
      // Clean up any markdown formatting in the response
      const cleanedResponse = this.cleanLLMResponse(response);
      
      // Write response to temp file for debugging
      const result = {
        success: true,
        originalResponse: response,
        cleanedResponse
      };
      fs.writeFileSync(responseFile, JSON.stringify(result, null, 2));

      // Verify the response is valid code
      if (!cleanedResponse || cleanedResponse.trim().length === 0) {
        throw new Error('Empty response from LLM');
      }

      // Count new JSDoc blocks
      const originalJsDocMatches = code.match(/\/\*\*[\s\S]*?\*\//g);
      const newJsDocMatches = cleanedResponse.match(/\/\*\*[\s\S]*?\*\//g);
      const originalCount = originalJsDocMatches ? originalJsDocMatches.length : 0;
      const newCount = newJsDocMatches ? newJsDocMatches.length : 0;

      return {
        documentedCode: cleanedResponse,
        newDocsCount: newCount - originalCount
      };

    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to process code chunk: ${err.message}`);
    } finally {
      // Clean up temp files
      try {
        fs.unlinkSync(requestFile);
        fs.unlinkSync(responseFile);
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Failed to clean up temp files: ${err.message}`);
      }
    }
  }

  private extractComponentInfo(code: string, filePath: string): ComponentDoc | null {
    // Look for React component definitions with JSDoc
    const componentMatch = code.match(/\/\*\*\s*([\s\S]*?)\*\/\s*(export\s+(?:default\s+)?(?:function|const|class)\s+(\w+))/);
    
    if (!componentMatch || !componentMatch[1] || !componentMatch[3]) {
      return null;
    }
    
    const jsDoc = componentMatch[1];
    const componentName = componentMatch[3];
    
    // Parse JSDoc content
    const descriptionMatch = jsDoc.match(/@description\s+(.*?)(?=@|$)/s) || jsDoc.match(/\*\s*([^@].*?)(?=@|$)/s);
    const description = descriptionMatch?.[1]?.trim();
      
    const propsMatch = jsDoc.match(/@props\s+(.*?)(?=@|$)/s);
    const props = propsMatch?.[1]?.trim();
    
    const usageMatch = jsDoc.match(/@example\s+(.*?)(?=@|$)/s);
    const usage = usageMatch?.[1]?.trim();
    
    return {
      name: componentName,
      filePath: filePath.replace(/\\/g, '/'),
      description: description || 'No description provided',
      ...(props && { props }),
      ...(usage && { usage })
    };
  }

  private logFileProgress(filePath: string): void {
    this.progress.currentPackage.processedFiles++;
    this.progress.total.processedFiles++;

    const packagePercent = (this.progress.currentPackage.processedFiles / this.progress.currentPackage.totalFiles * 100).toFixed(1);
    const packageProgress = `${this.progress.currentPackage.processedFiles}/${this.progress.currentPackage.totalFiles} (${packagePercent}%)`;
    
    let message = `Processing ${path.relative(this.workspaceRoot, filePath)}`;
    if (this.batchMode) {
      message = `[BATCH MODE] ${message} (for async processing)`;
    }
    
    const packageProgressMessage = `[${packageProgress} of ${this.progress.currentPackage.name}]`;
    
    // Only add total progress if processing multiple packages
    if (this.progress.total.packages > 1) {
      const totalPercent = (this.progress.total.processedFiles / this.progress.total.files * 100).toFixed(1);
      const totalProgress = `${this.progress.total.processedFiles}/${this.progress.total.files} (${totalPercent}%)`;
      message = `${packageProgressMessage} [Total: ${totalProgress}] - ${message}`;
    } else {
      message = `${packageProgressMessage} - ${message}`;
    }
    
    this.logger.log(message);
  }

  /**
   * Process a batch of prompts using the OpenAI Batch API
   */
  private async processBatch(): Promise<void> {
    if (this.pendingBatchPrompts.length === 0) {
      return;
    }

    const batch = [...this.pendingBatchPrompts];
    this.pendingBatchPrompts = [];
    
    try {
      // Create a list of prompts for the API
      const prompts = batch.map((item) => {
        return `Use TypeScript JSDoc comments to document this code.

Please add comprehensive JSDoc comments according to these guidelines:

1. Documentation Coverage:
   - Add documentation for ALL exports: functions, classes, interfaces, types, variables, etc.
   - Ensure all parameters, properties, return values, and generics are documented

2. Documentation Details:
   - Component/Class documentation: functionality, props/methods, state, effects
   - Function documentation: purpose, parameters, return value, side effects
   - Document any complex logic or business rules

3. React Component Documentation:
   - Place JSDoc comments directly above the component definition
   - Provide a clear @description of the component's purpose
   - Document each prop using @param {type} props.propName - Description
   - Use @returns {JSX.Element} or @returns {React.ReactNode} to indicate return type
   - Use @property to define the type and description of each prop
   - Include at least one @example for usage (multiple for different use cases/variants)
   - Use @fires to document which events the component emits
   - Use @see to refer to related components or functions

4. Event Handler Documentation:
   - Use @param with React.ChangeEvent, React.MouseEvent, etc. to document event handler parameters
   - Specify the return type of the function if applicable

5. Style Rules:
   - Keep comments focused and concise
   - Use clear, professional language
   - Avoid redundant or obvious documentation
   - No inline comments between code lines unless absolutely necessary for clarity

6. Response Format:
   - Return ONLY the documented code
   - Do not wrap the code in markdown code blocks
   - Do not add any explanatory text
   - Do not use triple backticks
   - Do not modify the code structure in any way
   - Only add or modify comments

7. Special Instructions for This File:
   ${item.isEntryPoint 
     ? "- This file IS a package entry point: ADD a @packageDocumentation tag with a comprehensive description of the package's purpose and functionality at the top of the file" 
     : "- This file is NOT a package entry point: DO NOT add a @packageDocumentation tag to this file"}

Code to document:
${item.code}`;
      });

      this.logger.log(`Submitting ${prompts.length} prompts to OpenAI Batch API...`);
      
      let batchId: string;
      
      if (this.dryRun) {
        // In dry run mode, generate a fake batch ID and skip the API call
        batchId = `batch_dryrun_${Date.now().toString(16)}`;
        this.logger.log(`🧪 DRY RUN: Skipping API submission, using generated batch ID: ${batchId}`);
      } else {
        // Call batch API - this will return placeholders, not actual results
        const batchResults = await this.llmService.batchProcess(prompts);
        
        // Get the batch ID from the response metadata
        const retrievedBatchId = batchResults[0]?.metadata?.batchId;
        
        if (!retrievedBatchId) {
          throw new Error('No batch ID found in response metadata');
        }
        
        batchId = retrievedBatchId;
      }
      
      // Save batch information for later processing
      this.saveBatchInfo(batch, batchId);
      
      // Increment successful batch submissions counter
      this.successfulBatchSubmissions++;
      
      // Update global batch stats
      this.totalBatchStats.successfulBatchSubmissions++;
      this.totalBatchStats.totalFilesQueued += batch.length;
      
      // Make sure the current package is tracked
      if (!this.totalBatchStats.processedPackages.includes(path.basename(this.currentPackagePath))) {
        this.totalBatchStats.processedPackages.push(path.basename(this.currentPackagePath));
      }
      
      this.logger.log(`\n✅ Batch ${this.dryRun ? 'file created' : 'submitted'} successfully with ID: ${batchId}`);
      
      if (!this.dryRun) {
        this.logger.log(`\n📝 This is an asynchronous operation that may take several hours to complete.`);
        this.logger.log(`\n📋 What to do next:`);
        this.logger.log(`1. Check batch status: stoked llm batch-check`);
        this.logger.log(`2. When complete, process results: stoked jsdocs process-batch`);
        this.logger.log(`\n💰 Using batch processing saves approximately 50% on OpenAI API costs.`);
      } else {
        this.logger.log(`\n📝 Since this is a dry run, no actual API call was made.`);
        this.logger.log(`\n📋 You can find the batch file at: ~/.stoked/batch-data/items-${batchId}.json`);
      }
      
      // Skip PR creation since we don't have results yet
      this.skipPrCreation = true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to submit batch: ${err.message}`);
      
      // IMPORTANT: No fallback to individual processing - this would defeat the purpose of batch mode
      throw new Error(`Batch submission failed and individual processing fallback is disabled. Original error: ${err.message}`);
    }
  }
  
  /**
   * Saves batch information for later processing
   * @param batch The batch items
   * @param batchId The batch ID
   */
  private saveBatchInfo(batch: BatchItem[], batchId: string): void {
    const homeDir = os.homedir();
    const batchInfoDir = path.join(homeDir, '.stoked', 'batch-data');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(batchInfoDir)) {
      fs.mkdirSync(batchInfoDir, { recursive: true });
    }
    
    const batchItemsPath = path.join(batchInfoDir, `items-${batchId}.json`);
    
    // Create a map of indices to file paths
    const filePathIndices: Record<number, string> = {};
    
    // Map batch items to simpler format for serialization
    const serializedItems = batch.map((item, index) => {
      // Store the file path with its index
      filePathIndices[index] = item.filePath;
      
      return {
        requestId: item.requestId,
        filePath: item.filePath,
        isEntryPoint: item.isEntryPoint,
        filePathId: item.filePathId, // Include the filePathId for deterministic matching
        filePathIndex: index, // Add the index reference
        commitHash: item.commitHash // Include the commitHash
      };
    });
    
    // Get the current Git commit hash to ensure code version consistency
    let commitHash: string | undefined;
    try {
      // Get the current commit hash 
      commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      this.logger.log(`Captured commit hash for batch: ${commitHash}`);
    } catch (error) {
      this.logger.warn(`Failed to get current commit hash: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.warn('Code version consistency cannot be guaranteed when processing this batch');
    }
    
    // Save batch items
    fs.writeFileSync(batchItemsPath, JSON.stringify({
      batchId,
      packagePath: this.currentPackagePath,
      timestamp: new Date().toISOString(),
      commitHash, // Store the commit hash
      items: serializedItems,
      filePathIndices // Include the mapping from indices to file paths
    }, null, 2));
    
    this.logger.log(`Batch information saved to ${batchItemsPath}`);
  }

  /**
   * Gets the current stoked version from package.json
   * @returns Formatted version string suitable for branch names
   */
  private getStokedVersion(): string {
    try {
      // Get the Stoked tool version from the stoked package.json in the project root
      // This represents the version of the documentation generator being used
      const packageJsonPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          // Make sure we're getting the version of the stoked tool itself
          if (packageJson.name === 'stoked') {
            // Use dots in branch name, they are permitted in Git branches
            return packageJson.version || '0.0.1';
          } else {
            // Only log this in debug mode to avoid cluttering output
            this.logger.debug(`Package.json at ${packageJsonPath} does not belong to stoked tool (found name: ${packageJson.name})`);
          }
        } catch (err) {
          this.logger.debug(`Error parsing package.json: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      // Try to get version via command directly as fallback
      try {
        const versionOutput = execSync('stoked -v', { encoding: 'utf8' });
        const versionMatch = versionOutput.match(/stoked:\s+(\d+\.\d+\.\d+(?:-\w+\.\d+)?)/i);
        if (versionMatch && versionMatch[1]) {
          return versionMatch[1];
        }
      } catch (err) {
        this.logger.debug(`Failed to get version via command: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (error) {
      this.logger.debug(`Failed to get stoked version: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Default to a timestamp if version can't be determined
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Create a pull request with the generated documentation
   * @param packageNames Names of packages that were processed
   */
  private async createPullRequest(packageNames: string[]): Promise<void> {
    try {
      // Get the Stoked tool version for branch name
      // This identifies the version of the documentation generator used
      const stokedVersion = this.getStokedVersion();
      
      // Determine branch name based on packages processed
      let branchName: string;
      if (packageNames.length === 1) {
        // Single package - use stoked/jsdocs-${package}-${stoked-version}
        // The stoked-version indicates which version of the tool generated the docs
        branchName = `stoked/jsdocs-${packageNames[0].replace('@', '').replace('/', '-')}-${stokedVersion}`;
      } else {
        // Multiple packages or entire repo - use stoked/jsdocs-${stoked-version}
        branchName = `stoked/jsdocs-${stokedVersion}`;
      }
      
      this.logger.log(`Creating branch: ${branchName}`);
      
      // Create and switch to the branch
      try {
        // First check if branch exists locally
        const localBranches = execSync('git branch', { encoding: 'utf8' });
        if (localBranches.includes(branchName)) {
          execSync(`git checkout ${branchName}`, { encoding: 'utf8' });
        } else {
          // Check if branch exists remotely
          const remoteBranches = execSync('git branch -r', { encoding: 'utf8' });
          if (remoteBranches.includes(`origin/${branchName}`)) {
            execSync(`git checkout -b ${branchName} origin/${branchName}`, { encoding: 'utf8' });
          } else {
            // Create new branch
            execSync(`git checkout -b ${branchName}`, { encoding: 'utf8' });
          }
        }
      } catch (error) {
        this.logger.error(`Failed to create/switch to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // Add all changes
      this.logger.log('Adding changes to git...');
      try {
        execSync('git add .', { encoding: 'utf8' });
      } catch (error) {
        this.logger.error(`Failed to add changes: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if we have changes to commit
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      if (!status.trim()) {
        this.logger.log('No changes to commit');
        return;
      }
      
      // Create a descriptive commit message
      const commitMessage = `docs: add JSDoc comments to ${packageNames.join(', ')}`;
      this.logger.log('Committing changes...');
      try {
        execSync(`git commit -m "${commitMessage}"`, { encoding: 'utf8' });
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
        execSync(`git push origin ${branchName} --force`, { encoding: 'utf8' });
      } catch (error) {
        this.logger.error(`Failed to push to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if PR already exists
      this.logger.log('Checking for existing pull request...');
      let prExists = false;
      try {
        const prCheckResult = execSync(`gh pr list --head ${branchName} --json number`, { encoding: 'utf8' });
        try {
          const prData = JSON.parse(prCheckResult);
          prExists = Array.isArray(prData) && prData.length > 0;
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
      const prTitle = packageNames.length === 1
        ? `docs: add JSDoc comments to ${packageNames[0]}`
        : `docs: add JSDoc comments to ${packageNames.length} packages`;
        
      const prBody = `This PR adds JSDoc comments to the following packages:
- ${packageNames.join('\n- ')}

## Changes
- Added JSDoc comments to functions, classes, and interfaces
- Generated components.md files for packages with React components
- Added documentation for props, usage examples, and component descriptions

Generated using Stoked v${this.getStokedVersion().replace(/-/g, '.')}${this.testMode ? ' (TEST MODE)' : ''}`;

      try {
        execSync(
          `gh pr create --title "${prTitle}" --body "${prBody}" --base main`,
          { encoding: 'utf8' }
        );
        this.logger.log('Pull request created successfully');
      } catch (error) {
        this.logger.error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
      if (this.debug) {
        this.logger.debug(`PR error details: ${JSON.stringify(error)}`);
      }
    }
  }

  /**
   * Updates the package statistics
   * @param jsDocBlocksAdded Number of JSDoc blocks added
   * @param componentsDocumented Number of components documented
   */
  private updatePackageStats(jsDocBlocksAdded: number, componentsDocumented: number): void {
    this.packageStats.jsDocBlocksAdded += jsDocBlocksAdded;
    this.packageStats.componentsDocumented += componentsDocumented;
  }

  private async processFile(file: string): Promise<{ newDocsCount: number; componentInfo?: ComponentDoc }> {
    const content = fs.readFileSync(file, 'utf8');
    
    // If batch mode is enabled, add to pending batch
    if (this.batchMode) {
      const requestId = Date.now() + Math.floor(Math.random() * 1000);
      const requestFile = path.join(this.tempDir, `request-${requestId}.json`);
      
      // Determine if this file should have a package documentation tag
      const isEntryPoint = this.isPackageEntryPoint(file);
      
      // Create a filePathId from the actual file path (normalized to use / separator)
      const normalizedPath = file.replace(/\\/g, '/');
      // Create a path relative to the package root, which is more deterministic
      const relativePathToPackage = normalizedPath.replace(this.currentPackagePath.replace(/\\/g, '/'), '').replace(/^\//, '');
      
      // Write request to temp file for debugging
      const request: BatchItem = {
        code: content,
        filePath: file,
        requestId,
        isEntryPoint,
        filePathId: relativePathToPackage, // Add the file path ID for reliable matching
        filePathIndex: 0, // Add a filePathIndex field for reliable index-based matching
        commitHash: undefined // Add commitHash to track which commit version this batch was created from
      };
      fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
      
      this.pendingBatchPrompts.push(request);
      
      // All files will be processed together at the end of the package processing
      // Return dummy values as the actual processing happens in batch
      return { 
        newDocsCount: 0,
        componentInfo: undefined
      };
    }
    
    // Regular non-batch processing
    const { documentedCode, newDocsCount } = await this.processCodeChunk(content, file);
    
    // Extract component info if it's a component file
    const extractedInfo = this.extractComponentInfo(documentedCode, file);
    const componentInfo = extractedInfo || undefined;
    if (componentInfo) {
      this.componentDocs.push(componentInfo);
    }

    // Write documented code back to file
    fs.writeFileSync(file, documentedCode);

    return { newDocsCount, componentInfo };
  }

  private async processPackage(packagePath: string, files: string[]): Promise<void> {
    // Store the current package path for batch processing
    this.currentPackagePath = packagePath;
    
    // In test mode, prioritize important files before limiting count
    if (this.testMode && files.length > this.maxTestFiles) {
      this.logger.log(`Test mode: Selecting ${this.maxTestFiles} files out of ${files.length} total with priority to entry points`);
      
      // Identify entry point files and other important files
      const entryPointFiles: string[] = [];
      const componentFiles: string[] = [];
      const otherFiles: string[] = [];
      
      // Categorize files
      for (const file of files) {
        if (this.isPackageEntryPoint(file)) {
          entryPointFiles.push(file);
        } else if (file.includes('component') || file.match(/\.(jsx|tsx)$/)) {
          componentFiles.push(file);
        } else {
          otherFiles.push(file);
        }
      }
      
      this.logger.debug(`Entry point files: ${entryPointFiles.length}, Component files: ${componentFiles.length}, Other files: ${otherFiles.length}`);
      
      // Create prioritized list: entry points → components → others
      let selectedFiles: string[] = [...entryPointFiles];
      
      // Add component files until we reach maxTestFiles or run out
      const remainingSlots = this.maxTestFiles - selectedFiles.length;
      if (remainingSlots > 0 && componentFiles.length > 0) {
        selectedFiles = selectedFiles.concat(componentFiles.slice(0, remainingSlots));
      }
      
      // Add other files if we still have space
      const finalRemainingSlots = this.maxTestFiles - selectedFiles.length;
      if (finalRemainingSlots > 0 && otherFiles.length > 0) {
        selectedFiles = selectedFiles.concat(otherFiles.slice(0, finalRemainingSlots));
      }
      
      this.logger.log(`Selected ${selectedFiles.length} files with priority: entry points (${entryPointFiles.length}), components (${Math.min(componentFiles.length, Math.max(0, remainingSlots))}), others (${Math.min(otherFiles.length, Math.max(0, finalRemainingSlots))})`);
      
      files = selectedFiles;
    }

    // Update progress tracking
    this.progress.currentPackage = {
      name: path.basename(packagePath),
      totalFiles: files.length,
      processedFiles: 0
    };

    // Reset package stats for this package
    this.packageStats = {
      jsDocBlocksAdded: 0,
      componentsDocumented: 0
    };
    
    // Reset batch submission counter for this package
    this.successfulBatchSubmissions = 0;

    // Get concurrency level from environment variable or default to 5
    const concurrencyLevel = parseInt(process.env.JSDOC_CONCURRENCY || '5', 10);
    this.logger.log(`Processing files with concurrency level: ${concurrencyLevel}`);
    
    // Process files in batches to maintain controlled concurrency
    for (let i = 0; i < files.length; i += concurrencyLevel) {
      const batch = files.slice(i, i + concurrencyLevel);
      const promises = batch.map(async (file) => {
        try {
          this.logFileProgress(file);
          const result = await this.processFile(file);
          
          // Only update stats if not in batch mode, as batch mode will update stats separately
          if (!this.batchMode) {
            this.updatePackageStats(result.newDocsCount, result.componentInfo ? 1 : 0);
          }
          
          return result;
        } catch (error) {
          const err = error as Error;
          this.logger.warn(`Failed to process ${file}: ${err.message}`);
          return { newDocsCount: 0 };
        }
      });
      
      // Wait for all files in this batch to complete
      await Promise.all(promises);
    }

    // Process any remaining files in the batch queue
    if (this.batchMode && this.pendingBatchPrompts.length > 0) {
      await this.processBatch();
    }

    // Generate components.md if we found any components
    if (this.componentDocs.length > 0 && !this.batchMode) {
      this.generateComponentsDocs(packagePath);
    }

    // Update or create .stokedrc.json
    // Skip in batch mode since we're not actually adding JSDoc blocks yet
    if (!this.batchMode) {
      const configPath = path.join(packagePath, '.stokedrc.json');
      const config: StokedConfig = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
        : { version: '1.0.0', runs: [] };

      config.runs.push({
        timestamp: new Date().toISOString(),
        jsDocBlocksAdded: this.packageStats.jsDocBlocksAdded,
        componentsDocumented: this.packageStats.componentsDocumented,
        testMode: this.testMode
      });

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      this.logger.log(`
Package ${path.basename(packagePath)} processed:
- Added ${this.packageStats.jsDocBlocksAdded} JSDoc blocks
- Documented ${this.packageStats.componentsDocumented} components
- Updated ${configPath}
${this.testMode ? '- TEST MODE was enabled (limited file processing)' : ''}
      `);
    } else {
      // In batch mode, provide a simpler message for each package
      let packageName = path.basename(packagePath);
      const packageJsonPath = path.join(packagePath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          if (packageJson.name) {
            packageName = packageJson.name;
          }
        } catch (error) {
          // Fallback to directory name if we can't parse package.json
        }
      }
      
      // Just log a simple message - the final summary will be shown at the end
      this.logger.log(`Package ${packageName} processed for batch submission`);
      
      // Log additional info in debug mode
      if (this.debug) {
        const message = this.successfulBatchSubmissions > 0
          ? `Submitted ${this.successfulBatchSubmissions} batch(es) for this package`
          : 'No batches were submitted for this package';
        this.logger.debug(message);
      }
    }
  }

  private showBatchSummary(): void {
    // Format the batch submission status message
    let batchStatusMessage;
    
    if (this.totalBatchStats.successfulBatchSubmissions > 0) {
      // At least one batch was successfully submitted across all packages
      batchStatusMessage = `- Successfully submitted ${this.totalBatchStats.successfulBatchSubmissions} batch(es) for processing`;
      batchStatusMessage += `\n- Total files queued for processing: ${this.totalBatchStats.totalFilesQueued}`;
    } else {
      // No successful submissions
      batchStatusMessage = `- No files queued for processing (batch submission failed)`;
    }
      
    // Get the list of packages that were processed
    const packagesMessage = `- Packages processed: ${this.totalBatchStats.processedPackages.join(', ')}`;
    
    this.logger.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                       🔄 BATCH PROCESSING SUMMARY                          ║
╚════════════════════════════════════════════════════════════════════════════╝

${packagesMessage}
${batchStatusMessage}

Next Steps:
- Run 'stoked llm batch-check' to check batch status
- Run 'stoked jsdocs process-batch' when completed

💰 Using batch processing saves approximately 50% on OpenAI API costs.
    `);
  }
} 