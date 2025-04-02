import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ThemeLogger } from '../logger/theme.logger';

@Injectable()
export class RepoService {
  private readonly workspaceRoot: string;

  constructor(private readonly logger: ThemeLogger) {
    this.workspaceRoot = path.join(process.cwd(), '.workspace');
  }

  async cloneRepo(owner: string, repo: string): Promise<string> {
    const repoPath = `${owner}/${repo}`;
    const workDir = path.join(this.workspaceRoot, repo);

    // Verify GitHub token exists
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    // Verify gh CLI is installed
    try {
      execSync('gh --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('GitHub CLI (gh) is not installed. Please install it first.');
    }

    // Check if repository already exists
    if (fs.existsSync(workDir)) {
      try {
        process.chdir(workDir);
        execSync('git rev-parse --git-dir', { stdio: 'ignore' });
        
        const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
        const expectedUrl = `https://github.com/${repoPath}.git`;
        
        if (!remoteUrl.endsWith(repoPath + '.git')) {
          throw new Error(`Existing directory contains different repository. Expected ${expectedUrl}, found ${remoteUrl}`);
        }

        this.logger.log('Found existing repository clone, pulling latest changes...');
        execSync('git checkout main');
        execSync('git pull origin main');
      } catch (error) {
        const err = error as Error;
        throw new Error(`Invalid git repository in ${workDir}: ${err.message}`);
      }
    } else {
      this.logger.log(`Cloning ${repoPath}...`);
      fs.mkdirSync(path.dirname(workDir), { recursive: true });
      execSync(`git clone https://github.com/${repoPath}.git ${workDir}`, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      process.chdir(workDir);
    }

    return workDir;
  }

  async createBranch(branchName: string): Promise<void> {
    try {
      execSync(`git rev-parse --verify ${branchName}`, { stdio: 'ignore' });
      this.logger.log(`Found existing ${branchName} branch, continuing with existing work...`);
    } catch {
      this.logger.log(`Creating new ${branchName} branch...`);
      execSync('git checkout main');
      execSync('git pull origin main');
      execSync(`git checkout -b ${branchName}`);
    }
  }
} 