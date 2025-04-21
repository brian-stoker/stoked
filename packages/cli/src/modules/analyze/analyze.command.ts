import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as os from 'os';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';

// Type for package classification
type PackageClassification = 
  | 'frontend-web'
  | 'frontend-mobile'
  | 'frontend-lib'
  | 'backend-api'
  | 'backend-lib';

interface AnalysisResult {
  packageVersion: string;
  analyzerVersion: string;
  llmModel: string;
  llmVersion: string;
  classifications: PackageClassification[];
  languages: string[];
  summary: string;
  features: string[];
}

interface FileAnalysis {
  name: string;
  type: string;
  description: string;
  functions?: string[];
  components?: string[];
  classes?: string[];
  interfaces?: string[];
  imports?: string[];
}

@Injectable()
@Command({
  name: 'analyze',
  description: 'Analyze a repository and generate metadata about its structure and features',
  arguments: '<owner/repo>',
})
export class AnalyzeCommand extends CommandRunner {
  private readonly workspaceRoot: string;
  private skipAnalysis: boolean = false;
  private verbose: boolean = false;
  private repoPath: string = '';

  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.workspaceRoot = this.getWorkspaceRoot();
    this.logger.setTheme(THEMES[1]);

  }

  @Option({
    flags: '--no-analysis',
    description: 'Skip analysis when used with docs command',
  })
  parseNoAnalysis(): void {
    this.skipAnalysis = true;
  }

  @Option({
    flags: '--verbose',
    description: 'Show verbose output during analysis',
  })
  parseVerbose(): void {
    this.verbose = true;
  }

  private getWorkspaceRoot(): string {
    // Check if STOKED_WORKSPACE_ROOT environment variable is set
    if (process.env.STOKED_WORKSPACE_ROOT) {
      return process.env.STOKED_WORKSPACE_ROOT;
    }

    // Use the standard location: ~/.stoked/.repos
    const homeDir = os.homedir();
    return path.join(homeDir, '.stoked', '.repos');
  }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    try {
      // Validate input parameter
      if (!passedParams || passedParams.length === 0) {
        this.logger.error('Error analyzing repository: No repository specified');
        return;
      }

      const repoParam = passedParams[0];

      // Check if the parameter is in owner/repo format
      if (!repoParam.includes('/')) {
        this.logger.error('Invalid repository format. Please use the format: owner/repo');
        return;
      }

      this.logger.log(`Analyzing repository: ${repoParam}`);

      // Set up repo path
      this.repoPath = path.join(this.workspaceRoot, repoParam);

      // Check if repository exists
      if (!fs.existsSync(this.repoPath)) {
        this.logger.error(`Repository not found at ${this.repoPath}`);
        return;
      }

      // Find all packages in the repository
      const packages = this.findPackages(this.repoPath);

      // Process each package
      for (const packagePath of packages) {
        await this.analyzePackage(packagePath);
      }

      this.logger.log(`Analysis complete. Generated analysis files for ${packages.length} package(s).`);
    } catch (error) {
      this.logger.error(`Error analyzing repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private findPackages(repoPath: string): string[] {
    // Check if this is a monorepo with multiple packages
    const packagesDir = path.join(repoPath, 'packages');
    if (fs.existsSync(packagesDir) && fs.statSync(packagesDir).isDirectory()) {
      // This is a monorepo with a packages directory
      const packageDirs = fs.readdirSync(packagesDir)
        .map(dir => path.join(packagesDir, dir))
        .filter(dir => fs.statSync(dir).isDirectory());
      
      if (packageDirs.length > 0) {
        return packageDirs;
      }
    }

    // Check if there's a package.json in the root
    if (fs.existsSync(path.join(repoPath, 'package.json'))) {
      // This is a single package repo
      return [repoPath];
    }

    // No packages found
    this.logger.warn('No packages found in the repository.');
    return [];
  }

  private async analyzePackage(packagePath: string): Promise<void> {
    this.logger.log(`Analyzing package: ${path.basename(packagePath)}`);

    try {
      // Get package.json data
      const packageJsonPath = path.join(packagePath, 'package.json');
      let packageVersion = '0.0.0';
      let packageName = path.basename(packagePath);
      let dependencies: Record<string, string> = {};
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        packageVersion = packageJson.version || '0.0.0';
        packageName = packageJson.name || packageName;
        dependencies = { 
          ...packageJson.dependencies || {},
          ...packageJson.devDependencies || {}
        };
      }

      // Detect classifications based on dependencies and file structure
      const classifications = this.detectClassifications(packagePath, dependencies);
      
      // Detect languages used in the package
      const languages = this.detectLanguages(packagePath);

      // Get package summary and features using LLM
      const { summary, features } = await this.generatePackageSummary(packagePath, packageName, dependencies);

      // Create the analysis result
      const analysisResult: AnalysisResult = {
        packageVersion,
        analyzerVersion: this.getAnalyzerVersion(),
        llmModel: this.llmService.getName(),
        llmVersion: this.llmService.getVersion(),
        classifications,
        languages,
        summary,
        features
      };

      // Write the analysis.yml file
      const analysisPath = path.join(packagePath, 'analysis.yml');
      fs.writeFileSync(analysisPath, yaml.dump(analysisResult, { indent: 2 }));
      
      this.logger.log(`Generated analysis.yml for ${packageName}`);

      // Generate detailed file analysis
      await this.generateFileAnalysis(packagePath);

    } catch (error) {
      this.logger.error(`Error analyzing package ${packagePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private detectClassifications(packagePath: string, dependencies: Record<string, string>): PackageClassification[] {
    const classifications: PackageClassification[] = [];
    const files = fs.readdirSync(packagePath);

    // Check for frontend-web indicators
    if (
      dependencies['react'] || 
      dependencies['react-dom'] || 
      dependencies['vue'] || 
      dependencies['angular'] ||
      dependencies['next'] ||
      dependencies['gatsby']
    ) {
      classifications.push('frontend-web');
    }

    // Check for frontend-mobile indicators
    if (
      dependencies['react-native'] || 
      dependencies['expo'] ||
      dependencies['@ionic/react'] ||
      dependencies['@ionic/angular']
    ) {
      classifications.push('frontend-mobile');
    }

    // Check for backend-api indicators
    if (
      dependencies['express'] || 
      dependencies['koa'] || 
      dependencies['fastify'] ||
      dependencies['nest'] ||
      dependencies['nestjs'] ||
      dependencies['@nestjs/core'] ||
      files.some(f => f === 'controllers' || f === 'routes' || f === 'middlewares')
    ) {
      classifications.push('backend-api');
    }

    // Check for frontend-lib indicators
    if (
      (dependencies['react'] || dependencies['vue']) && 
      !classifications.includes('frontend-web') &&
      !classifications.includes('frontend-mobile')
    ) {
      classifications.push('frontend-lib');
    }

    // Check for backend-lib indicators
    if (
      !classifications.includes('backend-api') &&
      (dependencies['mongoose'] || 
       dependencies['sequelize'] || 
       dependencies['typeorm'] ||
       dependencies['prisma'])
    ) {
      classifications.push('backend-lib');
    }

    // If no classifications were detected, make an educated guess
    if (classifications.length === 0) {
      if (files.some(f => f === 'src' || f === 'lib' || f === 'dist')) {
        // Generic library
        if (files.some(f => f.endsWith('.jsx') || f.endsWith('.tsx'))) {
          classifications.push('frontend-lib');
        } else {
          classifications.push('backend-lib');
        }
      }
    }

    return classifications;
  }

  private detectLanguages(packagePath: string): string[] {
    const languages = new Set<string>();
    
    // Function to scan directory for file extensions
    const scanDir = (dir: string) => {
      try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          
          if (fs.statSync(itemPath).isDirectory()) {
            // Skip node_modules and hidden directories
            if (item !== 'node_modules' && !item.startsWith('.')) {
              scanDir(itemPath);
            }
          } else {
            // Detect language based on file extension
            const ext = path.extname(item).toLowerCase();
            switch (ext) {
              case '.js':
                languages.add('JavaScript');
                break;
              case '.jsx':
                languages.add('JavaScript');
                languages.add('JSX');
                break;
              case '.ts':
                languages.add('TypeScript');
                break;
              case '.tsx':
                languages.add('TypeScript');
                languages.add('JSX');
                break;
              case '.py':
                languages.add('Python');
                break;
              case '.java':
                languages.add('Java');
                break;
              case '.go':
                languages.add('Go');
                break;
              case '.rb':
                languages.add('Ruby');
                break;
              case '.php':
                languages.add('PHP');
                break;
              case '.cs':
                languages.add('C#');
                break;
              case '.cpp':
              case '.cc':
              case '.cxx':
                languages.add('C++');
                break;
              case '.c':
                languages.add('C');
                break;
              case '.swift':
                languages.add('Swift');
                break;
              case '.kt':
              case '.kts':
                languages.add('Kotlin');
                break;
              case '.rs':
                languages.add('Rust');
                break;
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
        if (this.verbose) {
          this.logger.warn(`Couldn't scan directory ${dir}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
    
    // Start scanning from package root
    scanDir(packagePath);
    
    return Array.from(languages);
  }

  private async generatePackageSummary(packagePath: string, packageName: string, dependencies: Record<string, string>): Promise<{ summary: string; features: string[] }> {
    try {
      // Generate a prompt for the LLM
      const packageInfo = {
        name: packageName,
        dependencies: Object.keys(dependencies).join(', '),
        structure: this.getPackageStructure(packagePath)
      };
      
      const prompt = `
Analyze this package and provide a summary and list of features:

Package: ${packageInfo.name}
Dependencies: ${packageInfo.dependencies}
Structure: ${packageInfo.structure}

Provide a concise summary of the package's purpose (3-5 sentences) and a list of likely key features.
Format your response exactly like this:

Summary: <your summary here>

Features:
- <feature 1>
- <feature 2>
- <feature 3>
...
      `;

      // Get response from LLM
      const response = await this.llmService.query(prompt);
      
      // Parse the response
      const summaryMatch = response.match(/Summary: (.*?)(?=\n\n|$)/s);
      const featuresMatch = response.match(/Features:\s*((?:- .*\n?)+)/s);
      
      const summary = summaryMatch ? summaryMatch[1].trim() : 'No summary available';
      const featuresText = featuresMatch ? featuresMatch[1].trim() : '';
      const features = featuresText
        .split('\n')
        .map(line => line.replace(/^- /, '').trim())
        .filter(Boolean);
      
      return { summary, features };
    } catch (error) {
      this.logger.warn(`Error generating package summary: ${error instanceof Error ? error.message : String(error)}`);
      return { 
        summary: `A ${packageName} package.`, 
        features: ['Features could not be determined']
      };
    }
  }

  private getPackageStructure(packagePath: string): string {
    // Get a simplified directory structure for the LLM prompt
    try {
      // List top-level directories
      const dirs = fs.readdirSync(packagePath)
        .filter(item => {
          const itemPath = path.join(packagePath, item);
          return fs.statSync(itemPath).isDirectory() && 
                 item !== 'node_modules' && 
                 !item.startsWith('.');
        });
      
      // List some key files
      const files = fs.readdirSync(packagePath)
        .filter(item => {
          const itemPath = path.join(packagePath, item);
          return !fs.statSync(itemPath).isDirectory() && 
                 (item === 'package.json' || 
                  item === 'README.md' || 
                  item.endsWith('.config.js') ||
                  item.endsWith('.config.ts'));
        });
      
      return `
Directories: ${dirs.join(', ')}
Key files: ${files.join(', ')}
      `.trim();
    } catch (error) {
      return 'Could not determine package structure';
    }
  }

  private async generateFileAnalysis(packagePath: string): Promise<void> {
    // Create the analysis directory at the package root
    const analysisDir = path.join(packagePath, 'analysis');
    if (!fs.existsSync(analysisDir)) {
      fs.mkdirSync(analysisDir, { recursive: true });
    }

    // Process all source files
    await this.processDirectory(packagePath, analysisDir, packagePath);
  }

  private async processDirectory(sourcePath: string, analysisBasePath: string, packageRoot: string): Promise<void> {
    try {
      const items = fs.readdirSync(sourcePath);
      
      for (const item of items) {
        const itemPath = path.join(sourcePath, item);
        const relativePath = path.relative(packageRoot, itemPath);
        
        // Skip node_modules and hidden files/directories
        if (item === 'node_modules' || item.startsWith('.') || item === 'analysis') {
          continue;
        }
        
        if (fs.statSync(itemPath).isDirectory()) {
          // Create corresponding directory in analysis path
          const targetDir = path.join(analysisBasePath, relativePath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          
          // Process the subdirectory
          await this.processDirectory(itemPath, analysisBasePath, packageRoot);
        } else {
          // Check if it's a file we should analyze
          if (this.shouldAnalyzeFile(item)) {
            await this.analyzeFile(itemPath, analysisBasePath, relativePath, packageRoot);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Error processing directory ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private shouldAnalyzeFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rb', '.php', '.cs', '.cpp', '.c', '.swift', '.kt', '.rs'].includes(ext);
  }

  private async analyzeFile(filePath: string, analysisBasePath: string, relativePath: string, packageRoot: string): Promise<void> {
    try {
      // Read file content
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Skip empty files
      if (!content.trim()) {
        return;
      }
      
      if (this.verbose) {
        this.logger.log(`Analyzing file: ${relativePath}`);
      }

      // Create the analysis for this file
      const fileAnalysis = await this.getFileAnalysis(filePath, content, relativePath);
      
      // Write the analysis to the corresponding YAML file
      const analysisFilePath = path.join(analysisBasePath, `${relativePath}.yml`);
      
      // Ensure the directory exists
      const analysisFileDir = path.dirname(analysisFilePath);
      if (!fs.existsSync(analysisFileDir)) {
        fs.mkdirSync(analysisFileDir, { recursive: true });
      }
      
      // Write the file analysis
      fs.writeFileSync(analysisFilePath, yaml.dump(fileAnalysis, { indent: 2 }));
      
    } catch (error) {
      this.logger.warn(`Error analyzing file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getFileAnalysis(filePath: string, content: string, relativePath: string): Promise<FileAnalysis> {
    try {
      const prompt = `
Analyze this code file and provide information about its structure and purpose:

File: ${path.basename(filePath)}
Path: ${relativePath}

\`\`\`
${content.slice(0, 5000)} ${content.length > 5000 ? '... (truncated)' : ''}
\`\`\`

Respond with ONLY the following YAML structure (no explanations or other text):

name: <filename>
type: <file type: component, utility, class, controller, etc>
description: <brief description of what this file does>
functions: 
  - <function name 1>
  - <function name 2>
components:
  - <component name 1>
  - <component name 2>
classes:
  - <class name 1>
  - <class name 2>
interfaces:
  - <interface name 1>
  - <interface name 2>
imports:
  - <important import 1>
  - <important import 2>
      `;

      // Get response from LLM
      const response = await this.llmService.query(prompt);

      // Parse the YAML response
      try {
        return yaml.load(response) as FileAnalysis;
      } catch (e) {
        // If YAML parsing fails, create a basic analysis
        return {
          name: path.basename(filePath),
          type: this.guessFileType(filePath, content),
          description: 'Code file (auto-detected)'
        };
      }
    } catch (error) {
      // Fallback to a basic analysis if LLM fails
      return {
        name: path.basename(filePath),
        type: this.guessFileType(filePath, content),
        description: 'Code file (auto-detected)'
      };
    }
  }

  private guessFileType(filePath: string, content: string): string {
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    
    if (ext === '.jsx' || ext === '.tsx') {
      return 'component';
    }
    
    if (filename.includes('controller')) {
      return 'controller';
    }
    
    if (filename.includes('service')) {
      return 'service';
    }
    
    if (filename.includes('model')) {
      return 'model';
    }
    
    if (filename.includes('util') || filename.includes('helper')) {
      return 'utility';
    }
    
    if (content.includes('class ') && content.includes('extends ')) {
      return 'class';
    }
    
    if (content.includes('function ') || content.includes('=>')) {
      return 'functions';
    }
    
    return 'code';
  }

  private getAnalyzerVersion(): string {
    try {
      // Get the package.json for the CLI
      const packageJsonPath = path.resolve(__dirname, '../../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return packageJson.version || '0.0.0';
    } catch (error) {
      return '0.0.0';
    }
  }
} 