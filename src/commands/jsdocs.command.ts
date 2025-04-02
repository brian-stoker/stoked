import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { ThemeLogger } from '../logger/theme.logger.js';
import { LlmService } from '../services/llm.service.js';
import { RepoService } from '../services/repo.service.js';

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
  lastRun: string;
  jsDocBlocksAdded: number;
  componentsDocumented: number;
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
  private gitIgnore: ReturnType<typeof ignore> | null = null;

  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
    private readonly repoService: RepoService,
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

  private shouldProcessPackage(packagePath: string): boolean {
    if (!this.includePackages || this.includePackages.length === 0) {
      return true;
    }

    const packageJsonPath = path.join(packagePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return this.includePackages.some(includeName => 
          pkgJson.name === includeName || 
          packagePath.includes(includeName.replace('@', '').replace('/', '-'))
        );
      } catch (error) {
        this.logger.warn(`Failed to parse package.json in ${packagePath}`);
      }
    }

    // If no package.json, check path
    return this.includePackages.some(includeName => 
      packagePath.includes(includeName.replace('@', '').replace('/', '-'))
    );
  }

  async run(passedParams: string[]): Promise<void> {
    try {
      await this.ensureWorkspaceDirs();
      await this.cleanWorkspace();

      const [owner, repo] = passedParams;
      if (!owner || !repo) {
        throw new Error('Please provide owner and repo names');
      }

      if (this.includePackages?.length) {
        this.logger.log(`Filtering for packages: ${this.includePackages.join(', ')}`);
      }

      this.logger.log(`Cloning ${owner}/${repo}...`);
      const repoPath = await this.repoService.cloneRepo(owner, repo);
      
      this.loadGitIgnore(repoPath);

      // Create new branch
      await this.repoService.createBranch('claude/jsdocs');

      // Find all JavaScript/TypeScript files
      const allFiles = this.findJsFiles(repoPath);
      this.logger.log(`Found ${allFiles.length} JavaScript/TypeScript files to process`);

      // Group files by package
      const packageFiles = new Map<string, string[]>();
      
      for (const file of allFiles) {
        const packageRoot = await this.findPackageRoot(file);
        if (packageRoot && this.shouldProcessPackage(packageRoot)) {
          if (!packageFiles.has(packageRoot)) {
            packageFiles.set(packageRoot, []);
          }
          packageFiles.get(packageRoot)!.push(file);
        }
      }

      // Process each package
      for (const [packagePath, files] of packageFiles.entries()) {
        this.logger.log(`\nProcessing package at ${packagePath}...`);
        const stats = await this.processPackage(packagePath, files);
        
        if (stats.success) {
          await this.updateStokedConfig(packagePath, stats);
        } else {
          this.logger.warn(`Skipping .stokedrc.json update for ${packagePath} due to processing errors`);
        }
      }

      this.logger.log('\nProcessing complete!');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to process repository: ${err.message}`);
      throw error;
    }
  }

  private loadGitIgnore(repoPath: string): void {
    const gitignorePath = path.join(repoPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        this.gitIgnore = ignore().add(gitignoreContent);
        this.logger.log('Loaded .gitignore rules');
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Failed to load .gitignore: ${err.message}`);
        this.gitIgnore = null;
      }
    } else {
      this.logger.debug('No .gitignore file found');
      this.gitIgnore = null;
    }
  }

  private isIgnored(filePath: string, baseDir: string): boolean {
    if (!this.gitIgnore) {
      return false;
    }

    // Convert absolute path to relative path from repo root
    const relativePath = path.relative(baseDir, filePath);
    // Use forward slashes for consistency (important for ignore package)
    const normalizedPath = relativePath.split(path.sep).join('/');
    
    return this.gitIgnore.ignores(normalizedPath);
  }

  private findJsFiles(workDir: string): string[] {
    const jsFiles: string[] = [];
    
    const processDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Check if path is ignored by .gitignore
        if (this.isIgnored(fullPath, workDir)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Skip common ignored directories
          if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
            continue;
          }
          processDirectory(fullPath);
        } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
          // Skip test files
          if (!/\.(test|spec|stories)\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            jsFiles.push(fullPath);
          }
        }
      }
    };

    processDirectory(workDir);
    return jsFiles;
  }

  private async addJsDocs(filePath: string): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Split large files into manageable chunks (8KB)
    const MAX_CHUNK_SIZE = 8000;
    const lines = content.split('\n');
    let currentChunk = '';
    let documentedChunks: string[] = [];
    let chunkStart = 0;
    let successfulChunks = 0;
    let totalChunks = 0;

    for (let i = 0; i < lines.length; i++) {
      currentChunk += lines[i] + '\n';
      
      // Process chunk when it reaches max size or end of file
      if (currentChunk.length >= MAX_CHUNK_SIZE || i === lines.length - 1) {
        totalChunks++;
        try {
          const { documentedCode, newDocsCount } = await this.processCodeChunk(currentChunk, filePath, i === lines.length - 1);
          if (newDocsCount > 0) {
            const componentDoc = this.extractComponentInfo(documentedCode, filePath);
            if (componentDoc) {
              this.componentDocs.push(componentDoc);
            }
          }
          documentedChunks.push(documentedCode);
          successfulChunks++;
        } catch (error: unknown) {
          const execError = error as Error;
          this.logger.warn(`Failed to process chunk in ${filePath}: ${execError.message}`);
          documentedChunks.push(currentChunk); // Keep original on error
          
          // If we're consistently failing, abort the file
          if (totalChunks >= 3 && successfulChunks === 0) {
            throw new Error('Multiple chunks failed processing - aborting file');
          }
        }
        currentChunk = '';
        chunkStart = i + 1;
      }
    }

    // Only write back if we had some successful chunks
    if (successfulChunks === 0) {
      throw new Error('No chunks were successfully processed');
    }

    // Calculate success rate
    const successRate = successfulChunks / totalChunks;
    if (successRate < 0.5) {
      throw new Error(`Low success rate (${Math.round(successRate * 100)}%) - skipping file`);
    }

    // Combine documented chunks and write back to file
    const documentedContent = documentedChunks.join('');
    fs.writeFileSync(filePath, documentedContent);
  }

  private async processCodeChunk(code: string, filePath: string, isLastChunk: boolean): Promise<{ documentedCode: string; newDocsCount: number }> {
    const prompt = {
      model: "llama3.2:latest",
      prompt: `Add JSDoc comments to this TypeScript/JavaScript code. Follow these specific rules:

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

4. Output:
   - Return only the code with the added JSDoc blocks
   - No additional text or explanations

${isLastChunk ? 'This is the final chunk of the file.' : 'This is a partial chunk of a larger file.'}
Code to document:
${code}`
    };

    try {
      let documentedCode = '';
      
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prompt)
      });

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              documentedCode += parsed.response;
              if (parsed.response.includes('/**')) {
                this.logger.debug('Adding JSDoc block...');
              }
            }
          } catch (e) {
            this.logger.debug(`Skipping invalid JSON line: ${line.slice(0, 50)}...`);
          }
        }
      }

      if (!documentedCode) {
        throw new Error('No valid response from LLM');
      }

      const originalJsDocMatches = String(code).match(/\/\*\*[\s\S]*?\*\//g);
      const newJsDocMatches = String(documentedCode).match(/\/\*\*[\s\S]*?\*\//g);
      const originalCount = originalJsDocMatches ? originalJsDocMatches.length : 0;
      const newCount = newJsDocMatches ? newJsDocMatches.length : 0;

      return {
        documentedCode,
        newDocsCount: newCount - originalCount
      };
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to process code: ${err.message}`);
    }
  }

  private extractComponentInfo(code: string, filePath: string): ComponentDoc | undefined {
    // Look for React component definitions with JSDoc
    const componentMatch = code.match(/\/\*\*\s*([\s\S]*?)\*\/\s*(export\s+(?:default\s+)?(?:function|const|class)\s+(\w+))/);
    
    if (!componentMatch || !componentMatch[1] || !componentMatch[3]) {
      return undefined;
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

  private async processPackage(packagePath: string, files: string[]): Promise<{
    jsDocBlocksAdded: number;
    componentsDocumented: number;
    success: boolean;
  }> {
    const packageStats = {
      jsDocBlocksAdded: 0,
      componentsDocumented: 0,
      success: true
    };

    try {
      const totalFiles = files.length;
      let processedFiles = 0;

      // Process files
      for (const file of files) {
        processedFiles++;
        const relativePath = path.relative(packagePath, file);
        this.logger.log(`[${processedFiles}/${totalFiles}] Processing ${relativePath}...`);

        try {
          const { newDocsCount, componentInfo } = await this.processFile(file);
          if (newDocsCount > 0) {
            this.logger.log(`  Added ${newDocsCount} JSDoc blocks`);
          }
          if (componentInfo) {
            this.componentDocs.push(componentInfo);
            packageStats.componentsDocumented++;
            this.logger.log(`  Documented component: ${componentInfo.name}`);
          }
          packageStats.jsDocBlocksAdded += newDocsCount;
        } catch (error) {
          const err = error as Error;
          this.logger.warn(`Failed to process ${relativePath}: ${err.message}`);
          packageStats.success = false;
        }
      }

      // Generate components.md if we found any components
      if (this.componentDocs.length > 0) {
        await this.generateComponentsDocs(packagePath);
      }

      const pkgName = path.basename(packagePath);
      this.logger.log(`\nPackage ${pkgName} processed:
- Processed ${processedFiles}/${totalFiles} files
- Added ${packageStats.jsDocBlocksAdded} JSDoc blocks
- Documented ${packageStats.componentsDocumented} components
      `);

      return packageStats;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to process package ${packagePath}: ${err.message}`);
      return { ...packageStats, success: false };
    }
  }

  private async updateStokedConfig(packagePath: string, stats: { 
    jsDocBlocksAdded: number; 
    componentsDocumented: number; 
  }): Promise<void> {
    const configPath = path.join(packagePath, '.stokedrc.json');
    const config: StokedConfig = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : { version: '1.0.0', lastRun: new Date().toISOString(), jsDocBlocksAdded: 0, componentsDocumented: 0 };

    config.lastRun = new Date().toISOString();
    config.jsDocBlocksAdded += stats.jsDocBlocksAdded;
    config.componentsDocumented += stats.componentsDocumented;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    this.logger.log(`Updated ${configPath}`);
  }

  private async processFile(file: string): Promise<{ newDocsCount: number; componentInfo?: ComponentDoc }> {
    const content = fs.readFileSync(file, 'utf8');
    const { documentedCode, newDocsCount } = await this.processCodeChunk(content, file, true);
    
    // Extract component info if it's a component file
    let componentInfo: ComponentDoc | undefined;
    if (file.match(/\.(tsx|jsx)$/)) {
      componentInfo = this.extractComponentInfo(documentedCode, file);
    }

    // Write back the documented code
    fs.writeFileSync(file, documentedCode);

    return { newDocsCount, componentInfo };
  }

  private findPackageRoot(filePath: string): string {
    let current = path.dirname(filePath);
    while (current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, 'package.json'))) {
        return current;
      }
      current = path.dirname(current);
    }
    return path.dirname(filePath);
  }
} 