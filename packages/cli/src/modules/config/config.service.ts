import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as os from 'os';
import { ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import type { Repo } from '../repo/repo.service.js';

/**
 * Represents the priority configuration for a Git repository
 * @interface GitRepoPriority
 */
export interface GitRepoPriority {
  /** The owner/organization of the repository */
  owner: string;
  /** The name of the repository */
  repo: string;
  /** The priority level assigned to the repository */
  priority: 'low' | 'medium' | 'high';
}

/**
 * Represents the priority configuration for a GitHub issue
 * @interface IssuePriority
 */
export interface IssuePriority {
  /** The owner/organization of the repository containing the issue */
  owner: string;
  /** The name of the repository containing the issue */
  repo: string;
  /** The issue number */
  issueNumber: number;
  /** The priority level assigned to the issue */
  priority: 'low' | 'medium' | 'high';
}

/**
 * Represents the complete configuration data structure
 * @interface ConfigData
 */
export interface ConfigData {
  /** Map of repository priorities organized by owner and repo */
  gitRepos: {
    [owner: string]: {
      [repo: string]: {
        priority: 'low' | 'medium' | 'high';
      };
    };
  };
  /** Array of issue priorities */
  issues: IssuePriority[];
  /** The active repository */
  activeRepo?: Repo;
  /** The active repository directory */
  clonedRepos?: Repo[];
  workspaceRoot: string;
}

/**
 * Service responsible for managing application configuration
 *
 * This service handles:
 * - Loading and saving configuration from/to YAML files
 * - Managing Git repository priorities
 * - Managing GitHub issue priorities
 * - Providing default values for unconfigured items
 *
 * @class ConfigService
 * @implements {Injectable}
 */
@Injectable()
export class ConfigService {
  /** Directory where configuration files are stored */
  private readonly configDir: string;
  /** Full path to the configuration file */
  private readonly configPath: string;
  /** In-memory cache of the configuration */
  private config: ConfigData = { 
    gitRepos: {},
    issues: [], 
    activeRepo: undefined,
    workspaceRoot: this.getWorkspaceRoot(),
  };
  /** Names of the configuration file (try json first for tests) */
  private readonly CONFIG_FILES = ['config.json', 'config.yaml'];
  /** Default priority for repositories */
  private readonly DEFAULT_PRIORITY: GitRepoPriority['priority'] = 'medium';
  /** Default priority for issues */
  private readonly DEFAULT_ISSUE_PRIORITY: IssuePriority['priority'] = 'medium';
  public tempDir: string;

  /** Logger instance */
  /**
   * Creates an instance of ConfigService
   * Initializes the configuration directory and loads existing configuration
   */
  constructor(@Inject(ThemeLogger) private readonly logger: ThemeLogger) {
    this.logger.setTheme(THEMES[2]);
    // Allow overriding config directory via environment variable for testing
    const configBaseDir = process.env.STOKED_CONFIG_DIR || path.join(os.homedir(), '.stoked');
    this.configDir = configBaseDir; // Use the determined base directory
    // Find the first existing config file (.json or .yaml)
    this.configPath = this.findExistingConfigFile();
    this.ensureConfigExists();
    this.loadConfig();
    this.tempDir = path.join(this.workspaceRoot, 'temp');
    this.ensureWorkspaceDirs();
  }

  set activeRepo(repo: {owner: string, repo: string}) {
    this.config.activeRepo = repo;
    this
    this.writeConfig(this.config);
  }

  get activeRepo(): { owner: string; repo: string } | undefined {
    return this.config.activeRepo;
  }
  
  get activeRepoDir(): string | null {
    const activeRepo = this.config.activeRepo;
    if (!activeRepo) {
      return null;
    }
    return path.join(this.getWorkspaceRoot(), activeRepo.owner, activeRepo.repo);
  }

  get workspaceRoot(): string {
    if (!this.config.workspaceRoot) {
      this.config.workspaceRoot = this.getWorkspaceRoot();
    }
    return this.config.workspaceRoot;
  }

  set workspaceRoot(dir: string) {
    this.config.workspaceRoot = dir;
    this.writeConfig(this.config);
  }


  /**
   * Gets the workspace root directory path
   * Checks environment variable STOKED_WORKSPACE_ROOT first,
   * falls back to ~/.stoked/.repos
   */
  private getWorkspaceRoot(): string {
    // Check if STOKED_WORKSPACE_ROOT environment variable is set
    if (process.env.STOKED_WORKSPACE_ROOT) {
      return process.env.STOKED_WORKSPACE_ROOT;
    }

    // Use the new standard location: ~/.stoked/.repos
    const homeDir = os.homedir();
    return path.join(homeDir, '.stoked', '.repos');
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

  public cleanWorkspace() {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  /**
   * Finds the first existing config file (json or yaml) in the config directory.
   * Returns the path or a default path if none exist.
   * @private
   */
  private findExistingConfigFile(): string {
    for (const fileName of this.CONFIG_FILES) {
      const potentialPath = path.join(this.configDir, fileName);
      if (fs.existsSync(potentialPath)) {
        this.logger.debug(`Using config file: ${potentialPath}`);
        return potentialPath;
      }
    }
    // If neither exists, default to using the first option for creation
    const defaultPath = path.join(this.configDir, this.CONFIG_FILES[0]);
    this.logger.log(`No existing config file found. Defaulting to: ${defaultPath}`);
    return defaultPath;
  }

  /**
   * Ensures the configuration directory and file exist
   * Creates them with default values if they don't exist
   * @private
   */
  private ensureConfigExists(): void {
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Create config file with default values if it doesn't exist
    if (!fs.existsSync(this.configPath)) {
      const defaultConfig: ConfigData = {
        gitRepos: {},
        issues: [],
        workspaceRoot: this.getWorkspaceRoot(),
        activeRepo: undefined,
        clonedRepos: [],
      };
      this.writeConfig(defaultConfig);
    }
  }

  private getDefaultConfig(): ConfigData {
    return {
      gitRepos: {},
      issues: [],
      workspaceRoot: this.getWorkspaceRoot(),
      activeRepo: undefined,
      clonedRepos: [],
    };
  }
  
  /**
   * Loads configuration from the YAML file
   * Falls back to default configuration if loading fails
   * @private
   */
  private loadConfig(): void {
    if (!this.configPath || !fs.existsSync(this.configPath)) {
      this.logger.warn(`Config file not found at ${this.configPath}, using default empty config.`);
      this.config = this.getDefaultConfig();
      return;
    }

    try {
      const fileContents = fs.readFileSync(this.configPath, 'utf8');
      // Determine parser based on file extension
      if (this.configPath.endsWith('.json')) {
         this.config = JSON.parse(fileContents);
      } else if (this.configPath.endsWith('.yaml')) {
         this.config = yaml.load(fileContents) as ConfigData;
      } else {
        this.logger.error(`Unsupported config file extension: ${this.configPath}`);
        this.config = this.getDefaultConfig();
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Error loading config file: ${error.message}`);
      // Initialize with default config if loading fails
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Writes the current configuration to the YAML file
   * @param {ConfigData} config - The configuration to write
   * @private
   */
  private writeConfig(config: ConfigData): void {
    if (!this.configPath) {
       this.logger.error('Cannot write config: config path is not set.');
       return;
    }
    try {
      let configStr = '';
      // Determine serializer based on file extension
      if (this.configPath.endsWith('.json')) {
         configStr = JSON.stringify(config, null, 2);
      } else if (this.configPath.endsWith('.yaml')) {
         configStr = yaml.dump(config, { indent: 2 });
      } else {
         this.logger.error(`Unsupported config file extension for writing: ${this.configPath}`);
         return;
      }
      fs.writeFileSync(this.configPath, configStr, 'utf8');
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Error writing config file: ${error.message}`);
    }
  }

  /**
   * Returns the current configuration
   * @returns {ConfigData} The current configuration
   */
  getConfig(): ConfigData {
    return this.config;
  }

  /**
   * Sets the priority for a Git repository
   * @param {string} owner - Repository owner/organization
   * @param {string} repo - Repository name
   * @param {'low' | 'medium' | 'high'} priority - Priority level
   * @example
   * configService.setGitRepoPriority('owner', 'repo', 'high');
   */
  setGitRepoPriority(
    owner: string,
    repo: string,
    priority: 'low' | 'medium' | 'high',
  ): void {
    if (!this.config.gitRepos[owner]) {
      this.config.gitRepos[owner] = {};
    }

    this.config.gitRepos[owner][repo] = { priority };
    this.writeConfig(this.config);
  }

  /**
   * Gets the priority for a Git repository
   * @param {string} owner - Repository owner/organization
   * @param {string} repo - Repository name
   * @returns {'low' | 'medium' | 'high' | undefined} The priority level or undefined if not set
   * @example
   * const priority = configService.getGitRepoPriority('owner', 'repo');
   */
  getGitRepoPriority(
    owner: string,
    repo: string,
  ): 'low' | 'medium' | 'high' | undefined {
    if (this.config.gitRepos[owner]?.[repo]) {
      return this.config.gitRepos[owner][repo].priority;
    }
    return undefined;
  }

  /**
   * Removes a Git repository from the configuration
   * @param {string} owner - Repository owner/organization
   * @param {string} repo - Repository name
   * @example
   * configService.removeGitRepo('owner', 'repo');
   */
  removeGitRepo(owner: string, repo: string): void {
    this.logger.log(`Attempting to remove repo: owner=${owner}, repo=${repo}`);
    this.logger.debug(`Current config:`, JSON.stringify(this.config, null, 2));

    if (this.config.gitRepos[owner]?.[repo]) {
      this.logger.log(`Found repo ${owner}/${repo}, removing it`);
      delete this.config.gitRepos[owner][repo];

      // Remove owner if no repos left
      if (Object.keys(this.config.gitRepos[owner]).length === 0) {
        this.logger.log(`No more repos for owner ${owner}, removing owner`);
        delete this.config.gitRepos[owner];
      }

      this.writeConfig(this.config);
      this.logger.debug(`Updated config:`, JSON.stringify(this.config, null, 2));
    } else {
      this.logger.log(`Repo ${owner}/${repo} not found in config`);
    }
  }

  /**
   * Gets all Git repositories with their priorities
   * @returns {GitRepoPriority[]} Array of repositories with their priorities
   * @example
   * const repos = configService.getAllGitRepos();
   */
  getAllGitRepos(): GitRepoPriority[] {
    const repos: GitRepoPriority[] = [];

    for (const owner in this.config.gitRepos) {
      for (const repo in this.config.gitRepos[owner]) {
        repos.push({
          owner,
          repo,
          priority: this.config.gitRepos[owner][repo].priority,
        });
      }
    }

    return repos;
  }

  /**
   * Gets Git repositories filtered by priority level
   * @param {'low' | 'medium' | 'high'} priority - Priority level to filter by
   * @returns {GitRepoPriority[]} Array of repositories with the specified priority
   * @example
   * const highPriorityRepos = configService.getGitReposByPriority('high');
   */
  getGitReposByPriority(
    priority: 'low' | 'medium' | 'high',
  ): GitRepoPriority[] {
    return this.getAllGitRepos().filter((repo) => repo.priority === priority);
  }

  /**
   * Gets the priority for a GitHub issue
   * @param {string} owner - Repository owner/organization
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @returns {'low' | 'medium' | 'high'} The priority level (defaults to 'medium' if not set)
   * @example
   * const priority = configService.getIssuePriority('owner', 'repo', 123);
   */
  getIssuePriority(
    owner: string,
    repo: string,
    issueNumber: number,
  ): IssuePriority['priority'] {
    const config = this.getConfig();
    const issueConfig = config.issues.find(
      (i) =>
        i.owner === owner && i.repo === repo && i.issueNumber === issueNumber,
    );
    return issueConfig?.priority || this.DEFAULT_ISSUE_PRIORITY;
  }

  /**
   * Sets the priority for a GitHub issue
   * @param {string} owner - Repository owner/organization
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @param {'low' | 'medium' | 'high'} priority - Priority level
   * @example
   * configService.setIssuePriority('owner', 'repo', 123, 'high');
   */
  setIssuePriority(
    owner: string,
    repo: string,
    issueNumber: number,
    priority: IssuePriority['priority'],
  ): void {
    const config = this.getConfig();
    const existingIndex = config.issues.findIndex(
      (i) =>
        i.owner === owner && i.repo === repo && i.issueNumber === issueNumber,
    );

    if (existingIndex >= 0) {
      config.issues[existingIndex].priority = priority;
    } else {
      config.issues.push({ owner, repo, issueNumber, priority });
    }

    this.writeConfig(config);
  }

  /**
   * Removes a GitHub issue from the configuration
   * @param {string} owner - Repository owner/organization
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @example
   * configService.removeIssue('owner', 'repo', 123);
   */
  removeIssue(owner: string, repo: string, issueNumber: number): void {
    const config = this.getConfig();
    config.issues = config.issues.filter(
      (i) =>
        !(
          i.owner === owner &&
          i.repo === repo &&
          i.issueNumber === issueNumber
        ),
    );
    this.writeConfig(config);
  }

  /**
   * Gets all Git repositories, optionally filtered by priority
   * @param {'low' | 'medium' | 'high'} [priority] - Optional priority level to filter by
   * @returns {GitRepoPriority[]} Array of repositories with their priorities
   * @example
   * const allRepos = configService.getPrioritizedRepos();
   * const highPriorityRepos = configService.getPrioritizedRepos('high');
   */
  getPrioritizedRepos(
    priority?: GitRepoPriority['priority'],
  ): GitRepoPriority[] {
    const config = this.getConfig();
    const repos: GitRepoPriority[] = [];

    for (const owner in config.gitRepos) {
      for (const repo in config.gitRepos[owner]) {
        if (!priority || config.gitRepos[owner][repo].priority === priority) {
          repos.push({
            owner,
            repo,
            priority: config.gitRepos[owner][repo].priority,
          });
        }
      }
    }

    return repos;
  }

  /**
   * Gets all GitHub issues, optionally filtered by priority
   * @param {'low' | 'medium' | 'high'} [priority] - Optional priority level to filter by
   * @returns {IssuePriority[]} Array of issues with their priorities
   * @example
   * const allIssues = configService.getPrioritizedIssues();
   * const highPriorityIssues = configService.getPrioritizedIssues('high');
   */
  getPrioritizedIssues(priority?: IssuePriority['priority']): IssuePriority[] {
    const config = this.getConfig();
    return priority
      ? config.issues.filter((issue) => issue.priority === priority)
      : config.issues;
  }

  /**
   * Gets the current stoked version from package.json
   * @returns Formatted version string suitable for branch names
   */
  public getStokedVersion(): string {
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
}
