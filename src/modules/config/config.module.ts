import { Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { ConfigCommand } from './commands/config.command.js';
import { RepoCommand } from './commands/repo.command.js';
import { RemoveRepoCommand } from './commands/remove-repo.command.js';

@Module({
  imports: [],
  providers: [
    ConfigService,
    ConfigCommand,
    RepoCommand,
    RemoveRepoCommand,
  ],
  exports: [
    ConfigService,
    ConfigCommand,
    RepoCommand,
    RemoveRepoCommand,
  ],
})
export class ConfigModule {}