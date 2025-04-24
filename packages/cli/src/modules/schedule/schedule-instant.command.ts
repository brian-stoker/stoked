import { Command, CommandRunner, SubCommand } from 'nest-commander';
import { Inject, Injectable } from '@nestjs/common';
import { ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import { ConfigService } from '../config/config.service.js';
import { LlmService } from '../llm/llm.service.js';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import { parseFileAsTasks } from './schedule-helper.js';
import type { ScheduleTask, TaskInput } from './schedule-helper.js';
import fetch from 'node-fetch';

// Define interface for fetch input type
interface FetchInput {
  type: string;
  url: string;
  method?: string;
  headers?: Record<string, string>[];
  body?: any;
  processResults?: ((data: any) => any) | string;
}

@Injectable()
@SubCommand({
  name: 'instant',
  description: 'Run a task immediately without scheduling it'
})
export class ScheduleInstantCommand extends CommandRunner {
  private readonly logger: ThemeLogger;
  
  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(ThemeLogger) private readonly logger_: ThemeLogger,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    super();
    this.logger = this.logger_;
    this.logger.setTheme(THEMES[5]);
  }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    try {
      // Handle instant command
      // Format: stoked schedule instant <task file>
      
      if (passedParams.length < 1) {
        this.logger.error('No task file specified. Usage: stoked schedule instant <task-file>');
        this.logger.log('Example: stoked schedule instant ./task.ts');
        this.logger.log('Example: stoked schedule instant ./tasks.json');
        return;
      }
      
      // Get task file
      const taskFile = passedParams[0];
      if (!fs.existsSync(taskFile)) {
        this.logger.error(`File not found: ${taskFile}`);
        return;
      }
      
      this.logger.debug(`Processing task file: ${taskFile}`);
      
      try {
        // Parse the file based on its type
        const tasks = await parseFileAsTasks(taskFile);
        
        if (tasks.length === 0) {
          this.logger.error('No valid tasks found in the specified file');
          return;
        }
        
        this.logger.log(`Running ${tasks.length} task(s) from ${taskFile}`);
        
        // Store task outputs for reference by subsequent tasks
        const taskOutputs: Record<string, Record<string, any>> = {};
        
        // Execute tasks in sequence
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          try {
            this.logger.log(`Running task [${i+1}/${tasks.length}]: ${task.name}`);
            
            // Process inputs (fetch data and substitute in the prompt)
            const { processedInputs, placeholders } = await this.processInputs(task.inputs, taskOutputs);
            
            // Start with the original prompt
            let enhancedPrompt = task.prompt;
            
            // Replace placeholders in the prompt
            for (const [placeholder, value] of Object.entries(placeholders)) {
              enhancedPrompt = enhancedPrompt.replace(placeholder, value);
            }
            
            // Run the task using the LLM service
            const output = await this.llmService.query(enhancedPrompt);
            
            this.logger.log(`Task ${task.name} completed successfully`);
            
            // Extract and store outputs if defined
            if (task.outputs) {
              const extractedOutputs = this.extractOutputs(output, task.outputs);
              taskOutputs[task.name] = extractedOutputs;
              
              // Log outputs for debugging
              this.logger.debug(`Stored outputs for task ${task.name}: ${Object.keys(extractedOutputs).join(', ')}`);
            }
            
            // Display the output
            this.logger.log('Output:');
            console.log(output);
            console.log('\n');
            
          } catch (error) {
            this.logger.error(`Failed to execute task: ${task.name}`, error);
            // Continue to the next task even if the current one fails
          }
        }
        
        this.logger.log('All tasks completed.');
        
        // Write final outputs to a file for potential external use
        try {
          const outputsPath = path.join(path.dirname(taskFile), `${path.basename(taskFile, path.extname(taskFile))}_outputs.json`);
          fs.writeFileSync(outputsPath, JSON.stringify(taskOutputs, null, 2));
          this.logger.log(`Task outputs saved to: ${outputsPath}`);
        } catch (err) {
          this.logger.error('Failed to save task outputs:', err);
        }
        
      } catch (error) {
        this.logger.error(`Failed to parse file ${taskFile}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    } catch (error) {
      this.logger.error(`Failed to execute instant command: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Helper to process inputs, fetching data and preparing placeholders for prompt
  private async processInputs(inputs?: TaskInput[], taskOutputs?: Record<string, Record<string, any>>): Promise<{ processedInputs: TaskInput[] | undefined, placeholders: Record<string, string> }> {
    const placeholders: Record<string, string> = {};
    
    if (!inputs) return { processedInputs: inputs, placeholders };
    
    // Deep clone the inputs to avoid modifying the original
    const processedInputs = JSON.parse(JSON.stringify(inputs));
    
    // Process each input to resolve fetch operations and other references
    for (const input of processedInputs) {
      for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'object' && value !== null) {
          // If the value is an object with a type property of "fetch", it's a fetch operation
          const fetchInput = value as FetchInput;
          if (fetchInput.type === 'fetch') {
            try {
              this.logger.debug(`Fetching data from ${fetchInput.url}`);
              
              // Prepare fetch options
              const options: any = {
                method: fetchInput.method || 'GET',
              };
              
              // Add headers if specified
              if (fetchInput.headers) {
                options.headers = {};
                for (const header of fetchInput.headers) {
                  for (const [headerKey, headerValue] of Object.entries(header)) {
                    options.headers[headerKey] = headerValue;
                  }
                }
              }
              
              // Add body if specified
              if (fetchInput.body) {
                if (typeof fetchInput.body === 'object') {
                  options.body = JSON.stringify(fetchInput.body);
                  options.headers = options.headers || {};
                  options.headers['Content-Type'] = 'application/json';
                } else {
                  options.body = fetchInput.body;
                }
              }
              
              // Execute the fetch
              const response = await fetch(fetchInput.url, options);
              
              if (!response.ok) {
                throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
              }
              
              // Parse the response
              let responseData: any;
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
              } else {
                responseData = await response.text();
              }
              
              // Process the results if a processResults function is specified
              if (fetchInput.processResults) {
                if (typeof fetchInput.processResults === 'function') {
                  // Direct function reference
                  responseData = fetchInput.processResults(responseData);
                } else if (typeof fetchInput.processResults === 'string') {
                  // Function is provided as a string (from JavaScript files)
                  try {
                    // Create a function from the string
                    const processResultsFunc = new Function('$response', fetchInput.processResults);
                    responseData = processResultsFunc(responseData);
                  } catch (error) {
                    this.logger.error(`Failed to execute processResults function: ${error instanceof Error ? error.message : String(error)}`);
                  }
                }
              }
              
              // Set the placeholder value
              placeholders[`[inputs.${key}]`] = JSON.stringify(responseData, null, 2);
              
              // Update the input value with the fetched data
              input[key] = responseData;
            } catch (error) {
              this.logger.error(`Failed to fetch ${fetchInput.url}: ${error instanceof Error ? error.message : String(error)}`);
              // Set placeholder to indicate error
              placeholders[`[inputs.${key}]`] = `[Error fetching ${key}: ${error instanceof Error ? error.message : String(error)}]`;
            }
          }
        }
        
        // Handle references to previous task outputs
        if (typeof value === 'string' && value.startsWith('$outputs.') && taskOutputs) {
          const refPath = value.slice(9).split('.');
          if (refPath.length === 2) {
            const [taskName, outputName] = refPath;
            if (taskOutputs[taskName] && taskOutputs[taskName][outputName]) {
              input[key] = taskOutputs[taskName][outputName];
              // Also add to placeholders if needed
              if (!placeholders[`[inputs.${key}]`]) {
                placeholders[`[inputs.${key}]`] = JSON.stringify(taskOutputs[taskName][outputName], null, 2);
              }
            }
          }
        }
      }
    }
    
    return { processedInputs, placeholders };
  }
  
  // Helper to extract outputs from LLM response
  private extractOutputs(response: string, outputsDef: any[]): Record<string, any> {
    if (!outputsDef) return {};
    
    const outputs: Record<string, any> = {};
    
    // Parse each output definition and try to extract from the response
    for (const outputDef of outputsDef) {
      for (const [outputName, outputConfig] of Object.entries(outputDef)) {
        // For now, just use the full response for all output types
        // In the future, could implement type-specific extractors
        outputs[outputName] = response;
      }
    }
    
    return outputs;
  }
} 