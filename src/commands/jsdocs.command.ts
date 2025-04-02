import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { LlmService } from '../services/llm.service.js';
import { ThemeLogger } from '../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';

interface ExecError extends Error {
  message: string;
  code?: number;
  stdout?: string;
  stderr?: string;
}

@Injectable()
@Command({
  name: 'jsdocs',
  description: 'Add JSDoc comments to all JavaScript/TypeScript files in a repository',
  arguments: '<owner/repo>'
})
export class JsDocsCommand extends CommandRunner {
  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
  }

  async run(
    passedParams: string[],
  ): Promise<void> {
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
      const workDir = path.join(process.cwd(), 'tmp', repo);

      // Verify GitHub token exists
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        this.logger.error('GITHUB_TOKEN environment variable is required');
        return;
      }

      // Verify gh CLI is installed
      try {
        execSync('gh --version', { stdio: 'ignore' });
      } catch (error) {
        const execError = error as ExecError;
        this.logger.error('GitHub CLI (gh) is not installed. Please install it first.');
        return;
      }

      // Step 1: Clone the repository
      this.logger.log(`Cloning ${repoPath}...`);
      try {
        fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
        execSync(`git clone https://github.com/${repoPath}.git ${workDir}`);
      } catch (error) {
        const execError = error as ExecError;
        this.logger.error(`Failed to clone repository: ${execError.message}`);
        return;
      }

      // Step 2: Create and checkout new branch
      this.logger.log('Creating branch claude/jsdocs...');
      try {
        process.chdir(workDir);
        execSync('git checkout -b claude/jsdocs');
      } catch (error) {
        const execError = error as ExecError;
        this.logger.error(`Failed to create branch: ${execError.message}`);
        return;
      }

      // Step 3: Find all JS/TS files
      const jsFiles = this.findJsFiles(workDir);
      this.logger.log(`Found ${jsFiles.length} JavaScript/TypeScript files`);

      // Step 4: Process each file
      let processedFiles = 0;
      for (const file of jsFiles) {
        try {
          this.logger.log(`Processing ${path.relative(workDir, file)}...`);
          await this.addJsDocs(file);
          processedFiles++;
        } catch (error) {
          const execError = error as Error;
          this.logger.warn(`Failed to process ${file}: ${execError.message}`);
          continue;
        }
      }

      if (processedFiles === 0) {
        this.logger.error('No files were successfully processed');
        return;
      }

      // Git operations
      try {
        this.logger.log('Committing changes...');
        execSync('git add .');
        execSync('git commit -m "docs: add JSDoc comments to all JS/TS files"');
        execSync('git push origin claude/jsdocs');
      } catch (error) {
        const execError = error as ExecError;
        this.logger.error(`Failed to commit/push changes: ${execError.message}`);
        return;
      }

      // Create PR
      try {
        this.logger.log('Creating pull request...');
        const prBody = 'Added JSDoc comments to all JavaScript and TypeScript files using comprehensive documentation standards.';
        execSync(`gh pr create --title "docs: add JSDoc comments" --body "${prBody}" --base main`);
      } catch (error) {
        const execError = error as ExecError;
        this.logger.error(`Failed to create PR: ${execError.message}`);
        return;
      }

      this.logger.log('Done! Pull request created successfully.');
    } catch (error) {
      const execError = error as ExecError;
      this.logger.error(`Command failed: ${execError.message}`);
    } finally {
      // Clean up tmp directory
      try {
        if (fs.existsSync(path.join(process.cwd(), 'tmp'))) {
          fs.rmSync(path.join(process.cwd(), 'tmp'), { recursive: true, force: true });
        }
      } catch (error) {
        const execError = error as ExecError;
        this.logger.warn(`Failed to clean up temporary files: ${execError.message}`);
      }
    }
  }

  private findJsFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...this.findJsFiles(fullPath));
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async addJsDocs(filePath: string): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Split large files into manageable chunks (8KB)
    const MAX_CHUNK_SIZE = 8000;
    const lines = content.split('\n');
    let currentChunk = '';
    let documentedChunks: string[] = [];
    let chunkStart = 0;

    for (let i = 0; i < lines.length; i++) {
      currentChunk += lines[i] + '\n';
      
      // Process chunk when it reaches max size or end of file
      if (currentChunk.length >= MAX_CHUNK_SIZE || i === lines.length - 1) {
        try {
          const documentedChunk = await this.processCodeChunk(currentChunk, i === lines.length - 1);
          documentedChunks.push(documentedChunk);
        } catch (error: unknown) {
          const execError = error as Error;
          this.logger.warn(`Failed to process chunk in ${filePath}: ${execError.message}`);
          documentedChunks.push(currentChunk); // Keep original on error
        }
        currentChunk = '';
        chunkStart = i + 1;
      }
    }

    // Combine documented chunks and write back to file
    const documentedContent = documentedChunks.join('');
    fs.writeFileSync(filePath, documentedContent);
  }

  private async processCodeChunk(code: string, isLastChunk: boolean): Promise<string> {
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

    // Use temporary file for the request body
    const tempFile = path.join(process.cwd(), 'tmp', `request-${Date.now()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(prompt));

    try {
      const response = execSync(
        `curl -X POST "http://localhost:11434/api/generate" -H "Content-Type: application/json" -d @${tempFile}`,
        { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
      );

      const result = JSON.parse(response);
      
      if (!result.response) {
        throw new Error('No response from LLM');
      }

      // Verify code integrity for the chunk
      if (!this.verifyCodeIntegrity(code, result.response)) {
        throw new Error('Generated documentation may have altered the code');
      }

      return result.response;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  private verifyCodeIntegrity(original: string, documented: string): boolean {
    // Remove all comments and whitespace from both strings
    const cleanOriginal = this.removeCommentsAndWhitespace(original);
    const cleanDocumented = this.removeCommentsAndWhitespace(documented);
    return cleanOriginal === cleanDocumented;
  }

  private removeCommentsAndWhitespace(code: string): string {
    return code
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') // Remove comments
      .replace(/\s+/g, ''); // Remove whitespace
  }
} 