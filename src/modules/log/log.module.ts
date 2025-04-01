import { Global, Module } from '@nestjs/common';
import { ThemeLogger } from '../../logger/theme.logger.js';
import { LogCommand } from './log.command.js';
import { LogCoordsCommand } from './log.coords.command.js';

@Global()
@Module({
  providers: [ThemeLogger, LogCommand, LogCoordsCommand],
  exports: [ThemeLogger],
})
export class LogModule {}
