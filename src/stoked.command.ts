import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { ThemeLogger, THEME_MAP } from './logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

@Injectable()
@Command({
  name: 'stoked',
  description: 'Stoked CLI',
})
export class StokedCommand extends CommandRunner {
  constructor(private readonly logger: ThemeLogger) {
    super();
    this.logger.setTheme(THEME_MAP['Alien Bioluminescence']);
  }

  async run(): Promise<void> {
    this.logger.log(`Stoked CLI v${packageJson.version}`);
    this.logger.log('Use --help to see available commands');
  }
}
