import { Injectable } from '@nestjs/common';
import { Command, CommandRunner, SubCommand } from 'nest-commander';
import { LogService } from './log.service.js';
import { THEMES, ThemeLogger } from '../../logger/theme.logger.js';

import process from 'process';
import readline from 'readline';

@Injectable()
@SubCommand({
  name: 'coords',
  description:
    'display mouse coords in screen space.. click drag square to capture',
})
export class LogCoordsCommand extends CommandRunner {
  constructor(
    private readonly logService: LogService,
    private readonly logger: ThemeLogger,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {}
}

// // Make process.stdin begin emitting "keypress" events
// keypress(process.stdin);

// // Enable mouse tracking
// process.stdin.setRawMode(true);
// process.stdin.resume();
// process.stdout.write('\x1b[?1000h'); // Enable reporting of mouse button events
// process.stdout.write('\x1b[?1003h'); // Enable reporting of all mouse movement and button events

// process.stdin.on('keypress', function (ch, key) {
//   if (key && key.name === 'mouse') {
//     console.log('Mouse event:', key);
//   }
//   if (key && key.ctrl && key.name == 'c') {
//     process.stdin.pause();
//     process.stdout.write('\x1b[?1000l'); // Disable reporting of mouse button events
//     process.stdout.write('\x1b[?1003l'); // Disable reporting of all mouse movement and button events
//     process.exit();
//   }
// });
