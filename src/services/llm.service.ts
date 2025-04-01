import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { Ollama } from 'ollama';

@Injectable()
export class LlmService implements OnModuleInit {
  private ollama: Ollama;
  private readonly DEFAULT_MODEL = 'qwen2.5-coder';

  constructor() {
    this.ollama = new Ollama();
  }

  async onModuleInit() {
    try {
      // Check if model exists, if not pull it
      try {
        await this.ollama.show({ model: this.DEFAULT_MODEL });
      } catch (e: any) {
        if (e?.error?.includes('model not found')) {
          console.log(`Pulling ${this.DEFAULT_MODEL} model...`);
          await this.ollama.pull({ model: this.DEFAULT_MODEL });
        } else {
          throw e;
        }
      }
    } catch (error) {
      console.error('Failed to initialize LLM service:', error);
      throw error;
    }
  }

  async query(prompt: string): Promise<string> {
    const response = await this.ollama.chat({
      model: this.DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });

    return response.message.content;
  }

  async generateGitCommands(description: string): Promise<string[]> {
    const prompt = `You are a Git expert. Given the following description of changes needed, generate the exact Git commands needed to:
1. Create a new feature branch
2. Make the necessary changes
3. Commit the changes
4. Push the branch
5. Create a pull request

Description: ${description}

Respond with ONLY the Git commands, one per line, in the exact order they should be executed. Do not include any explanations or markdown formatting.`;

    const response = await this.ollama.chat({
      model: this.DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });

    // Split the response into individual commands and clean them
    return response.message.content
      .split('\n')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd && !cmd.startsWith('#')); // Remove empty lines and comments
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