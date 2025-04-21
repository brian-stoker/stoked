#!/usr/bin/env node

import { Command, Option, Argument } from 'commander';
import { CliModule } from './modules/stoked/stoked.module.js'; // Adjust path if needed
import * as fs from 'fs';
import * as path from 'path';
import type { INestApplicationContext } from '@nestjs/common'; // Import context type
import { ThemeLogger } from './logger/theme.logger.js';
import { THEME_MAP } from './logger/theme.logger.js';
import { CommandFactory, CommandRunnerService} from 'nest-commander';

interface CommandInfo {
  name: string;
  path: string[];
  fullCommand: string;
  description?: string;
  options: { flags: string; description?: string }[];
  arguments: { name: string; required: boolean; variadic: boolean; description?: string }[];
  subcommands: CommandInfo[];
}

async function listCommands() {
  console.log('[list-commands] Starting generation...');

  let appContext: INestApplicationContext | undefined;
  try {
    console.log('[list-commands] Calling CommandFactory.createWithoutRunning...');
    appContext = await CommandFactory.createWithoutRunning(CliModule, {
      logger: new ThemeLogger(THEME_MAP['Deep Ocean']), 
      cliName: 'stoked',
      usePlugins: true,
      enablePositionalOptions: true,
      errorHandler: (err: any) => {
        // Silently handle help display
        if (err?.code === 'commander.help' || err?.exitCode === 0) {
          return 0;
        }
        console.log(err);

        // Only show actual errors
        if (err instanceof Error && err.message) {
          console.error(err.message);
        }

        return 1;
      },
    });
    console.log('[list-commands] CommandFactory.createWithoutRunning completed.');
    if (!appContext) {
        throw new Error('CommandFactory.createWithoutRunning returned undefined.');
    }
  } catch (error) {
    console.error('[list-commands] Error during CommandFactory.createWithoutRunning:', error);
    throw error; 
  }

  const commandService: any = appContext.get(CommandRunnerService, { strict: false });
  let rootCommand: Command;
  try {
    console.log('[list-commands] Getting root command instance from app context...');
    rootCommand = commandService.commander;

    if (!rootCommand) {
        throw new Error('Failed to get root Command instance from app context.');
    }
    console.log(`[list-commands] Got root command: ${rootCommand.name()}`);
  } catch (error) {
    console.error('[list-commands] Error getting root command:', error);
    if (appContext) await appContext.close();
    throw error;
  }

  function buildCommandInfo(cmd: Command, parentPath: string[] = []): CommandInfo {
    const commandName = cmd.name();
    console.log(`[list-commands] Building info for command: ${[...parentPath, commandName].join(' ') || '(root)'}`);
    const currentPath = commandName === rootCommand.name() ? [] : [...parentPath, commandName];
    const commandString = ['stoked', ...currentPath].join(' ');

    const info: CommandInfo = {
      name: commandName,
      path: currentPath,
      fullCommand: commandString,
      description: cmd.description(),
      options: cmd.options.map((opt: Option) => ({
        flags: opt.flags,
        description: opt.description,
      })),
      arguments: cmd.registeredArguments.map((arg: Argument) => ({
        name: arg.name(),
        required: arg.required,
        variadic: arg.variadic,
        description: arg.description,
      })),
      subcommands: [],
    };
    info.subcommands = cmd.commands.map(subCmd => buildCommandInfo(subCmd, currentPath));
    return info;
  }

  let commandStructure;
  try {
    console.log('[list-commands] Starting to build command structure...');
    commandStructure = buildCommandInfo(rootCommand);
    console.log('[list-commands] Finished building command structure.');
  } catch (error) {
    console.error('[list-commands] Error during buildCommandInfo:', error);
    if (appContext) await appContext.close();
    throw error;
  }
  
  try {
    console.log('[list-commands] Closing NestJS application context...');
    await appContext.close();
    console.log('[list-commands] NestJS application context closed.');
  } catch(error) {
    console.error('[list-commands] Error closing app context:', error);
  }

  let jsonOutput;
  try {
    console.log('[list-commands] Stringifying command structure to JSON...');
    jsonOutput = JSON.stringify(commandStructure, null, 2);
    console.log('[list-commands] JSON stringification complete.');
  } catch (error) {
    console.error('[list-commands] Error stringifying command structure:', error);
    throw error;
  }
  
  const outputPath = process.argv[2]; 
  if (outputPath) {
    const outputFilePath = path.resolve(outputPath);
    fs.writeFileSync(outputFilePath, jsonOutput);
    console.log(`[list-commands] Command structure saved to ${outputFilePath}`);
  } else {
    console.log(jsonOutput);
  }

  console.log('[list-commands] Generation script finished.');
}

listCommands().catch(err => {
  console.error('[list-commands] Unhandled error during execution:', err);
  process.exit(1);
}); 