import { Injectable } from '@nestjs/common';
import { ThemeLogger } from '../logger/theme.logger.js';

@Injectable()
export class LlmService {
  private readonly model: string;
  private readonly host: string;

  constructor(private readonly logger: ThemeLogger) {
    this.model = process.env.LLM_MODEL || 'claude';
    this.host = process.env.LLM_HOST || 'http://localhost:11434';
  }

  async query(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.response) {
        this.logger.warn('LLM returned empty response:', data);
        return 'No analysis available at this time.';
      }
      return data.response;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error querying LLM: ${err.message}`);
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

  async generateJsDoc(code: string): Promise<string> {
    try {
      const response = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: `Add JSDoc comments to this code:\n\n${code}\n\nOnly output the code with added JSDoc comments. Do not include any other text or explanations.`,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to generate JSDoc: ${err.message}`);
      throw error;
    }
  }
} 