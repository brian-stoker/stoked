import { Command, CommandRunner, SubCommand } from 'nest-commander';
import { Inject, Injectable } from '@nestjs/common';
import { ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import { ConfigService } from '../config/config.service.js';
import { LlmService } from '../llm/llm.service.js';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import { parseFileAsTasks } from './task-helper.js';
import type { ScheduleTask, TaskInput } from './task-helper.js';

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
            
            // Process inputs (replace references to previous outputs)
            const processedInputs = this.processInputs(task.inputs, taskOutputs);
            
            // Add processed inputs to the prompt if they exist
            let enhancedPrompt = task.prompt;
            if (processedInputs && processedInputs.length > 0) {
              enhancedPrompt += '\n\nInputs:\n' + JSON.stringify(processedInputs, null, 2);
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
  
  // Helper to process inputs, replacing references to previous outputs
  private processInputs(inputs?: TaskInput[], taskOutputs?: Record<string, Record<string, any>>): TaskInput[] | undefined {
    if (!inputs || !taskOutputs) return inputs;
    
    // Deep clone the inputs to avoid modifying the original
    const processedInputs = JSON.parse(JSON.stringify(inputs));
    
    // Recursive function to replace references
    const replaceReferences = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(item => replaceReferences(item));
      }
      
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Check if this is a reference string like "$outputs.taskName.outputName"
        if (typeof value === 'string' && value.startsWith('$outputs.')) {
          const refPath = value.slice(9).split('.');
          if (refPath.length === 2) {
            const [taskName, outputName] = refPath;
            if (taskOutputs[taskName] && taskOutputs[taskName][outputName]) {
              result[key] = taskOutputs[taskName][outputName];
              continue;
            }
          }
        }
        
        // Regular object or non-reference value
        result[key] = replaceReferences(value);
      }
      
      return result;
    };
    
    return processedInputs.map((input: TaskInput) => replaceReferences(input));
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