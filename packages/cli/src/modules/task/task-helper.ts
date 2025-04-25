import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ThemeLogger } from '../../logger/theme.logger.js';
import { ConfigService } from '../config/config.service.js';
import { execSync } from 'child_process';

// Define the task structure
export interface TaskInput {
  [key: string]: any;
}

export interface TaskOutput {
  [key: string]: {
    type: string;
    [key: string]: any;
  };
}

export interface ScheduleTask {
  name: string;
  prompt: string;
  inputs?: TaskInput[];
  outputs?: TaskOutput[];
}

// Define the scheduler service interface
export interface SchedulerService {
  scheduleJob(cronExpression: string, tasks: ScheduleTask[], jobName: string): Promise<boolean>;
  unscheduleJob(jobName: string): Promise<boolean>;
  listJobs(): Promise<string[]>;
}

// Base class for scheduler services
abstract class BaseSchedulerService implements SchedulerService {
  constructor(
    protected readonly logger: ThemeLogger,
    protected readonly configService: ConfigService,
  ) {}

  abstract scheduleJob(cronExpression: string, tasks: ScheduleTask[], jobName: string): Promise<boolean>;
  abstract unscheduleJob(jobName: string): Promise<boolean>;
  abstract listJobs(): Promise<string[]>;

  protected getJobScriptPath(jobName: string): string {
    const scriptsDir = path.join(this.getConfigDir(), 'scheduler');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }
    return path.join(scriptsDir, `${jobName}.js`);
  }

  protected getConfigDir(): string {
    // Use the homedir-based path since ConfigService.configDir is private
    return path.join(os.homedir(), '.stoked');
  }

  protected createJobScript(scriptPath: string, tasksPath: string): void {
    const scriptContent = `#!/usr/bin/env node
const { execSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');
const path = require('path');
const os = require('os');

// Determine the CLI path dynamically
function getCLIPath() {
  try {
    // Try using which/where to find the stoked CLI
    const cmd = os.platform() === 'win32' ? 'where stoked' : 'which stoked';
    return execSync(cmd).toString().trim();
  } catch (error) {
    // Fallback to global npm bin + 'stoked'
    try {
      const npmBin = execSync('npm bin -g').toString().trim();
      return path.join(npmBin, 'stoked');
    } catch (e) {
      throw new Error('Could not find the stoked CLI. Please make sure it\\'s installed globally.');
    }
  }
}

// Store task outputs in this object for reference by subsequent tasks
const taskOutputs = {};

// Helper to process inputs, replacing references to previous outputs
function processInputs(inputs, taskOutputs) {
  if (!inputs) return inputs;
  
  // Deep clone the inputs to avoid modifying the original
  const processedInputs = JSON.parse(JSON.stringify(inputs));
  
  // Recursive function to replace references
  function replaceReferences(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => replaceReferences(item));
    }
    
    const result = {};
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
  }
  
  return processedInputs.map(input => replaceReferences(input));
}

// Helper to extract outputs from LLM response
function extractOutputs(response, outputsDef) {
  if (!outputsDef) return {};
  
  const outputs = {};
  
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

async function main() {
  const tasksPath = "${tasksPath}";
  if (!existsSync(tasksPath)) {
    console.error(\`Tasks file not found: \${tasksPath}\`);
    process.exit(1);
  }

  let tasksContent;
  try {
    tasksContent = JSON.parse(readFileSync(tasksPath, 'utf-8'));
  } catch (error) {
    console.error(\`Failed to parse tasks file: \${error.message}\`);
    process.exit(1);
  }
  
  const cliPath = getCLIPath();
  
  // Execute tasks in sequence
  for (let i = 0; i < tasksContent.tasks.length; i++) {
    const task = tasksContent.tasks[i];
    try {
      console.log(\`Running scheduled task [\${i+1}/\${tasksContent.tasks.length}]: \${task.name}\`);
      
      // Process inputs (replace references to previous outputs)
      const processedInputs = processInputs(task.inputs, taskOutputs);
      
      // Add processed inputs to the prompt if they exist
      let enhancedPrompt = task.prompt;
      if (processedInputs && processedInputs.length > 0) {
        enhancedPrompt += '\\n\\nInputs:\\n' + JSON.stringify(processedInputs, null, 2);
      }
      
      // Run the task and capture output
      const output = execSync(
        \`"\${cliPath}" prompt "\${enhancedPrompt.replace(/"/g, '\\\\"')}"\`, 
        { encoding: 'utf-8' }
      );
      
      console.log(\`Task \${task.name} completed successfully\`);
      
      // Extract and store outputs if defined
      if (task.outputs) {
        const extractedOutputs = extractOutputs(output, task.outputs);
        taskOutputs[task.name] = extractedOutputs;
        
        // Log outputs for debugging
        console.log(\`Stored outputs for task \${task.name}: \${Object.keys(extractedOutputs).join(', ')}\`);
      }
    } catch (error) {
      console.error(\`Failed to execute task: \${task.name}\`, error);
      // Continue to the next task even if the current one fails
    }
  }
  
  console.log('All scheduled tasks completed.');
  
  // Write final outputs to a file for potential external use
  try {
    const outputsPath = path.join(path.dirname(tasksPath), \`\${path.basename(tasksPath, path.extname(tasksPath))}_outputs.json\`);
    writeFileSync(outputsPath, JSON.stringify(taskOutputs, null, 2));
    console.log(\`Task outputs saved to: \${outputsPath}\`);
  } catch (err) {
    console.error('Failed to save task outputs:', err);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
`;
    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, '755'); // Make executable
  }
}

// Linux scheduler service using crontab
class LinuxSchedulerService extends BaseSchedulerService {
  async scheduleJob(cronExpression: string, tasks: ScheduleTask[], jobName: string): Promise<boolean> {
    try {
      const scriptPath = this.getJobScriptPath(jobName);
      const tasksPath = storeTasks(tasks, jobName);
      this.createJobScript(scriptPath, tasksPath);

      // Export the current crontab
      const currentCrontab = execSync('crontab -l 2>/dev/null || echo ""').toString();
      
      // Check if job already exists
      const jobPattern = new RegExp(`# STOKED_JOB_${jobName}$`);
      if (currentCrontab.match(jobPattern)) {
        // Remove the existing job first
        await this.unscheduleJob(jobName);
      }
      
      // Add the new job
      const newJob = `${cronExpression} ${scriptPath} # STOKED_JOB_${jobName}`;
      const updatedCrontab = currentCrontab.trim() ? `${currentCrontab.trim()}\n${newJob}\n` : `${newJob}\n`;
      
      // Write the updated crontab
      fs.writeFileSync('/tmp/stoked_crontab', updatedCrontab);
      execSync('crontab /tmp/stoked_crontab');
      fs.unlinkSync('/tmp/stoked_crontab');
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to schedule job: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  async unscheduleJob(jobName: string): Promise<boolean> {
    try {
      // Export the current crontab
      const currentCrontab = execSync('crontab -l 2>/dev/null || echo ""').toString();
      
      // Remove the job
      const jobPattern = new RegExp(`.*# STOKED_JOB_${jobName}$`, 'gm');
      const updatedCrontab = currentCrontab.replace(jobPattern, '').replace(/\n\n+/g, '\n').trim();
      
      // Write the updated crontab
      fs.writeFileSync('/tmp/stoked_crontab', updatedCrontab + (updatedCrontab ? '\n' : ''));
      execSync('crontab /tmp/stoked_crontab');
      fs.unlinkSync('/tmp/stoked_crontab');
      
      // Also clean up the tasks file
      cleanupTasksFile(jobName);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to unschedule job: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  async listJobs(): Promise<string[]> {
    try {
      const currentCrontab = execSync('crontab -l 2>/dev/null || echo ""').toString();
      const jobPattern = /.*# STOKED_JOB_(.+)$/gm;
      const jobs: string[] = [];
      
      let match;
      while ((match = jobPattern.exec(currentCrontab)) !== null) {
        jobs.push(match[1]);
      }
      
      return jobs;
    } catch (error) {
      this.logger.error(`Failed to list jobs: ${error instanceof Error ? error.message : 'unknown error'}`);
      return [];
    }
  }
}

// macOS scheduler service using launchd
class MacOSSchedulerService extends BaseSchedulerService {
  private getLaunchAgentDir(): string {
    const launchAgentDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    if (!fs.existsSync(launchAgentDir)) {
      fs.mkdirSync(launchAgentDir, { recursive: true });
    }
    return launchAgentDir;
  }

  private getPlistPath(jobName: string): string {
    return path.join(this.getLaunchAgentDir(), `com.stoked.schedule.${jobName}.plist`);
  }

  async scheduleJob(cronExpression: string, tasks: ScheduleTask[], jobName: string): Promise<boolean> {
    try {
      const scriptPath = this.getJobScriptPath(jobName);
      const tasksPath = storeTasks(tasks, jobName);
      this.createJobScript(scriptPath, tasksPath);

      // Parse cron expression to create calendar intervals for launchd
      const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.split(' ');
      
      // Create the plist content
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.stoked.schedule.${jobName}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${scriptPath}</string>
  </array>
  <key>StartCalendarInterval</key>
  ${this.buildCalendarIntervals(minute, hour, dayOfMonth, month, dayOfWeek)}
  <key>StandardOutPath</key>
  <string>${path.join(this.getConfigDir(), 'logs', `${jobName}.log`)}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(this.getConfigDir(), 'logs', `${jobName}.error.log`)}</string>
</dict>
</plist>`;

      // Ensure logs directory exists
      const logsDir = path.join(this.getConfigDir(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      // Write the plist file
      const plistPath = this.getPlistPath(jobName);
      fs.writeFileSync(plistPath, plistContent);
      
      // Unload any existing job with the same name
      try {
        if (fs.existsSync(plistPath)) {
          execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
        }
      } catch (e) {
        // Ignore errors if the job wasn't loaded
      }
      
      // Load the job
      execSync(`launchctl load "${plistPath}"`);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to schedule job on macOS: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  private buildCalendarIntervals(minute: string, hour: string, dayOfMonth: string, month: string, dayOfWeek: string): string {
    // Convert the cron expression to launchd calendar intervals
    // This is a simplified implementation that handles basic cases
    
    if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      // Every minute
      return `<dict>
    <key>Minute</key>
    <integer>0</integer>
    <key>Hour</key>
    <integer>0</integer>
  </dict>`;
    }
    
    // For specific time of day
    if (minute !== '*' && hour !== '*') {
      return `<dict>
    <key>Minute</key>
    <integer>${minute}</integer>
    <key>Hour</key>
    <integer>${hour}</integer>
  </dict>`;
    }
    
    // For daily at specific time
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `<dict>
    <key>Minute</key>
    <integer>${minute}</integer>
    <key>Hour</key>
    <integer>${hour}</integer>
  </dict>`;
    }
    
    // Default case with some reasonable values
    return `<dict>
    <key>Minute</key>
    <integer>${minute === '*' ? '0' : minute}</integer>
    <key>Hour</key>
    <integer>${hour === '*' ? '0' : hour}</integer>
  </dict>`;
  }

  async unscheduleJob(jobName: string): Promise<boolean> {
    try {
      const plistPath = this.getPlistPath(jobName);
      
      if (fs.existsSync(plistPath)) {
        // Unload the job
        execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
        
        // Remove the plist file
        fs.unlinkSync(plistPath);
      }
      
      // Also clean up the tasks file
      cleanupTasksFile(jobName);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to unschedule job on macOS: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  async listJobs(): Promise<string[]> {
    try {
      const launchAgentDir = this.getLaunchAgentDir();
      const files = fs.readdirSync(launchAgentDir);
      const stokedFiles = files.filter(file => file.startsWith('com.stoked.schedule.') && file.endsWith('.plist'));
      
      return stokedFiles.map(file => {
        const match = file.match(/com\.stoked\.schedule\.(.+)\.plist/);
        return match ? match[1] : '';
      }).filter(Boolean);
    } catch (error) {
      this.logger.error(`Failed to list jobs on macOS: ${error instanceof Error ? error.message : 'unknown error'}`);
      return [];
    }
  }
}

// Windows scheduler service using Task Scheduler
class WindowsSchedulerService extends BaseSchedulerService {
  async scheduleJob(cronExpression: string, tasks: ScheduleTask[], jobName: string): Promise<boolean> {
    try {
      const scriptPath = this.getJobScriptPath(jobName);
      const tasksPath = storeTasks(tasks, jobName);
      this.createJobScript(scriptPath, tasksPath);
      
      // Convert cron to Task Scheduler format
      const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.split(' ');
      
      // Create the task XML file
      const taskXml = this.createTaskXml(jobName, scriptPath, minute, hour, dayOfMonth, month, dayOfWeek);
      const tempXmlPath = path.join(os.tmpdir(), `stoked_task_${jobName}.xml`);
      fs.writeFileSync(tempXmlPath, taskXml);
      
      // Delete any existing task with the same name
      try {
        execSync(`schtasks /Delete /TN "Stoked\\${jobName}" /F 2>nul`);
      } catch (e) {
        // Ignore errors if the task doesn't exist
      }
      
      // Create the task
      execSync(`schtasks /Create /XML "${tempXmlPath}" /TN "Stoked\\${jobName}" /F`);
      
      // Clean up
      fs.unlinkSync(tempXmlPath);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to schedule job on Windows: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  private createTaskXml(jobName: string, scriptPath: string, minute: string, hour: string, 
    dayOfMonth: string, month: string, dayOfWeek: string): string {
    // This is a simplified version and doesn't handle all cron expressions
    let triggerXml = '';
    
    // Daily trigger
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      triggerXml = `
      <Triggers>
        <CalendarTrigger>
          <StartBoundary>2023-01-01T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00</StartBoundary>
          <ScheduleByDay>
            <DaysInterval>1</DaysInterval>
          </ScheduleByDay>
        </CalendarTrigger>
      </Triggers>`;
    } 
    // Weekly trigger
    else if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
      const daysOfWeek = this.parseDaysOfWeek(dayOfWeek);
      triggerXml = `
      <Triggers>
        <CalendarTrigger>
          <StartBoundary>2023-01-01T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00</StartBoundary>
          <ScheduleByWeek>
            <WeeksInterval>1</WeeksInterval>
            <DaysOfWeek>
              ${daysOfWeek}
            </DaysOfWeek>
          </ScheduleByWeek>
        </CalendarTrigger>
      </Triggers>`;
    }
    // Default daily trigger
    else {
      triggerXml = `
      <Triggers>
        <CalendarTrigger>
          <StartBoundary>2023-01-01T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00</StartBoundary>
          <ScheduleByDay>
            <DaysInterval>1</DaysInterval>
          </ScheduleByDay>
        </CalendarTrigger>
      </Triggers>`;
    }
    
    return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Stoked scheduled job: ${jobName}</Description>
  </RegistrationInfo>
  ${triggerXml}
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT72H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>node</Command>
      <Arguments>"${scriptPath.replace(/\\/g, '\\\\')}"</Arguments>
    </Exec>
  </Actions>
</Task>`;
  }

  private parseDaysOfWeek(dayOfWeek: string): string {
    // Convert cron day of week to Task Scheduler format
    const daysMap: Record<string, string> = {
      '0': 'Sunday',
      '1': 'Monday',
      '2': 'Tuesday',
      '3': 'Wednesday',
      '4': 'Thursday',
      '5': 'Friday',
      '6': 'Saturday',
      '7': 'Sunday'
    };
    
    const days = dayOfWeek.split(',');
    let result = '';
    
    for (const day of days) {
      const mappedDay = daysMap[day];
      if (mappedDay) {
        result += `<${mappedDay}/>\n`;
      }
    }
    
    return result;
  }

  async unscheduleJob(jobName: string): Promise<boolean> {
    try {
      // Delete the task
      try {
        execSync(`schtasks /Delete /TN "Stoked\\${jobName}" /F 2>nul`);
      } catch (e) {
        // Ignore errors if the task doesn't exist
      }
      
      // Also clean up the tasks file
      cleanupTasksFile(jobName);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to unschedule job on Windows: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  async listJobs(): Promise<string[]> {
    try {
      // Get all Stoked tasks
      const output = execSync('schtasks /Query /TN "Stoked\\" /FO LIST /V 2>nul').toString();
      const tasks = output.split('\n').filter(line => line.startsWith('TaskName:')).map(line => {
        const taskName = line.replace('TaskName:', '').trim();
        return taskName.replace('Stoked\\', '');
      });
      
      return tasks;
    } catch (error) {
      this.logger.error(`Failed to list jobs on Windows: ${error instanceof Error ? error.message : 'unknown error'}`);
      return [];
    }
  }
}

// Factory to create the appropriate scheduler service based on the OS
export function createSchedulerService(logger: ThemeLogger, configService: ConfigService): SchedulerService {
  const platform = os.platform();
  
  if (platform === 'linux') {
    return new LinuxSchedulerService(logger, configService);
  } else if (platform === 'darwin') {
    return new MacOSSchedulerService(logger, configService);
  } else if (platform === 'win32') {
    return new WindowsSchedulerService(logger, configService);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Utility function to validate a cron expression
export function validateCronExpression(cronExpression: string): boolean {
  // Basic validation - ensure we have 5 space-separated values
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }
  
  // Additional validation could be added here
  return true;
}

// Function to get the tasks directory path
function getTasksDir(): string {
  const tasksDir = path.join(os.homedir(), '.stoked', 'tasks');
  if (!fs.existsSync(tasksDir)) {
    fs.mkdirSync(tasksDir, { recursive: true });
  }
  return tasksDir;
}

// Function to store tasks in a JSON file
export function storeTasks(tasks: ScheduleTask[], jobName: string): string {
  const tasksDir = getTasksDir();
  const tasksPath = path.join(tasksDir, `${jobName}.json`);
  
  fs.writeFileSync(tasksPath, JSON.stringify({ tasks }, null, 2));
  
  return tasksPath;
}

// Function to clean up tasks file
function cleanupTasksFile(jobName: string): void {
  const tasksPath = path.join(getTasksDir(), `${jobName}.json`);
  if (fs.existsSync(tasksPath)) {
    fs.unlinkSync(tasksPath);
  }
}

// Function to parse text file as a task
export function parseTextFileAsTask(filePath: string): ScheduleTask {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      name: path.basename(filePath, path.extname(filePath)),
      prompt: content.trim()
    };
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to parse JSON file as tasks
export function parseJsonFileAsTasks(filePath: string): ScheduleTask[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    if (!data.tasks || !Array.isArray(data.tasks)) {
      throw new Error(`Invalid JSON format in ${filePath}. Expected a 'tasks' array.`);
    }
    
    return data.tasks.map((task: any) => {
      if (!task.name || !task.prompt) {
        throw new Error(`Invalid task in ${filePath}. Each task must have 'name' and 'prompt' properties.`);
      }
      
      const parsedTask: ScheduleTask = {
        name: task.name,
        prompt: task.prompt
      };
      
      // Add inputs if present
      if (task.inputs && Array.isArray(task.inputs)) {
        parsedTask.inputs = task.inputs;
      }
      
      // Add outputs if present
      if (task.outputs && Array.isArray(task.outputs)) {
        parsedTask.outputs = task.outputs;
      }
      
      return parsedTask;
    });
  } catch (error) {
    throw new Error(`Failed to parse JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to parse YAML file as tasks
export function parseYamlFileAsTasks(filePath: string): ScheduleTask[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = yaml.load(content) as any;
    
    if (!data.tasks || !Array.isArray(data.tasks)) {
      throw new Error(`Invalid YAML format in ${filePath}. Expected a 'tasks' array.`);
    }
    
    return data.tasks.map((task: any) => {
      if (!task.name || !task.prompt) {
        throw new Error(`Invalid task in ${filePath}. Each task must have 'name' and 'prompt' properties.`);
      }
      
      const parsedTask: ScheduleTask = {
        name: task.name,
        prompt: task.prompt
      };
      
      // Add inputs if present
      if (task.inputs && Array.isArray(task.inputs)) {
        parsedTask.inputs = task.inputs;
      }
      
      // Add outputs if present
      if (task.outputs && Array.isArray(task.outputs)) {
        parsedTask.outputs = task.outputs;
      }
      
      return parsedTask;
    });
  } catch (error) {
    throw new Error(`Failed to parse YAML file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to parse TypeScript file as tasks
export function parseTypeScriptFileAsTasks(filePath: string): ScheduleTask[] {
  try {
    // Create a temporary directory for compiling the TypeScript file
    const tempDir = path.join(os.tmpdir(), `stoked-ts-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Copy the file to the temp directory
    const tempFilePath = path.join(tempDir, path.basename(filePath));
    fs.copyFileSync(filePath, tempFilePath);
    
    // Look for tsconfig.json in the same directory or parent directories
    let currentDir = path.dirname(filePath);
    let tsconfigPath = '';
    
    while (currentDir !== path.parse(currentDir).root) {
      const possibleTsconfig = path.join(currentDir, 'tsconfig.json');
      if (fs.existsSync(possibleTsconfig)) {
        tsconfigPath = possibleTsconfig;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
    
    // Compile the TypeScript file
    try {
      if (tsconfigPath) {
        // Copy tsconfig.json to temp directory
        const tempTsconfig = path.join(tempDir, 'tsconfig.json');
        fs.copyFileSync(tsconfigPath, tempTsconfig);
        execSync(`npx tsc -p ${tempTsconfig}`, { cwd: tempDir });
      } else {
        // Use default compilation options
        execSync(`npx tsc --target ES2020 --module commonjs --moduleResolution node --esModuleInterop ${tempFilePath}`, { cwd: tempDir });
      }
    } catch (error) {
      throw new Error(`Failed to compile TypeScript file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Get the compiled JavaScript file path
    const jsFilePath = tempFilePath.replace('.ts', '.js');
    
    if (!fs.existsSync(jsFilePath)) {
      throw new Error(`Failed to compile TypeScript file ${filePath}: JavaScript output not found`);
    }
    
    // Load the compiled module
    try {
      // Clear require cache to ensure fresh load
      delete require.cache[require.resolve(jsFilePath)];
      
      // Import the module
      const taskModule = require(jsFilePath);
      const taskConfig = taskModule.default || taskModule;
      
      if (!taskConfig.tasks || !Array.isArray(taskConfig.tasks)) {
        throw new Error(`Invalid TypeScript module format in ${filePath}. Expected an exported object with a 'tasks' array.`);
      }
      
      // Validate and format tasks
      const tasks = taskConfig.tasks.map((task: any, index: number) => {
        if (!task.prompt) {
          throw new Error(`Invalid task at index ${index} in ${filePath}. Each task must have a 'prompt' property.`);
        }
        
        const parsedTask: ScheduleTask = {
          name: task.name || `task_${index}`,
          prompt: task.prompt
        };
        
        // Add inputs if present
        if (task.inputs && Array.isArray(task.inputs)) {
          parsedTask.inputs = task.inputs;
        }
        
        // Add outputs if present
        if (task.outputs) {
          // Convert single output to array format if needed
          if (!Array.isArray(task.outputs)) {
            parsedTask.outputs = [{ output: task.outputs }];
          } else {
            parsedTask.outputs = task.outputs;
          }
        }
        
        return parsedTask;
      });
      
      // Clean up temporary files
      fs.rmSync(tempDir, { recursive: true, force: true });
      
      return tasks;
    } catch (error) {
      // Clean up temporary files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
      
      throw new Error(`Failed to load TypeScript module ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    throw new Error(`Failed to parse TypeScript file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to parse JavaScript file as tasks
export async function parseJavaScriptFileAsTasks(filePath: string): Promise<ScheduleTask[]> {
  try {
    // Use a file URL for dynamic import
    const fileUrl = 'file://' + path.resolve(filePath);
    
    try {
      // Import the module using dynamic import
      const taskModule = await import(fileUrl);
      const taskConfig = taskModule.default || taskModule;
      
      if (!taskConfig.tasks || !Array.isArray(taskConfig.tasks)) {
        throw new Error(`Invalid JavaScript module format in ${filePath}. Expected an exported object with a 'tasks' array.`);
      }
      
      // Validate and format tasks
      const tasks = taskConfig.tasks.map((task: any, index: number) => {
        if (!task.prompt) {
          throw new Error(`Invalid task at index ${index} in ${filePath}. Each task must have a 'prompt' property.`);
        }
        
        const parsedTask: ScheduleTask = {
          name: task.name || `task_${index}`,
          prompt: task.prompt
        };
        
        // Add inputs if present
        if (task.inputs && Array.isArray(task.inputs)) {
          parsedTask.inputs = task.inputs;
        }
        
        // Add outputs if present
        if (task.outputs) {
          parsedTask.outputs = task.outputs;
        } 
        // Handle single output property (convert to outputs array)
        else if (task.output) {
          parsedTask.outputs = [{ output: task.output }];
        }
        
        return parsedTask;
      });
      
      return tasks;
    } catch (error) {
      throw new Error(`Failed to load JavaScript module ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    throw new Error(`Failed to parse JavaScript file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to identify file type and parse it
export async function parseFileAsTasks(filePath: string): Promise<ScheduleTask[]> {
  try {
    // Check if the file exists and is a file (not a directory)
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`${filePath} is not a file`);
    }
    
    const extension = path.extname(filePath).toLowerCase();
    
    if (extension === '.json') {
      return parseJsonFileAsTasks(filePath);
    } else if (extension === '.yml' || extension === '.yaml') {
      return parseYamlFileAsTasks(filePath);
    } else if (extension === '.ts') {
      return parseTypeScriptFileAsTasks(filePath);
    } else if (extension === '.js') {
      return await parseJavaScriptFileAsTasks(filePath);
    } else {
      // First try to parse as a text file with a single prompt
      try {
        return [parseTextFileAsTask(filePath)];
      } catch (textError) {
        // If text parsing fails, try JavaScript as a fallback
        try {
          return await parseJavaScriptFileAsTasks(filePath);
        } catch (jsError) {
          // If both fail, report the original text parsing error
          throw textError;
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to parse file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Export the processInputs function that is used by task.command.ts
export async function processInputs(inputs: TaskInput[] | undefined, taskOutputs?: Record<string, Record<string, any>>): Promise<TaskInput[] | undefined> {
  if (!inputs) return inputs;
  
  // Deep clone the inputs to avoid modifying the original
  const processedInputs = JSON.parse(JSON.stringify(inputs));
  
  // Recursive function to replace references
  function replaceReferences(obj: any): any {
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
          if (taskOutputs && taskOutputs[taskName] && taskOutputs[taskName][outputName]) {
            result[key] = taskOutputs[taskName][outputName];
            continue;
          }
        }
      }
      
      // Regular object or non-reference value
      result[key] = replaceReferences(value);
    }
    
    return result;
  }
  
  return processedInputs.map((input: TaskInput) => replaceReferences(input));
} 