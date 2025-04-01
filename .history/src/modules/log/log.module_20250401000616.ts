import { Global, Module } from '@nestjs/common';
import { LogCommand } from './log.command.js';
import { LogCoordsCommand } from './log.coords.command.js';

@Global()
@Module({
  providers: [LogCommand, LogCoordsCommand],
  exports: [],
})
export class LogModule {}
