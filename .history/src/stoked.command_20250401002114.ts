import { Option, CommandRunner, RootCommand } from 'nest-commander';
import packageJson from '../package.json' with { type: 'json' };
import {THEME_MAP, type ThemeLogger} from "./logger/theme.logger.js";
@RootCommand({
  name: 'stoked',
  description: 'semi-atonomous coding agent',
})
export class StokedCommand extends CommandRunner {
  constructor(private readonly logger: ThemeLogger) {
    super();
    this.logger.setTheme(THEME_MAP['Alien Bioluminescence']);
  }

  @Option({
    flags: '-v, --version',
    description: 'display version',
  })
  parseTop(): boolean {
    return true;
  }

  @Option({
    flags: '-h, --help',
    description: 'display help for command',
  })
  parseHelp(val: boolean): boolean {
    return val;
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    // If --top option is specified, only show the highest priority repo
    if (options?.version) {
      this.logger.log(`stoked: ${packageJson.version}`);
      if (options?.help) {
        this.command.help();
      }
    } else {
      // Basic command will display help by default
      this.command.help();
    }
  }
}
