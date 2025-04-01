import { Injectable } from '@nestjs/common';
import { type GenerateResponse, Ollama } from 'ollama';
import { execSync, exec, ChildProcess } from 'child_process';
import { ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import { writeFileSync } from 'fs';

/**
 * Service responsible for interacting with the Language Model (LLM) and executing system commands
 *
 * This service provides functionality for:
 * - Querying the LLM with prompts
 * - Executing system commands safely
 * - Managing file operations
 * - Logging operations through a themed logger
 *
 * @class LlmService
 * @implements {Injectable}
 */
@Injectable()
export class LlmService {
  /** Instance of the Ollama client for LLM interactions */
  private ollama: Ollama;
  /** Logger instance with custom theming */
  private readonly logger: ThemeLogger;
  /** List of allowed system commands for security */
  private readonly allowedCommands = [
    'git',
    'echo',
    'node',
    'npm',
    'pnpm',
    'yarn',
    'ts-node',
    'tsx',
    'tsc',
    'jest',
    'debug',
    'source-map-support',
  ];

  /**
   * Creates an instance of LlmService
   * Initializes the Ollama client and sets up the themed logger
   */
  constructor() {
    this.ollama = new Ollama({ host: `${process.env.LLM_HOST}` }); // Default Ollama host
    this.logger = new ThemeLogger();
    this.logger.setTheme(THEMES['Deep Ocean']); // Using an existing theme
  }

  /**
   * Sends a prompt to the LLM and returns its response
   *
   * @param {string} prompt - The prompt to send to the LLM
   * @returns {Promise<string>} The LLM's response
   * @throws {Error} If the LLM request fails
   * @example
   * const response = await llmService.query("What is the capital of France?");
   */
  async query(prompt: string): Promise<string> {
    this.logger.debug(`Sending prompt to LLM: ${prompt}`);
    const promptRes: GenerateResponse = await this.ollama.generate({
      model: process.env.LLM_MODEL || 'incept5/llama3.1-claude:latest',
      prompt,
    });
    this.logger.debug(`LLM Response: ${promptRes.response}`);
    return promptRes.response;
  }

  /**
   * Validates if a command is allowed to be executed
   *
   * @param {string} command - The command to validate
   * @returns {boolean} True if the command is allowed
   * @throws {Error} If the command is not in the allowed list
   * @example
   * llmService.validateCommand("git status"); // Returns true
   * llmService.validateCommand("rm -rf /"); // Throws error
   */
  validateCommand(command: string): boolean {
    // Allow commands that start with any of the allowed commands
    if (!this.allowedCommands.some((cmd) => command.startsWith(cmd))) {
      this.logger.warn(`Command not allowed: ${command}`);
      throw new Error(`Command not allowed: ${command}`);
    }
    return true;
  }

  /**
   * Executes a command synchronously and returns its output
   *
   * @param {string} command - The command to execute
   * @returns {string} The command's output
   * @throws {Error} If the command is not allowed or execution fails
   * @example
   * const output = llmService.exec("git status");
   */
  exec(command: string): string {
    this.validateCommand(command);
    try {
      const output = execSync(command, { encoding: 'utf-8' });
      this.logger.debug(`Command output: ${output}`);
      return output;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Command failed: ${error.message}`);
      } else {
        this.logger.error('Command failed with unknown error');
      }
      throw error;
    }
  }

  /**
   * Executes a command asynchronously and returns the child process
   *
   * @param {string} command - The command to execute
   * @returns {ChildProcess} The child process object
   * @throws {Error} If the command is not allowed
   * @example
   * const process = llmService.execAsync("npm install");
   * process.on('exit', (code) => console.log(`Process exited with code ${code}`));
   */
  execAsync(command: string): ChildProcess {
    this.validateCommand(command);
    const child = exec(command, { encoding: 'utf-8' });

    // Route stdout through logger
    child.stdout?.on('data', (data) => {
      this.logger.debug(`Command output: ${data}`);
    });

    // Route stderr through logger
    child.stderr?.on('data', (data) => {
      this.logger.error(`Command error: ${data}`);
    });

    // Log process events
    child.on('error', (error) => {
      this.logger.error(`Command process error: ${error.message}`);
    });

    child.on('exit', (code) => {
      this.logger.debug(`Command process exited with code ${code}`);
    });

    return child;
  }

  /**
   * Writes content to a file
   *
   * @param {string} filename - The path to the file to write
   * @param {string} content - The content to write to the file
   * @throws {Error} If writing to the file fails
   * @example
   * llmService.editFile("config.json", '{"key": "value"}');
   */
  editFile(filename: string, content: string) {
    try {
      writeFileSync(filename, content, 'utf-8');
      this.logger.debug(`Successfully wrote content to ${filename}`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to write file: ${error.message}`);
      } else {
        this.logger.error('Failed to write file with unknown error');
      }
      throw error;
    }
  }

  /**
   * Test method to verify file writing functionality
   * Writes a sample React import statement to test.txt
   *
   * @example
   * llmService.testFileWrite();
   */
  testFileWrite() {
    const testContent = `import * as React from 'react';
import { type ReactNode } from 'react';
import { type ReactElement } from 'react';`;

    this.editFile('test.txt', testContent);
  }
}
