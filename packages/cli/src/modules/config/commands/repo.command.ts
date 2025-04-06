import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { ConfigService } from '../config.service.js';
import { RemoveRepoCommand } from './remove-repo.command.js';
@SubCommand({
  name: 'repo',
  description: 'Manage Git repository priorities',
  subCommands: [RemoveRepoCommand],
})
export class RepoCommand extends CommandRunner {
  constructor(
    private readonly configService: ConfigService,
  ) {
    super();
  }

  @Option({
    flags: '-p, --priority <priority>',
    description: 'Priority level: low, medium, or high',
    choices: ['low', 'medium', 'high'],
  })
  parsePriority(val: string): 'low' | 'medium' | 'high' {
    return val as 'low' | 'medium' | 'high';
  }

  @Option({
    flags: '-t, --top',
    description: 'Show only the top priority repository',
  })
  parseTop(): boolean {
    return true;
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    // If no params, list repos by priority
    if (!passedParams.length) {
      const repos = this.configService.getAllGitRepos();

      if (repos.length === 0) {
        console.log('No repositories configured');
        return;
      }

      // If --top option is specified, only show the highest priority repo
      if (options?.top) {
        // Get priority order: high > medium > low
        const highRepos = repos.filter((r) => r.priority === 'high');
        const mediumRepos = repos.filter((r) => r.priority === 'medium');
        const lowRepos = repos.filter((r) => r.priority === 'low');

        let topRepo;
        if (highRepos.length > 0) {
          topRepo = highRepos[0];
        } else if (mediumRepos.length > 0) {
          topRepo = mediumRepos[0];
        } else if (lowRepos.length > 0) {
          topRepo = lowRepos[0];
        }

        if (topRepo) {
          console.log(
            `Top priority repository: ${topRepo.owner}/${topRepo.repo} (${topRepo.priority})`,
          );
        }
        return;
      }

      // Filter by priority if provided
      if (options?.priority) {
        const filteredRepos = repos.filter(
          (r) => r.priority === options.priority,
        );
        if (filteredRepos.length === 0) {
          console.log(`No repositories with priority: ${options.priority}`);
          return;
        }

        console.log(`Repositories with ${options.priority} priority:`);
        for (const repo of filteredRepos) {
          console.log(`  ${repo.owner}/${repo.repo}`);
        }
        return;
      }

      // Group repos by priority
      const high = repos.filter((r) => r.priority === 'high');
      const medium = repos.filter((r) => r.priority === 'medium');
      const low = repos.filter((r) => r.priority === 'low');

      // Display high priority repos first, then medium, then low
      console.log('Git Repositories:');

      if (high.length) {
        console.log('\nHigh Priority:');
        for (const repo of high) {
          console.log(`  ${repo.owner}/${repo.repo}`);
        }
      }

      if (medium.length) {
        console.log('\nMedium Priority:');
        for (const repo of medium) {
          console.log(`  ${repo.owner}/${repo.repo}`);
        }
      }

      if (low.length) {
        console.log('\nLow Priority:');
        for (const repo of low) {
          console.log(`  ${repo.owner}/${repo.repo}`);
        }
      }

      return;
    }

    // Get the repo information
    const repoFullName = passedParams[0];
    const parts = repoFullName.split('/');

    // Handle owner/repo format silently - skip error for invalid format
    if (parts.length !== 2) {
      return;
    }

    const [owner, repo] = parts;

    // If priority option is not provided, either get the priority or set to medium
    if (!options || !options.priority) {
      const priority = this.configService.getGitRepoPriority(owner, repo);

      if (priority) {
        // If repo exists, show its priority
        console.log(`Priority for ${owner}/${repo}: ${priority}`);
      } else {
        // If repo doesn't exist, add it with medium priority by default
        this.configService.setGitRepoPriority(owner, repo, 'medium');
        console.log(`Added ${owner}/${repo} with medium priority`);
      }
      return;
    }

    // Otherwise, set the specified priority for the repo
    const { priority } = options;
    this.configService.setGitRepoPriority(owner, repo, priority);
    console.log(`Set priority for ${owner}/${repo} to ${priority}`);
  }
}
