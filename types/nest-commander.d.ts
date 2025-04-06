declare module 'nest-commander' {
  import { Type } from '@nestjs/common';

  // Primary decorators
  export function Command(options: CommandOptions): ClassDecorator;
  export function SubCommand(options: SubCommandOptions): ClassDecorator;
  export function Option(options: OptionOptions): PropertyDecorator;
  export function InjectCommander(): ParameterDecorator;
  export function CommandModule(options?: CommandModuleOptions): ClassDecorator;

  // Interface for Command class
  export interface CommandOptions {
    name: string;
    description?: string;
    argsDescription?: Record<string, string>;
    aliases?: string[];
    examples?: string[];
    subCommands?: Type<any>[];
  }

  // Interface for SubCommand class
  export interface SubCommandOptions {
    name: string;
    description?: string;
    argsDescription?: Record<string, string>;
    aliases?: string[];
    examples?: string[];
  }

  // Interface for Option decorator
  export interface OptionOptions {
    flags: string;
    description?: string;
    defaultValue?: any;
    required?: boolean;
    choices?: readonly string[];
  }

  // Interface for CommandModule decorator
  export interface CommandModuleOptions {
    imports?: any[];
    providers?: any[];
  }

  // Abstract class for implementing commands
  export abstract class CommandRunner {
    abstract run(passedParams: string[], options?: Record<string, any>): Promise<void> | void;
  }

  // Factory for running commands
  export class CommandFactory {
    static run(
      module: Type<any>,
      options?: CommandFactoryOptions
    ): Promise<void>;
  }

  // Options for CommandFactory
  export interface CommandFactoryOptions {
    logger?: boolean | any;
    cliName?: string;
    usePlugins?: boolean;
    enablePositionalOptions?: boolean;
    errorHandler?: (err: any) => number;
  }

  // Additional utility types
  export interface CommandRuntime extends Record<string, any> {
    run: (args: string[], options?: Record<string, any>) => Promise<void> | void;
  }

  export interface CommanderError extends Error {
    code: string;
    exitCode: number;
    message: string;
    nestedError?: Error;
  }

  // Additional helper methods
  export function CommandParent(): ClassDecorator;
  export function RootCommand(): ClassDecorator;
  export function parseBooleanOption(val: string): boolean;
  export function parseIntOption(val: string): number;
  export function parseFloatOption(val: string): number;
} 