import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { LlmService } from '../services/llm.service.js';
import { ThemeLogger } from '../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

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
  private readonly tempDir: string;
  private componentDocs: ComponentDoc[] = [];
  private includePackages?: string[];
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
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.workspaceRoot = path.join(process.cwd(), '.workspace');
    this.tempDir = path.join(this.workspaceRoot, 'temp');
    this.ensureWorkspaceDirs();
  }

  @Option({
    flags: '-i, --include [packages]',
    description: 'Specific packages to document (comma-separated)'
  })
  parseInclude(val: string): void {
    this.includePackages = val.split(',').map(p => p.trim());
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
      if (!passedParams || passedParams.length === 0) {
        this.logger.error('Repository must be specified in format owner/repo');
        return;
      }

      const [owner, repo] = passedParams[0].split('/');
      if (!owner || !repo) {
        this.logger.error('Repository must be in format owner/repo');
        return;
      }

      const repoPath = `${owner}/${repo}`;
      const workDir = path.join(this.workspaceRoot, repo);

      // Verify GitHub token exists
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        this.logger.error('GITHUB_TOKEN environment variable is required');
        return;
      }

      // Check if repository already exists
      if (fs.existsSync(workDir)) {
        try {
          // Check if it's a valid git repository
          process.chdir(workDir);
          execSync('git rev-parse --git-dir', { stdio: 'ignore' });
          
          // Check if it's the correct repository
          const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
          const expectedUrl = `https://github.com/${repoPath}.git`;
          
          if (!remoteUrl.endsWith(repoPath + '.git')) {
            this.logger.error(`Existing directory contains different repository. Expected ${expectedUrl}, found ${remoteUrl}`);
            return;
          }

          this.logger.log('Found existing repository clone, checking state...');
          
          // Fetch latest changes
          execSync('git fetch origin');
          
          // Check if we're behind origin/main
          const status = execSync('git rev-list HEAD..origin/main --count', { encoding: 'utf-8' }).trim();
          const behindCount = parseInt(status, 10);
          
          if (behindCount > 0) {
            this.logger.log(`Local repository is ${behindCount} commits behind origin/main, updating...`);
            execSync('git checkout main');
            execSync('git pull origin main');
          } else {
            this.logger.log('Local repository is up to date');
          }
          
          // Check or create claude/jsdocs branch
          try {
            execSync('git rev-parse --verify claude/jsdocs', { stdio: 'ignore' });
            this.logger.log('Found existing claude/jsdocs branch, continuing with existing work...');
            execSync('git checkout claude/jsdocs');
            // Check if branch is behind main
            const branchStatus = execSync('git rev-list claude/jsdocs..main --count', { encoding: 'utf-8' }).trim();
            const branchBehindCount = parseInt(branchStatus, 10);
            if (branchBehindCount > 0) {
              this.logger.log(`Branch is ${branchBehindCount} commits behind main, updating...`);
              execSync('git merge main');
            }
          } catch {
            // Branch doesn't exist, create it
            this.logger.log('Creating new claude/jsdocs branch...');
            execSync('git checkout main');
            execSync('git checkout -b claude/jsdocs');
          }
        } catch (error) {
          const execError = error as ExecError;
          this.logger.error(`Invalid git repository in ${workDir}: ${execError.message}`);
          return;
        }
      } else {
        // Clone fresh repository
        this.logger.log(`Cloning ${repoPath}...`);
        try {
          fs.mkdirSync(path.dirname(workDir), { recursive: true });
          execSync(`git clone https://github.com/${repoPath}.git ${workDir}`, {
            stdio: ['ignore', 'pipe', 'pipe']
          });
          process.chdir(workDir);
          execSync('git checkout -b claude/jsdocs');
        } catch (error) {
          const execError = error as ExecError;
          this.logger.error(`Failed to clone repository: ${execError.message}`);
          return;
        }
      }

      // Log include filter if specified
      if (this.includePackages?.length) {
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

      // Process each package
      for (const [packagePath, files] of packageFiles) {
        await this.processPackage(packagePath, files);
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
   - Add a new JSDoc block if there are 8 or more consecutive lines without comments
   - When adding a block due to the 8-line rule, place it at the highest scope point within that section

2. Required Documentation:
   - Interface/Type documentation: purpose, properties, usage
   - Component/Class documentation: functionality, props/methods, state, effects
   - Function documentation: purpose, parameters, return value, side effects
   - Document any complex logic or business rules
   - Include accessibility notes only if critical

3. Style Rules:
   - Keep comments focused and concise
   - Use clear, professional language
   - Avoid redundant or obvious documentation
   - No inline comments between code lines unless absolutely necessary

4. Response Format:
   - Return ONLY the documented code
   - Do not wrap the code in markdown code blocks
   - Do not add any explanatory text
   - Do not use triple backticks

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

  private async processPackage(packagePath: string, files: string[]): Promise<void> {
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
          this.componentDocs.push(componentInfo);
          packageStats.componentsDocumented++;
        }
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Failed to process ${file}: ${err.message}`);
      }
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
      componentsDocumented: packageStats.componentsDocumented
    });

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    this.logger.log(`
Package ${path.basename(packagePath)} processed:
- Added ${packageStats.jsDocBlocksAdded} JSDoc blocks
- Documented ${packageStats.componentsDocumented} components
- Updated ${configPath}
    `);
  }

  private async processFile(file: string): Promise<{ newDocsCount: number; componentInfo?: ComponentDoc }> {
    const content = fs.readFileSync(file, 'utf8');
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
} 