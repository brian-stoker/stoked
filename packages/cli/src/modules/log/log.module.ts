import { Global, Module } from '@nestjs/common';
import { LogCommand } from './log.command.js';
import { LogCoordsCommand } from './log.coords.command.js';
import { LogService } from './log.service.js';

@Global()
@Module({
  providers: [LogService, LogCommand, LogCoordsCommand],
  exports: [LogService],
})
export class LogModule {}
