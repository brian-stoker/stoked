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
  private readonly ollamaModel: string;
  private readonly ollamaHost: string;
  private readonly openaiModel: string;
  private readonly llmMode: LlmMode;
  private readonly jsdocsMode: JsdocsMode;
  private readonly openaiApiKey: string;
  private readonly batchWaitTimeMs: number = 5000; // Default polling interval in ms

  constructor(private readonly configService: ConfigService) {
    // LLM Mode and configuration
    this.llmMode = (process.env.LLM_MODE as LlmMode) || LlmMode.OLLAMA;
    this.jsdocsMode = (process.env.JSDOCS_MODE as JsdocsMode) || JsdocsMode.DEFAULT;
    
    // Ollama configuration
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:latest';
    this.ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    
    // OpenAI configuration
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    
    // Get batch wait time in ms (if specified)
    const batchWaitTimeSec = process.env.BATCH_POLL_INTERVAL_SEC ? 
      parseInt(process.env.BATCH_POLL_INTERVAL_SEC, 10) : 5;
    this.batchWaitTimeMs = batchWaitTimeSec * 1000;
    
    // Log current mode
    this.logger.log(`LLM Service initialized with mode: ${this.llmMode}, JSDoc mode: ${this.jsdocsMode}`);
    this.logger.log(`Ollama configured with model: ${this.ollamaModel}, host: ${this.ollamaHost}`);
    if (this.llmMode === LlmMode.OPENAI) {
      this.logger.log(`OpenAI configured with model: ${this.openaiModel}`);
      if (this.jsdocsMode === JsdocsMode.BATCH) {
        this.logger.log(`Batch mode enabled with poll interval: ${batchWaitTimeSec} seconds`);
      }
    }
    
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
    const response = await fetch(`${this.ollamaHost}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.ollamaModel,
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
        model: this.ollamaModel
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
        model: this.openaiModel,
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
    this.logger.log('Using OpenAI Batch API for processing multiple prompts');
    
    // Create the batch request
    const batchRequest = {
      requests: prompts.map(prompt => ({
        model: this.openaiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4000
      }))
    };
    
    // Log batch request details
    this.logger.log(`Creating batch with ${prompts.length} prompts using model: ${this.openaiModel}`);
    if (prompts.length > 0) {
      this.logger.debug(`First prompt sample: ${prompts[0].substring(0, 200)}...`);
    }

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
      this.logger.error(`OpenAI batch creation failed: ${errorText}`);
      throw new Error(`OpenAI batch creation failed with status ${batchResponse.status}: ${errorText}`);
    }

    const batchResult = await batchResponse.json();
    const batchId = batchResult.id;

    this.logger.log(`Created batch ${batchId} with ${prompts.length} prompts`);
    
    // Check if a max wait time is specified
    const maxWaitTime = process.env.BATCH_MAX_WAIT_MIN ? 
      parseInt(process.env.BATCH_MAX_WAIT_MIN, 10) * 60 * 1000 : 
      60 * 60 * 1000; // Default 1 hour timeout
    const startTime = Date.now();
    
    // Poll for batch completion
    let isComplete = false;
    let results: LlmQueryResult[] = [];
    let pollCount = 0;

    while (!isComplete) {
      await new Promise(resolve => setTimeout(resolve, this.batchWaitTimeMs)); // Wait between polls
      pollCount++;
      
      const statusResponse = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'batches=v1'
        }
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        this.logger.error(`OpenAI batch status check failed: ${errorText}`);
        throw new Error(`OpenAI batch status check failed with status ${statusResponse.status}: ${errorText}`);
      }

      const statusResult = await statusResponse.json();
      const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
      
      this.logger.log(`Batch ${batchId} poll #${pollCount}: Status: ${statusResult.status}, elapsed time: ${elapsedTime}s`);
      this.logger.debug(`Batch details: ${JSON.stringify(statusResult)}`);
      
      // Check if we've exceeded the max wait time
      if (Date.now() - startTime > maxWaitTime) {
        this.logger.error(`Batch processing exceeded maximum wait time of ${maxWaitTime/60000} minutes. Current status: ${statusResult.status}`);
        throw new Error(`Batch processing timeout exceeded. Current status: ${statusResult.status}`);
      }
      
      if (statusResult.status === 'completed') {
        isComplete = true;
        this.logger.log(`Batch ${batchId} completed after ${elapsedTime}s`);
        
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
          this.logger.error(`OpenAI batch results retrieval failed: ${errorText}`);
          throw new Error(`OpenAI batch results retrieval failed with status ${resultsResponse.status}: ${errorText}`);
        }

        const outputsResult = await resultsResponse.json();
        this.logger.log(`Retrieved ${outputsResult.data.length} results from batch ${batchId}`);
        
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
        this.logger.error(`Batch ${batchId} failed: ${statusResult.error || 'Unknown error'}`);
        throw new Error(`Batch processing failed: ${statusResult.error || 'Unknown error'}`);
      }
      // Otherwise, status is in_progress, continue polling
    }

    this.logger.log(`Batch ${batchId} processing complete, returning ${results.length} results`);
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