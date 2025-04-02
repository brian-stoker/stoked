import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../modules/config/config.service.js';
import { execSync } from 'child_process';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly model: string;
  private readonly host: string;

  constructor(private readonly configService: ConfigService) {
    this.model = process.env.LLM_MODEL || 'llama3.2:latest';
    this.host = process.env.LLM_HOST || 'http://localhost:11434';
  }

  async query(prompt: string): Promise<string> {
    try {
      const escapedPrompt = prompt.replace(/"/g, '\\"');
      const response = execSync(`curl -X POST "${this.host}/api/generate" -d '{
        "model": "${this.model}",
        "prompt": "${escapedPrompt}",
        "stream": false
      }'`, { encoding: 'utf-8' });

      const result = JSON.parse(response);
      if (!result.response) {
        this.logger.warn('LLM returned empty response:', result);
        return 'No analysis available at this time.';
      }
      return result.response;
    } catch (error) {
      this.logger.error('Error querying LLM:', error);
      return 'Error analyzing issue. Please try again later.';
    }
  }

  async generateGitCommands(prompt: string): Promise<string> {
    const systemPrompt = `You are a helpful assistant that generates Git commands based on user requests.
    You should ONLY output the Git commands, one per line, without any explanations or markdown formatting.
    Do not include any other text or formatting in your response.
    The commands should be ready to be executed directly in a terminal.
    If you need to install dependencies, ignore them as they are already installed.`;

    const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;
    return this.query(fullPrompt);
  }

  async executeGitCommands(commands: string[]): Promise<void> {
    for (const command of commands) {
      try {
        // Execute each command using Node's child_process
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        await execAsync(command);
      } catch (error) {
        console.error(`Error executing command: ${command}`);
        console.error(error);
        throw error;
      }
    }
  }
} 