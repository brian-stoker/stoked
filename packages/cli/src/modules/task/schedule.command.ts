import { Command, CommandRunner, Option } from 'nest-commander';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import { ConfigService } from '../config/config.service.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  createSchedulerService,
  validateCronExpression,
  parseFileAsTasks,
} from './task-helper.js';
import type { ScheduleTask } from './task-helper.js';
import { ScheduleInstantCommand } from './task.command.js';

@Injectable()
@Command({
  name: 'schedule',
  description: 'Schedule a prompt based task to run via the operating system\'s native scheduler',
  subCommands: [ScheduleInstantCommand],
})
export class ScheduleCommand extends CommandRunner {
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

  @Option({
    flags: '-l, --list',
    description: 'List all scheduled jobs',
  })
  parseList(): boolean {
    return true;
  }

  @Option({
    flags: '-r, --remove <jobname>',
    description: 'Remove a scheduled job by name',
  })
  parseRemove(val: string): string {
    return val;
  }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    try {
      // Create scheduler service
      const schedulerService = createSchedulerService(this.logger, this.configService);

      // Check for list flag
      if (options?.list) {
        const jobs = await schedulerService.listJobs();
        if (jobs.length === 0) {
          this.logger.log('No scheduled jobs found');
        } else {
          this.logger.log('Scheduled jobs:');
          jobs.forEach(job => this.logger.log(`- ${job}`));
        }
        return;
      }

      // Check for remove flag
      if (options?.remove) {
        const jobName = options.remove;
        this.logger.log(`Removing scheduled job: ${jobName}`);
        const success = await schedulerService.unscheduleJob(jobName);
        if (success) {
          this.logger.log(`Successfully removed job: ${jobName}`);
        } else {
          this.logger.error(`Failed to remove job: ${jobName}`);
        }
        return;
      }

      // Handle schedule command
      // New format: stoked schedule [job-name] <cron expression> <prompt files...>

      // Minimum parameters: job-name (optional) + 5 for cron + at least 1 file
      if (passedParams.length < 6) {
        this.logger.error('Invalid command. Usage: stoked schedule [job-name] <cron expression> <prompt files...>');
        this.logger.log('Example: stoked schedule "0 0 * * *" ./daily_prompt.txt');
        this.logger.log('Example with job name: stoked schedule my-job "0 0 * * *" ./daily_prompt.txt');
        this.logger.log('Example with multiple files: stoked schedule "0 0 * * *" ./task1.txt ./task2.txt ./task3.txt');
        this.logger.log('Example with JSON/YAML: stoked schedule "0 0 * * *" ./tasks.json');
        return;
      }

      let jobName: string;
      let cronExpression: string;
      let promptFilesStart: number;
      
      // Check if first parameter could be a job name (not a cron part)
      if (!/^\d+$/.test(passedParams[0]) && passedParams[0] !== '*') {
        // First parameter appears to be a job name
        jobName = passedParams[0];
        cronExpression = passedParams.slice(1, 6).join(' ');
        promptFilesStart = 6;
      } else {
        // No job name provided, generate one based on timestamp
        jobName = `scheduled_task_${Date.now()}`;
        cronExpression = passedParams.slice(0, 5).join(' ');
        promptFilesStart = 5;
      }

      // Validate cron expression
      if (!validateCronExpression(cronExpression)) {
        this.logger.error('Invalid cron expression. Please use the format: minute hour day-of-month month day-of-week');
        this.logger.log('Example: 0 0 * * * (every day at midnight)');
        return;
      }

      // Get prompt files
      const promptFiles = passedParams.slice(promptFilesStart);
      if (promptFiles.length === 0) {
        this.logger.error('No prompt files specified');
        return;
      }
      
      this.logger.debug(`Processing prompt files: ${promptFiles.join(', ')}`);

      // Validate files and collect tasks
      const allTasks: ScheduleTask[] = [];
      
      for (const filePath of promptFiles) {
        if (!fs.existsSync(filePath)) {
          this.logger.error(`File not found: ${filePath}`);
          return;
        }
        
        try {
          // Parse the file based on its type
          const tasks = await parseFileAsTasks(filePath);
          allTasks.push(...tasks);
          
          this.logger.debug(`Parsed ${tasks.length} task(s) from ${filePath}`);
        } catch (error) {
          this.logger.error(`Failed to parse file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
      }
      
      if (allTasks.length === 0) {
        this.logger.error('No valid tasks found in the specified files');
        return;
      }
      
      // Schedule the job
      this.logger.log(`Scheduling job "${jobName}" with ${allTasks.length} task(s) using cron expression: ${cronExpression}`);
      const success = await schedulerService.scheduleJob(cronExpression, allTasks, jobName);
      
      if (success) {
        this.logger.log(`Successfully scheduled job: ${jobName}`);
        this.logger.log(`The tasks will be executed in sequence according to schedule: ${cronExpression}`);
        
        // Log tasks summary
        this.logger.log('Tasks to be executed:');
        allTasks.forEach((task, index) => {
          this.logger.log(`  ${index + 1}. ${task.name}`);
        });
      } else {
        this.logger.error(`Failed to schedule job`);
      }
    } catch (error) {
      this.logger.error(`Failed to execute schedule command: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 