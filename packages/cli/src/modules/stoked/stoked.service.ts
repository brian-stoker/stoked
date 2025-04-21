import { Injectable } from '@nestjs/common';

/**
 * Service responsible for handling CLI-specific operations
 *
 * This service provides functionality for:
 * - Basic CLI operations
 * - Command-line interface interactions
 * - CLI-specific utilities
 *
 * @class CliService
 * @implements {Injectable}
 */
@Injectable()
export class CliService {
  /**
   * Returns a hello world message
   *
   * @returns {string} A greeting message
   * @example
   * const message = cliService.getHello();
   * console.log(message); // Outputs: "Hello World!"
   */
  getHello(): string {
    return 'Hello World!';
  }
}
