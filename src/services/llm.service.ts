import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../modules/config/config.service.js';

/**
 * LLM provider mode
 */
export enum LlmMode {
  OLLAMA = 'OLLAMA',
  OPENAI = 'OPENAI',
}

/**
 * JSDoc processing mode
 */
export enum JsdocsMode {
  DEFAULT = 'DEFAULT',
  BATCH = 'BATCH',
}

/**
 * The result of an LLM query
 */
export interface LlmQueryResult {
  /** The generated text response */
  response: string;
  /** Optional metadata about the query */
  metadata?: {
    model?: string;
    tokensUsed?: number;
    completionId?: string;
    batchId?: string;
  };
}

/**
 * Service responsible for interacting with language model providers
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly model: string;
  private readonly host: string;
  private readonly llmMode: LlmMode;
  private readonly jsdocsMode: JsdocsMode;
  private readonly openaiApiKey: string;

  constructor(private readonly configService: ConfigService) {
    // LLM Mode and configuration
    this.llmMode = (process.env.LLM_MODE as LlmMode) || LlmMode.OLLAMA;
    this.jsdocsMode = (process.env.JSDOCS_MODE as JsdocsMode) || JsdocsMode.DEFAULT;
    
    // Ollama configuration
    this.model = process.env.LLM_MODEL || 'llama3.2:latest';
    this.host = process.env.LLM_HOST || 'http://localhost:11434';
    
    // OpenAI configuration
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    
    // Log current mode
    this.logger.log(`LLM Service initialized with mode: ${this.llmMode}, JSDoc mode: ${this.jsdocsMode}`);
    
    // Validate configuration
    this.validateConfig();
  }

  /**
   * Validates the service configuration
   * @private
   */
  private validateConfig(): void {
    if (this.llmMode === LlmMode.OPENAI && !this.openaiApiKey) {
      this.logger.error('OPENAI_API_KEY is required when LLM_MODE is set to OPENAI');
      throw new Error('OPENAI_API_KEY is required when LLM_MODE is set to OPENAI');
    }

    if (this.llmMode === LlmMode.OLLAMA && this.jsdocsMode === JsdocsMode.BATCH) {
      this.logger.error('Batch mode is not supported with Ollama');
      throw new Error('Batch mode is not supported with Ollama. Set LLM_MODE=OPENAI or JSDOCS_MODE=DEFAULT');
    }
  }

  /**
   * Sends a query to the language model and returns the response
   * @param prompt The prompt to send to the LLM
   * @returns The response from the LLM
   */
  async query(prompt: string): Promise<string> {
    try {
      const result = await this.queryWithMetadata(prompt);
      return result.response;
    } catch (error) {
      this.logger.error('Error querying LLM:', error);
      throw error;
    }
  }

  /**
   * Sends a query to the language model with metadata
   * @param prompt The prompt to send to the LLM
   * @returns The response and metadata from the LLM
   */
  async queryWithMetadata(prompt: string): Promise<LlmQueryResult> {
    try {
      if (this.llmMode === LlmMode.OLLAMA) {
        return await this.queryOllama(prompt);
      } else {
        return await this.queryOpenAI(prompt);
      }
    } catch (error) {
      this.logger.error('Error querying LLM:', error);
      throw error;
    }
  }

  /**
   * Query Ollama LLM
   * @param prompt The prompt to send to Ollama
   * @returns The response from Ollama
   * @private
   */
  private async queryOllama(prompt: string): Promise<LlmQueryResult> {
    const response = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }

    const result = await response.json();
    if (!result.response) {
      const error = result.error || 'Unknown error';
      this.logger.error('Ollama returned error:', error);
      throw new Error(`Ollama error: ${error}`);
    }

    return {
      response: result.response,
      metadata: {
        model: this.model
      }
    };
  }

  /**
   * Query OpenAI LLM
   * @param prompt The prompt to send to OpenAI
   * @returns The response from OpenAI
   * @private
   */
  private async queryOpenAI(prompt: string): Promise<LlmQueryResult> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI returned status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.choices || result.choices.length === 0) {
      throw new Error('OpenAI returned no choices');
    }

    return {
      response: result.choices[0].message.content,
      metadata: {
        model: result.model,
        completionId: result.id,
        tokensUsed: result.usage?.total_tokens
      }
    };
  }

  /**
   * Processes multiple prompts using batch API (OpenAI only)
   * @param prompts Array of prompts to process
   * @returns Array of responses
   */
  async batchProcess(prompts: string[]): Promise<string[]> {
    if (this.llmMode !== LlmMode.OPENAI) {
      throw new Error('Batch processing is only available with OpenAI');
    }

    if (this.jsdocsMode !== JsdocsMode.BATCH) {
      throw new Error('Batch processing is disabled. Set JSDOCS_MODE=BATCH to enable');
    }

    try {
      const results = await this.batchProcessOpenAI(prompts);
      return results.map(result => result.response);
    } catch (error) {
      this.logger.error('Error in batch processing:', error);
      throw error;
    }
  }

  /**
   * Process multiple prompts using OpenAI's batch API
   * @param prompts Array of prompts to process
   * @returns Array of responses with metadata
   * @private
   */
  private async batchProcessOpenAI(prompts: string[]): Promise<LlmQueryResult[]> {
    // Create the batch request
    const batchRequest = {
      requests: prompts.map(prompt => ({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4000
      }))
    };

    // Create batch on OpenAI
    const batchResponse = await fetch('https://api.openai.com/v1/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'OpenAI-Beta': 'batches=v1'
      },
      body: JSON.stringify(batchRequest)
    });

    if (!batchResponse.ok) {
      const errorText = await batchResponse.text();
      throw new Error(`OpenAI batch creation failed with status ${batchResponse.status}: ${errorText}`);
    }

    const batchResult = await batchResponse.json();
    const batchId = batchResult.id;

    this.logger.log(`Created batch ${batchId} with ${prompts.length} prompts`);

    // Poll for batch completion
    let isComplete = false;
    let results: LlmQueryResult[] = [];

    while (!isComplete) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between polls

      const statusResponse = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'batches=v1'
        }
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`OpenAI batch status check failed with status ${statusResponse.status}: ${errorText}`);
      }

      const statusResult = await statusResponse.json();
      
      this.logger.debug(`Batch status: ${statusResult.status}, completed: ${statusResult.completed_at !== null}`);
      
      if (statusResult.status === 'completed') {
        isComplete = true;
        
        // Retrieve batch results
        const resultsResponse = await fetch(`https://api.openai.com/v1/batches/${batchId}/outputs`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'OpenAI-Beta': 'batches=v1'
          }
        });

        if (!resultsResponse.ok) {
          const errorText = await resultsResponse.text();
          throw new Error(`OpenAI batch results retrieval failed with status ${resultsResponse.status}: ${errorText}`);
        }

        const outputsResult = await resultsResponse.json();
        
        results = outputsResult.data.map((output: any) => ({
          response: output.choices[0].message.content,
          metadata: {
            model: output.model,
            completionId: output.id,
            batchId,
            tokensUsed: output.usage?.total_tokens
          }
        }));
      } else if (statusResult.status === 'failed') {
        throw new Error(`Batch processing failed: ${statusResult.error || 'Unknown error'}`);
      }
    }

    return results;
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