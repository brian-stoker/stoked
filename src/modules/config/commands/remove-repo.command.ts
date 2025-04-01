import { SubCommand, CommandRunner } from 'nest-commander';
import { ConfigService } from '../config.service.js';
import { THEMES, ThemeLogger } from '../../../logger/theme.logger.js';

@SubCommand({
  name: 'remove',
  description: 'Remove git repository from config',
})
export class RemoveRepoCommand extends CommandRunner {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEMES['Cyberpunk Glow']);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    console.log('RemoveRepoCommand run method called');
    console.log('Params:', passedParams);
    console.log('Options:', options);

    if (!passedParams.length) {
      console.error('Please provide a repository in the format owner/repo');
      return;
    }

    const repoFullName = passedParams[0];
    console.log('Repository full name:', repoFullName);

    const parts = repoFullName.split('/');
    console.log('Split parts:', parts);

    if (parts.length !== 2) {
      console.error('Invalid repository format. Please use owner/repo format');
      return;
    }

    const [owner, repo] = parts;
    console.log('Owner:', owner);
    console.log('Repo:', repo);

    // Log the current config before removal
    console.log(
      'Current config:',
      JSON.stringify(this.configService.getConfig(), null, 2),
    );

    this.configService.removeGitRepo(owner, repo);
    console.log(`Removed ${owner}/${repo} from config`);

    // Log the config after removal
    console.log(
      'Updated config:',
      JSON.stringify(this.configService.getConfig(), null, 2),
    );
  }
}
