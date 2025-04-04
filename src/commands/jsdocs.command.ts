import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { execSync, exec } from 'child_process';
import { LlmService, JsdocsMode, LlmMode } from '../services/llm.service.js';
import { ThemeLogger } from '../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';
import * as util from 'util';
import * as crypto from 'crypto';

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

@Injectable()
@Command({
  name: 'jsdocs',
  description: 'Add JSDoc comments to all JavaScript/TypeScript files in a repository',
  arguments: '<owner/repo>'
})
export class JsDocsCommand extends CommandRunner {
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
  private pendingBatchPrompts: Array<{ 
    code: string; 
    filePath: string; 
    requestId: number;
  }> = [];

  // Test mode configuration
  private testMode = false;
  private maxTestFiles = 5; // Default number of files to process in test mode

  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.workspaceRoot = path.join(process.cwd(), '.workspace');
    this.tempDir = path.join(this.workspaceRoot, 'temp');
    this.ensureWorkspaceDirs();

    // Check if batch mode is enabled
    const llmMode = process.env.LLM_MODE as LlmMode || LlmMode.OLLAMA;
    const jsdocsMode = process.env.JSDOCS_MODE as JsdocsMode || JsdocsMode.DEFAULT;
    
    this.batchMode = llmMode === LlmMode.OPENAI && jsdocsMode === JsdocsMode.BATCH;
    
    if (this.batchMode) {
      this.logger.log('Batch processing enabled - will process all files in a single batch per package');
    }
    
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
    try {
      // Start timing for the entire run
      this.timingStats.startTime = Date.now();
      
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
      for (const [packagePath, files] of packageFiles) {
        await this.processPackage(packagePath, files);
      }
      
      // Create pull request with all the changes
      if (packageNames.length > 0) {
        await this.createPullRequest(packageNames);
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

  private async processCodeChunk(code: string, filePath: string): Promise<{ documentedCode: string; newDocsCount: number }> {
    const requestId = Date.now();
    const requestFile = path.join(this.tempDir, `request-${requestId}.json`);
    const responseFile = path.join(this.tempDir, `response-${requestId}.json`);

    // Write request to temp file for debugging
    const request = {
      code,
      filePath,
      requestId
    };
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));

    try {
      // Prepare the prompt for the LLM
      const prompt = `Add JSDoc comments to this TypeScript/JavaScript code. Follow these specific rules:

1. Documentation Placement Rules:
   - Place documentation at the highest possible scope (e.g., before interfaces, component definitions)
   - Only add proper JSDoc format comments (/** ... */ style)
   - Every package must have a @packageDocumentation tag with a verbose description about the subject matter/domain area
   - Mid-stream comments are only allowed for unique circumstances (magic numbers, complex algorithms) that would be confusing without context

2. Required Documentation:
   - Interface/Type documentation: purpose, properties, usage
   - Create @typedef tags for any moderately complex object types, prop types, etc.
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

Code to document:
${code}`;

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

  private async processBatch(): Promise<void> {
    if (this.pendingBatchPrompts.length === 0) {
      return;
    }

    const batch = [...this.pendingBatchPrompts];
    this.pendingBatchPrompts = [];

    this.logger.log(`Processing batch of ${batch.length} files...`);
    
    try {
      // Prepare all prompts for the batch
      const prompts = batch.map(item => {
        return `Add JSDoc comments to this TypeScript/JavaScript code. Follow these specific rules:

1. Documentation Placement Rules:
   - Place documentation at the highest possible scope (e.g., before interfaces, component definitions)
   - Only add proper JSDoc format comments (/** ... */ style)
   - Every package must have a @packageDocumentation tag with a verbose description about the subject matter/domain area
   - Mid-stream comments are only allowed for unique circumstances (magic numbers, complex algorithms) that would be confusing without context

2. Required Documentation:
   - Interface/Type documentation: purpose, properties, usage
   - Create @typedef tags for any moderately complex object types, prop types, etc.
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

Code to document:
${item.code}`;
      });

      // Call batch API
      const responses = await this.llmService.batchProcess(prompts);

      // Process each response
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const response = responses[i];
        const requestFile = path.join(this.tempDir, `request-${item.requestId}.json`);
        const responseFile = path.join(this.tempDir, `response-${item.requestId}.json`);

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
          this.logger.error(`Empty response from LLM for file: ${item.filePath}`);
          continue;
        }

        // Count new JSDoc blocks
        const originalJsDocMatches = item.code.match(/\/\*\*[\s\S]*?\*\//g);
        const newJsDocMatches = cleanedResponse.match(/\/\*\*[\s\S]*?\*\//g);
        const originalCount = originalJsDocMatches ? originalJsDocMatches.length : 0;
        const newCount = newJsDocMatches ? newJsDocMatches.length : 0;
        const newDocsCount = newCount - originalCount;

        // Write the documented code back to the file
        fs.writeFileSync(item.filePath, cleanedResponse);

        // Extract component info if it's a component file
        const extractedInfo = this.extractComponentInfo(cleanedResponse, item.filePath);
        if (extractedInfo) {
          this.componentDocs.push(extractedInfo);
        }

        // Clean up temp files
        try {
          fs.unlinkSync(requestFile);
          fs.unlinkSync(responseFile);
        } catch (error) {
          const err = error as Error;
          this.logger.warn(`Failed to clean up temp files: ${err.message}`);
        }

        this.logger.log(`Processed file ${item.filePath} from batch - Added ${newDocsCount} JSDoc blocks`);
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to process batch: ${err.message}`);
      
      // In case of error, write all pending files back to the queue
      // so they can be processed individually as fallback
      for (const item of batch) {
        const { code, filePath } = item;
        try {
          this.logger.log(`Fallback: Processing ${filePath} individually after batch failure`);
          const { documentedCode, newDocsCount } = await this.processCodeChunk(code, filePath);
          
          // Extract component info if it's a component file
          const extractedInfo = this.extractComponentInfo(documentedCode, filePath);
          
          // Write documented code back to file
          fs.writeFileSync(filePath, documentedCode);
          
          this.logger.log(`Fallback processed: ${filePath} - Added ${newDocsCount} JSDoc blocks`);
          
          if (extractedInfo) {
            this.componentDocs.push(extractedInfo);
          }
        } catch (innerError) {
          const innerErr = innerError as Error;
          this.logger.warn(`Failed to process ${filePath} in fallback mode: ${innerErr.message}`);
        }
      }
    }
  }

  private async processFile(file: string): Promise<{ newDocsCount: number; componentInfo?: ComponentDoc }> {
    const content = fs.readFileSync(file, 'utf8');
    
    // If batch mode is enabled, add to pending batch
    if (this.batchMode) {
      const requestId = Date.now() + Math.floor(Math.random() * 1000);
      const requestFile = path.join(this.tempDir, `request-${requestId}.json`);
      
      // Write request to temp file for debugging
      const request = {
        code: content,
        filePath: file,
        requestId
      };
      fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
      
      this.pendingBatchPrompts.push(request);
      
      // All files will be processed together at the end of the package processing
      // rather than checking batch size here
      
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
    // Limit files in test mode
    if (this.testMode && files.length > this.maxTestFiles) {
      this.logger.log(`Test mode: Limiting processing to ${this.maxTestFiles} files out of ${files.length} total`);
      files = files.slice(0, this.maxTestFiles);
    }

    // Update progress tracking
    this.progress.currentPackage = {
      name: path.basename(packagePath),
      totalFiles: files.length,
      processedFiles: 0
    };

    const packageStats = {
      jsDocBlocksAdded: 0,
      componentsDocumented: 0
    };

    // Process files
    for (const file of files) {
      try {
        this.logFileProgress(file);
        const { newDocsCount, componentInfo } = await this.processFile(file);
        packageStats.jsDocBlocksAdded += newDocsCount;
        if (componentInfo) {
          packageStats.componentsDocumented++;
        }
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Failed to process ${file}: ${err.message}`);
      }
    }

    // Process any remaining files in the batch queue
    if (this.batchMode && this.pendingBatchPrompts.length > 0) {
      await this.processBatch();
    }

    // Generate components.md if we found any components
    if (this.componentDocs.length > 0) {
      await this.generateComponentsDocs(packagePath);
    }

    // Update or create .stokedrc.json
    const configPath = path.join(packagePath, '.stokedrc.json');
    const config: StokedConfig = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : { version: '1.0.0', runs: [] };

    config.runs.push({
      timestamp: new Date().toISOString(),
      jsDocBlocksAdded: packageStats.jsDocBlocksAdded,
      componentsDocumented: packageStats.componentsDocumented,
      testMode: this.testMode
    });

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    this.logger.log(`
Package ${path.basename(packagePath)} processed:
- Added ${packageStats.jsDocBlocksAdded} JSDoc blocks
- Documented ${packageStats.componentsDocumented} components
- Updated ${configPath}
${this.testMode ? '- TEST MODE was enabled (limited file processing)' : ''}
    `);
  }

  /**
   * Gets the current stoked version from package.json
   * @returns Formatted version string suitable for branch names
   */
  private getStokedVersion(): string {
    try {
      // Get the Stoked tool version from package.json in the project root
      // This represents the version of the documentation generator being used
      const packageJsonPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const version = packageJson.version || '0.0.1';
        return version.replace(/\./g, '-');
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
} 