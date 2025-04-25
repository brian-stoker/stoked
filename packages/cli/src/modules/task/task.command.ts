import * as fs from 'fs';
import * as path from 'path';
import { Command, CommandRunner, Option } from 'nest-commander';
import { Inject, Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { existsSync } from 'fs';
import { ConfigService } from '../config/config.service.js';
import { cwd } from 'process';
import { ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import { RepoService } from '../repo/repo.service.js';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import {
  parseFileAsTasks,
  type ScheduleTask,
  type TaskInput,
  type TaskOutput
} from './task-helper.js';

// Define interface for fetch input type
interface FetchInput {
  type: string;
  url: string;
  method?: string;
  headers?: Record<string, string>[];
  body?: any;
  processResults?: ((data: any) => any) | string;
}

interface TaskCommandOptions {
  list?: boolean;
  remove?: string;
}

interface Job {
  id: string;
  command: string;
  schedule: string;
}

@Injectable()
@Command({
  name: 'task',
  description: 'Run or schedule tasks from a file',
})
export class TaskCommand extends CommandRunner {
  private readonly logger: ThemeLogger;

  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ThemeLogger) private readonly logger_: ThemeLogger,
    @Inject(RepoService) private readonly repoService: RepoService,
  ) {
    super();
    this.logger = this.logger_;
    this.logger.setTheme(THEMES[5]);
  }

  @Option({
    flags: '-l, --list',
    description: 'List all scheduled tasks',
  })
  parseList(val: string) {
    return true;
  }

  @Option({
    flags: '-r, --remove <jobId>',
    description: 'Remove a scheduled task by job ID',
  })
  parseRemove(val: string) {
    return val;
  }

  async run(passedParams: string[], options?: TaskCommandOptions): Promise<void> {
    try {
      // Handle list operation
      if (options?.list) {
        await this.listScheduledTasks();
        return;
      }

      // Handle remove operation
      if (options?.remove) {
        await this.removeScheduledTask(options.remove);
        return;
      }

      // Check if first parameter is a cron expression
      const isCronExpression = passedParams.length >= 2 && await this.validateCronExpression(passedParams[0]);
      
      // Extract cron expression and file path
      const cronExpression = isCronExpression ? passedParams[0] : null;
      const filePath = isCronExpression ? passedParams[1] : passedParams[0];
      
      if (!filePath) {
        this.logger.error('No file path provided.');
        this.logger.log('Example: stoked task ./task.ts');
        this.logger.log('Example: stoked task ./tasks.json');
        this.logger.log('Example: stoked task "* * * * *" ./tasks.json  (with cron schedule)');
        return;
      }

      // Check if the file exists
      const fullPath = path.resolve(cwd(), filePath);
      if (!existsSync(fullPath)) {
        this.logger.error(`File not found: ${fullPath}`);
        return;
      }

      // Parse file and get tasks
      try {
        const tasks = await parseFileAsTasks(fullPath);
        
        if (tasks.length === 0) {
          this.logger.error('No valid tasks found in the specified file');
          return;
        }
        
        if (cronExpression) {
          // Schedule tasks with cron
          await this.scheduleTasks(cronExpression, tasks, fullPath);
        } else {
          // Run tasks immediately (instant mode)
          await this.runTasksImmediately(tasks);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to parse file ${fullPath}: ${errorMsg}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in task command: ${errorMsg}`);
    }
  }

  private async validateCronExpression(expression: string): Promise<boolean> {
    try {
      // Basic cron expression validation: check if it has 5 parts
      const parts = expression.trim().split(/\s+/);
      if (parts.length !== 5) {
        return false;
      }
      
      // Check if each part is either a number, *, or a valid cron pattern
      for (const part of parts) {
        // Skip valid patterns like */5, 1-5, 1,2,3, etc.
        if (part === '*' || /^(\d+|\*)(\/\d+)?$/.test(part) || 
            /^\d+\-\d+$/.test(part) || /^(\d+,)+\d+$/.test(part)) {
          continue;
        }
        return false;
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  private async listScheduledTasks(): Promise<void> {
    this.logger.log('Feature not yet implemented: Listing scheduled tasks');
    // TODO: Implement listing of scheduled tasks
  }

  private async removeScheduledTask(jobId: string): Promise<void> {
    this.logger.log('Feature not yet implemented: Removing scheduled task');
    // TODO: Implement removing scheduled tasks
  }
  
  private async scheduleTasks(cronExpression: string, tasks: ScheduleTask[], taskFile: string): Promise<void> {
    this.logger.log('Feature not yet implemented: Scheduling tasks');
    // TODO: Implement scheduling tasks with cron expression
  }

  private async runTasksImmediately(tasks: ScheduleTask[]): Promise<void> {
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
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to execute task: ${task.name}`, errorMsg);
        // Continue to the next task even if the current one fails
      }
    }
    
    this.logger.log('All tasks completed.');
  }

  // Helper to process inputs, fetching data and preparing placeholders for prompt
  private async processInputs(inputs?: TaskInput[], taskOutputs?: Record<string, Record<string, any>>): Promise<{ processedInputs: TaskInput[] | undefined, placeholders: Record<string, string> }> {
    const placeholders: Record<string, string> = {};
    
    if (!inputs) return { processedInputs: inputs, placeholders };
    
    // Deep clone the inputs to avoid modifying the original
    const processedInputs = this.cloneWithFunctions(inputs);
    
    // Process each input to resolve fetch operations and other references
    for (const input of processedInputs) {
      for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'object' && value !== null) {
          // If the value is an object with a type property of "fetch", it's a fetch operation
          const fetchInput = value as any;
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
              if (fetchInput.processResults && typeof fetchInput.processResults === 'function') {
                try {
                  responseData = fetchInput.processResults(responseData);
                } catch (callError) {
                  const errorMsg = callError instanceof Error ? callError.message : String(callError);
                  this.logger.debug(`Error processing results: ${errorMsg}`);
                }
              }
              
              // Store the processed data in the input
              input[key] = responseData;
              
              // Create a placeholder for this data
              const placeholderKey = `{{${key}}}`;
              placeholders[placeholderKey] = typeof responseData === 'object' 
                ? JSON.stringify(responseData, null, 2) 
                : String(responseData);
              
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              this.logger.error(`Error fetching data for input ${key}: ${errorMsg}`);
              
              // Store error information in the placeholder
              const placeholderKey = `{{${key}}}`;
              placeholders[placeholderKey] = `[Error: ${errorMsg}]`;
            }
          }
        }
      }
    }
    
    return { processedInputs, placeholders };
  }

  private cloneWithFunctions(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.cloneWithFunctions(item));
    }
    
    const cloned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'function') {
        cloned[key] = value; // Keep the function reference as is
      } else if (typeof value === 'object' && value !== null) {
        cloned[key] = this.cloneWithFunctions(value);
      } else {
        cloned[key] = value;
      }
    }
    
    return cloned;
  }

  private extractOutputs(response: string, outputsDef: TaskOutput[]): Record<string, any> {
    const outputs: Record<string, any> = {};
    
    // For now, just store the full response for each output
    for (const outputDef of outputsDef) {
      for (const [outputName, outputConfig] of Object.entries(outputDef)) {
        outputs[outputName] = response;
      }
    }
    
    return outputs;
  }
} 