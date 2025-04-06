import { Injectable, Logger } from '@nestjs/common';
import { type GenerateResponse, Ollama } from 'ollama';
import { execSync, exec, ChildProcess } from 'child_process';
import { writeFileSync } from 'fs';
import { ThemeLogger, THEMES } from "../../logger/theme.logger.js";
import { ConfigService } from '../config/config.service.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import FormData from 'form-data';

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
    error?: string;
  };
}

/**
 * Service responsible for interacting with language model providers
 *
 * This service provides functionality for:
 * - Querying the LLM with prompts
 * - Batch processing with OpenAI
 * - Executing system commands safely
 * - Managing file operations
 * - Logging operations through a themed logger
 *
 * @class LlmService
 * @implements {Injectable}
 */
@Injectable()
export class LlmService {
  private readonly standardLogger = new Logger(LlmService.name);
  private readonly logger: ThemeLogger;
  
  // Configuration
  private readonly ollamaModel: string;
  private readonly ollamaHost: string;
  private readonly openaiModel: string;
  private readonly llmMode: LlmMode;
  private readonly jsdocsMode: JsdocsMode;
  private readonly openaiApiKey: string;
  private readonly batchWaitTimeMs: number = 5000; // Default polling interval in ms
  
  // Ollama client
  private ollama: Ollama = null!;
  
  // Allowed commands for security
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
  constructor(private readonly configService: ConfigService) {
    // Setup themed logger
    this.logger = new ThemeLogger();
    this.logger.setTheme(THEMES[1]); // Using an existing theme
    
    // Determine LLM Mode based on available configuration
    const hasOpenAI = !!process.env.OPENAI_API_KEY && !!process.env.OPENAI_MODEL;
    const hasOllama = !!process.env.OLLAMA_MODEL && !!process.env.OLLAMA_HOST;
    
    // Default to OpenAI if configured, otherwise Ollama
    this.llmMode = hasOpenAI ? LlmMode.OPENAI : LlmMode.OLLAMA;
    
    // For backward compatibility, also check LLM_MODE
    if (process.env.LLM_MODE) {
      const specifiedMode = process.env.LLM_MODE as LlmMode;
      // Only use specified mode if the required config exists
      if (specifiedMode === LlmMode.OPENAI && hasOpenAI) {
        this.llmMode = LlmMode.OPENAI;
      } else if (specifiedMode === LlmMode.OLLAMA && hasOllama) {
        this.llmMode = LlmMode.OLLAMA;
      } else {
        this.standardLogger.warn(`Specified LLM_MODE=${specifiedMode} but missing configuration. Using ${this.llmMode} instead.`);
      }
    }
    
    // Get JSDoc processing mode
    this.jsdocsMode = (process.env.JSDOCS_MODE as JsdocsMode) || JsdocsMode.DEFAULT;
    
    // Ollama configuration
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:latest';
    this.ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    
    // Initialize Ollama client if needed
    if (hasOllama) {
      this.ollama = new Ollama({ host: this.ollamaHost });
    }
    
    // OpenAI configuration
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    
    // Get batch wait time in ms (if specified)
    const batchWaitTimeSec = process.env.BATCH_POLL_INTERVAL_SEC ? 
      parseInt(process.env.BATCH_POLL_INTERVAL_SEC, 10) : 5;
    this.batchWaitTimeMs = batchWaitTimeSec * 1000;
    
    // Log current mode
    this.standardLogger.debug(`LLM Service initialized with mode: ${this.llmMode}, JSDoc mode: ${this.jsdocsMode}`);
    if (hasOllama) {
      this.standardLogger.debug(`Ollama configured with model: ${this.ollamaModel}, host: ${this.ollamaHost}`);
    }
    if (hasOpenAI) {
      this.standardLogger.debug(`OpenAI configured with model: ${this.openaiModel}`);
      if (this.jsdocsMode === JsdocsMode.BATCH) {
        this.standardLogger.debug(`Batch mode enabled with poll interval: ${batchWaitTimeSec} seconds`);
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
    // Check mode-specific requirements
    if (this.llmMode === LlmMode.OPENAI) {
      if (!this.openaiApiKey) {
        this.standardLogger.error('OPENAI_API_KEY is required when using OpenAI');
        throw new Error('OPENAI_API_KEY is required when using OpenAI');
      }

      if (!this.openaiModel) {
        this.standardLogger.error('OPENAI_MODEL is required when using OpenAI');
        throw new Error('OPENAI_MODEL is required when using OpenAI');
      }
    } else if (this.llmMode === LlmMode.OLLAMA) {
      if (!this.ollamaModel) {
        this.standardLogger.error('OLLAMA_MODEL is required when using Ollama');
        throw new Error('OLLAMA_MODEL is required when using Ollama');
      }

      if (!this.ollamaHost) {
        this.standardLogger.error('OLLAMA_HOST is required when using Ollama');
        throw new Error('OLLAMA_HOST is required when using Ollama');
      }
    }

    // Check batch mode requirements
    if (this.jsdocsMode === JsdocsMode.BATCH && this.llmMode !== LlmMode.OPENAI) {
      this.standardLogger.error('Batch mode is not supported with Ollama');
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
      this.standardLogger.error('Error querying LLM:', error);
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
      this.standardLogger.error('Error querying LLM:', error);
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
    this.logger.debug(`Sending prompt to LLM (Ollama): ${prompt}`);
    
    try {
      const promptRes: GenerateResponse = await this.ollama.generate({
        model: this.ollamaModel,
        prompt,
      });
      
      this.logger.debug(`LLM Response (Ollama): ${promptRes.response}`);
      
      return {
        response: promptRes.response,
        metadata: {
          model: this.ollamaModel
        }
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.standardLogger.error(`Ollama error: ${errorMsg}`);
      throw new Error(`Ollama error: ${errorMsg}`);
    }
  }

  /**
   * Query OpenAI LLM
   * @param prompt The prompt to send to OpenAI
   * @returns The response from OpenAI
   * @private
   */
  private async queryOpenAI(prompt: string): Promise<LlmQueryResult> {
    try {
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.standardLogger.error(`OpenAI error: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Processes multiple prompts using batch API (OpenAI only)
   * @param prompts Array of prompts to process
   * @returns Array of placeholder responses with batch metadata
   */
  async batchProcess(prompts: string[]): Promise<LlmQueryResult[]> {
    if (this.llmMode !== LlmMode.OPENAI) {
      throw new Error('Batch processing is only available with OpenAI');
    }

    if (this.jsdocsMode !== JsdocsMode.BATCH) {
      throw new Error('Batch processing is disabled. Set JSDOCS_MODE=BATCH to enable');
    }

    try {
      // For asynchronous batch processing, we will initiate the batch
      // and return placeholder responses with the batch ID
      // Actual results will be retrieved later
      const batchId = await this.initiateBatch(prompts);
      
      // Create placeholder results with batch ID in metadata
      const placeholderResults: LlmQueryResult[] = prompts.map(() => ({
        response: '[Batch processing initiated - results will be available later]',
        metadata: {
          batchId,
          model: this.openaiModel
        }
      }));
      
      return placeholderResults;
    } catch (error) {
      this.standardLogger.error('Error in batch processing:', error);
      throw error;
    }
  }
  
  /**
   * Initiates a batch processing request with OpenAI
   * @param prompts Array of prompts to process
   * @returns The batch ID
   * @private
   */
  private async initiateBatch(prompts: string[]): Promise<string> {
    this.standardLogger.log(`Submitting ${prompts.length} prompts to OpenAI Batch API...`);
    
    try {
      // Create JSONL file for batch processing
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Use an absolute path that doesn't depend on cwd
      const homeDir = os.homedir();
      let batchDir = path.join(homeDir, 'stoked-batch-data');
      
      this.standardLogger.log(`Creating batch directory at: ${batchDir}`);
      
      try {
        // Ensure directory exists with recursive option
        fs.mkdirSync(batchDir, { recursive: true });
        this.standardLogger.log(`Successfully created or verified directory: ${batchDir}`);
      } catch (dirError) {
        this.standardLogger.error(`Error creating directory: ${dirError}`);
        // Try alternative location
        const tempDir = os.tmpdir();
        this.standardLogger.log(`Trying alternative directory: ${tempDir}`);
        batchDir = path.join(tempDir, 'stoked-batch-data');
        fs.mkdirSync(batchDir, { recursive: true });
      }
      
      const inputFilePath = path.join(batchDir, `batch-input-${timestamp}.jsonl`);
      
      this.standardLogger.log(`Writing batch input file to: ${inputFilePath}`);
      
      // Write each message to the JSONL file
      let jsonlContent = '';
      for (let i = 0; i < prompts.length; i++) {
        const message = prompts[i];
        // Format as required by OpenAI batch API
        const formattedMessage = JSON.stringify({
          method: "POST", // Required method parameter for batch API
          url: "/v1/chat/completions", // Required url parameter for batch API
          custom_id: `request-${timestamp}-${i}`, // Add unique custom_id for each request
          body: {
            model: this.openaiModel,
            messages: [{ role: 'user', content: message }],
            temperature: 0.7,
            max_tokens: 4000
          }
        });
        jsonlContent += formattedMessage + '\n';
      }
      
      // Write the content to file using synchronous API
      try {
        fs.writeFileSync(inputFilePath, jsonlContent, 'utf8');
        this.standardLogger.log(`Successfully wrote ${prompts.length} messages to batch input file`);
        
        // Debug logging - Show sample of JSONL content when debug is enabled
        if (process.env.NODE_DEBUG?.includes('http')) {
          this.standardLogger.debug(`Sample JSONL content (first request):`);
          const firstLine = jsonlContent.split('\n')[0];
          this.standardLogger.debug(firstLine);
        }
      } catch (writeError: unknown) {
        const errorMessage = writeError instanceof Error ? writeError.message : String(writeError);
        throw new Error(`Failed to write batch input file: ${errorMessage}`);
      }
      
      // Create a form data object for file upload
      const boundary = `----WebKitFormBoundary${Math.random().toString(16).substring(2)}`;
      let requestBody = '';
      
      // Add purpose field
      requestBody += `--${boundary}\r\n`;
      requestBody += `Content-Disposition: form-data; name="purpose"\r\n\r\n`;
      requestBody += `batch\r\n`;
      
      // Add file field
      requestBody += `--${boundary}\r\n`;
      requestBody += `Content-Disposition: form-data; name="file"; filename="${path.basename(inputFilePath)}"\r\n`;
      requestBody += `Content-Type: application/json\r\n\r\n`;
      requestBody += jsonlContent + '\r\n';
      
      // End of form data
      requestBody += `--${boundary}--\r\n`;
      
      this.standardLogger.log(`Uploading file to OpenAI...`);
      
      const fileUploadResponse = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        body: requestBody
      });
      
      if (!fileUploadResponse.ok) {
        const errorText = await fileUploadResponse.text();
        throw new Error(`OpenAI file upload failed with status ${fileUploadResponse.status}: ${errorText}`);
      }
      
      const fileData = await fileUploadResponse.json();
      const fileId = fileData.id;
      
      // Debug logging - Log file upload response when debug is enabled
      if (process.env.NODE_DEBUG?.includes('http')) {
        this.standardLogger.debug(`File upload response:`);
        this.standardLogger.debug(JSON.stringify(fileData, null, 2));
      }
      
      // Create the batch
      this.standardLogger.log(`Creating batch with file ID: ${fileId}`);
      
      const batchRequestBody = JSON.stringify({
        input_file_id: fileId,
        endpoint: '/v1/chat/completions',
        completion_window: '24h'
      });

      // Debug logging - Log batch request when debug is enabled
      if (process.env.NODE_DEBUG?.includes('http')) {
        this.standardLogger.debug(`Batch request body:`);
        this.standardLogger.debug(batchRequestBody);
      }
      
      const batchResponse = await fetch('https://api.openai.com/v1/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'batches=v1'
        },
        body: batchRequestBody,
      });
      
      if (!batchResponse.ok) {
        const errorText = await batchResponse.text();
        
        // Debug logging - Log detailed error response
        if (process.env.NODE_DEBUG?.includes('http')) {
          this.standardLogger.debug(`Batch creation error response (${batchResponse.status}):`);
          this.standardLogger.debug(errorText);
        }
        
        throw new Error(`OpenAI batch creation failed with status ${batchResponse.status}: ${errorText}`);
      }
      
      const batchData = await batchResponse.json();
      const batchId = batchData.id;
      
      // Debug logging - Log batch creation response when debug is enabled
      if (process.env.NODE_DEBUG?.includes('http')) {
        this.standardLogger.debug(`Batch creation response:`);
        this.standardLogger.debug(JSON.stringify(batchData, null, 2));
      }
      
      // Save batch information to both locations
      
      // 1. Save to batch data directory (original location)
      const batchInfoPath = path.join(batchDir, `batch-info-${batchId}.json`);
      fs.writeFileSync(
        batchInfoPath,
        JSON.stringify({
          id: batchId,
          created: new Date().toISOString(),
          messages: prompts,
          file_id: fileId,
          status: 'submitted'
        }, null, 2)
      );
      
      // 2. Also save to ~/.stoked/batch-data directory for process-batch command
      const stokedBatchDir = path.join(homeDir, '.stoked', 'batch-data');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(stokedBatchDir)) {
        fs.mkdirSync(stokedBatchDir, { recursive: true });
      }
      
      // Save in the format expected by process-batch
      fs.writeFileSync(
        path.join(stokedBatchDir, `items-${batchId}.json`),
        JSON.stringify({
          batchId,
          packagePath: process.cwd(), // Use current directory as fallback
          timestamp: new Date().toISOString(),
          items: prompts.map((prompt, index) => ({
            requestId: Date.now() + index,
            filePath: `prompt-${index}.txt`, // Placeholder since we don't have actual file paths
            isEntryPoint: false
          }))
        }, null, 2)
      );
      
      // 3. Move the input file to a "posted" folder once batch is successfully created
      try {
        // Create the posted directory if it doesn't exist
        const postedDir = path.join(stokedBatchDir, 'posted');
        if (!fs.existsSync(postedDir)) {
          fs.mkdirSync(postedDir, { recursive: true });
          this.standardLogger.log(`Created posted directory at: ${postedDir}`);
        }
        
        // Move the input file to the posted directory
        const postedFilePath = path.join(postedDir, path.basename(inputFilePath));
        fs.copyFileSync(inputFilePath, postedFilePath);
        
        // Optionally remove the original file if copy was successful
        if (fs.existsSync(postedFilePath)) {
          fs.unlinkSync(inputFilePath);
          this.standardLogger.log(`Moved batch input file to posted directory: ${postedFilePath}`);
        }
      } catch (moveError) {
        this.standardLogger.error(`Warning: Failed to move input file to posted directory: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
        // Continue execution - this is not critical
      }
      
      this.standardLogger.log(`Batch information saved to ${batchInfoPath} and ${stokedBatchDir}`);
      return batchId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.standardLogger.error(`Batch initiation failed: ${errorMessage}`);
      throw new Error(`Failed to initiate batch: ${errorMessage}`);
    }
  }

  /**
   * Get the raw batch status JSON from the OpenAI API
   * @param batchId The ID of the batch to check
   * @returns The raw batch status JSON
   */
  async getRawBatchStatus(batchId: string): Promise<any> {
    try {
      this.standardLogger.log(`Getting raw batch status for ${batchId}...`);
      
      const statusResponse = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'batches=v1'
        }
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        this.standardLogger.error(`OpenAI batch status check failed: ${errorText}`);
        throw new Error(`OpenAI batch status check failed with status ${statusResponse.status}: ${errorText}`);
      }

      return await statusResponse.json();
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.standardLogger.error(`Error getting raw batch status: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Check the status of a batch
   * @param batchId The ID of the batch to check
   * @returns The batch status
   */
  async checkBatchStatus(batchId: string): Promise<{ status: string, complete: boolean, error?: string }> {
    try {
      this.standardLogger.log(`Checking status of batch ${batchId}...`);
      
      const statusResponse = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'batches=v1'
        }
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        this.standardLogger.error(`OpenAI batch status check failed: ${errorText}`);
        throw new Error(`OpenAI batch status check failed with status ${statusResponse.status}: ${errorText}`);
      }

      const statusResult = await statusResponse.json();
      
      // Force display of the full API response, not as debug but as normal log
      this.standardLogger.log(`\n=============== BATCH API RESPONSE ===============`);
      this.standardLogger.log(JSON.stringify(statusResult, null, 2));
      this.standardLogger.log(`=================================================\n`);
      
      // Log detailed status information
      this.standardLogger.log(`Batch ${batchId} status: ${statusResult.status}`);
      this.standardLogger.log(`Created at: ${new Date(statusResult.created_at * 1000).toLocaleString()}`);
      
      if (statusResult.completed_at) {
        this.standardLogger.log(`Completed at: ${new Date(statusResult.completed_at * 1000).toLocaleString()}`);
      }
      
      if (statusResult.failed_at) {
        this.standardLogger.log(`Failed at: ${new Date(statusResult.failed_at * 1000).toLocaleString()}`);
      }
      
      if (statusResult.error) {
        this.standardLogger.error(`Batch error: ${JSON.stringify(statusResult.error)}`);
      }
      
      // Show errors array if available
      if (statusResult.errors && statusResult.errors.data) {
        this.standardLogger.error(`Batch contains ${statusResult.errors.data.length} errors`);
      }
      
      // Show output file info if available
      if (statusResult.output_file_id) {
        this.standardLogger.log(`Output file ID: ${statusResult.output_file_id}`);
      } else {
        this.standardLogger.log(`No output file available yet`);
      }
      
      // The batch is complete if status is 'completed', 'failed', or 'cancelled'
      const isComplete = ['completed', 'failed', 'cancelled'].includes(statusResult.status);
      
      return {
        status: statusResult.status,
        complete: isComplete,
        error: statusResult.error ? JSON.stringify(statusResult.error) : undefined
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.standardLogger.error(`Error checking batch status: ${errorMessage}`);
      throw new Error(`Failed to check batch status: ${errorMessage}`);
    }
  }
  
  /**
   * Retrieves the results of a batch API request
   * @param batchId The ID of the batch to retrieve results for
   * @returns An array of batch results, or null if an error occurred
   */
  async retrieveBatchResults(batchId: string): Promise<any[]> {
    this.logger.log(`Retrieving results for batch: ${batchId}`);
    
    try {
      // First get the batch status to check if it's complete and get the output file ID
      const batchStatus = await this.getRawBatchStatus(batchId);
      
      if (!batchStatus) {
        this.logger.error(`Failed to get batch status for batch ${batchId}`);
        return [];
      }
      
      if (batchStatus.status !== 'completed') {
        this.logger.error(`Batch ${batchId} is not completed yet (status: ${batchStatus.status})`);
        return [];
      }
      
      if (!batchStatus.output_file_id) {
        this.logger.error(`No output file ID found for batch ${batchId}`);
        return [];
      }
      
      // Now we need to download the content of the output file
      this.logger.log(`Downloading output file: ${batchStatus.output_file_id}`);
      const fileContent = await this.retrieveFileContent(batchStatus.output_file_id);
      
      if (!fileContent) {
        this.logger.error(`Failed to download output file for batch ${batchId}`);
        return [];
      }
      
      // Log some debug info about the file content
      this.logger.debug(`File content length: ${fileContent.length} bytes`);
      this.logger.debug(`File content preview: ${fileContent.substring(0, 200)}...`);
      
      // The file content should be JSONL (one JSON object per line)
      // We need to parse each line as a separate JSON object
      const results = fileContent
        .trim()
        .split('\n')
        .filter(line => line.trim() !== '')
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch (e) {
            this.logger.error(`Failed to parse JSONL line ${index}: ${line}`);
            return null;
          }
        })
        .filter(item => item !== null);
      
      this.logger.log(`Successfully parsed ${results.length} results from batch ${batchId}`);
      
      return results;
    } catch (error) {
      this.logger.error(`Error retrieving batch results: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Generates Git commands based on a description
   * @param description User description of the changes needed
   * @returns String containing the generated Git commands
   */
  async generateGitCommands(prompt: string): Promise<string> {
    const systemPrompt = `You are a helpful assistant that generates Git commands based on user requests.
    You should ONLY output the Git commands, one per line, without any explanations or markdown formatting.
    Do not include any other text or formatting in your response.
    The commands should be ready to be executed directly in a terminal.
    If you need to install dependencies, ignore them as they are already installed.`;

    const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;
    return this.query(fullPrompt);
  }

  /**
   * Executes a series of Git commands
   * @param commands Array of commands to execute
   */
  async executeGitCommands(commands: string[]): Promise<void> {
    for (const command of commands) {
      try {
        this.validateCommand(command);
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
   * Retrieves the content of a file from the OpenAI API
   * @param fileId The ID of the file to retrieve
   * @returns The content of the file as a string, or null if an error occurred
   */
  async retrieveFileContent(fileId: string): Promise<string | null> {
    this.logger.debug(`Retrieving file content for file ID: ${fileId}`);
    
    try {
      // First, get the file info to ensure it exists
      const fileInfoResponse = await fetch(`https://api.openai.com/v1/files/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      
      if (!fileInfoResponse.ok) {
        const errorData = await fileInfoResponse.json();
        this.logger.error(`Failed to get file info: ${JSON.stringify(errorData)}`);
        return null;
      }
      
      // Now download the file content
      const fileContentResponse = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      
      if (!fileContentResponse.ok) {
        const errorData = await fileContentResponse.json();
        this.logger.error(`Failed to download file content: ${JSON.stringify(errorData)}`);
        return null;
      }
      
      // Get the content as text
      const fileContent = await fileContentResponse.text();
      this.logger.debug(`Successfully retrieved file content (${fileContent.length} bytes)`);
      
      return fileContent;
    } catch (error) {
      this.logger.error(`Error retrieving file content: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Cancels/deletes a batch from OpenAI's servers
   * This should be called after processing a batch to free up resources and avoid quota limitations
   * 
   * @param batchId The ID of the batch to cancel
   * @returns True if the batch was successfully cancelled, false otherwise
   */
  async cancelBatch(batchId: string): Promise<boolean> {
    if (!batchId) {
      this.standardLogger.error('Cannot cancel batch: No batch ID provided');
      return false;
    }
    
    try {
      // OpenAI API endpoint for deleting batches
      const url = `https://api.openai.com/v1/batches/${batchId}`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      
      if (response.ok) {
        this.standardLogger.log(`Successfully cancelled batch ${batchId}`);
        return true;
      } else {
        const errorBody = await response.text();
        this.standardLogger.error(`Failed to cancel batch ${batchId}: ${response.status} ${response.statusText} - ${errorBody}`);
        return false;
      }
    } catch (error) {
      this.standardLogger.error(`Error cancelling batch ${batchId}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
