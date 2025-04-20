import { exec, spawn, SpawnOptions } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';

// --- Get current directory in ES module scope ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..', '..', '..'); // Adjust based on actual structure
const cliEntry = join(projectRoot, 'packages', 'cli', 'dist', 'main.js');
// const cliEntry = 'dist/main.js'; // Relative path might be tricky depending on cwd

console.log(`[processCmd] Resolved projectRoot: ${projectRoot}`);
console.log(`[processCmd] Resolved cliEntry: ${cliEntry}`);
// -----------------------------------------------

// --- Type for logging --- 
interface ExecutedCommandEntry {
  tool: 'spawn' | 'execSync';
  command: string; // The executable ('stoked')
  args?: string[]; // For spawn
  commandString?: string; // For execSync
}
const JSON_FILENAME = 'executed_commands.json';
// ------------------------

const execAsync = promisify(exec);

// Execute the compiled entry point directly with node
const cliEntryPoint = path.resolve(__dirname, '..', '..', 'dist', 'main.js'); 

// --- Helper to log execution to JSON --- 
function logExecutedCommand(
  tool: 'spawn' | 'execSync',
  command: string, // Changed from CommandInfo object
  cwd: string,
  artifactDir: string,
) {
  console.log(`[processCmd] logExecutedCommand called for tool: ${tool}`);
  console.log(`[processCmd] Artifact dir: ${artifactDir}`);
  if (!artifactDir) {
    console.error('[processCmd] Artifact directory is not defined.');
    return;
  }

  const filePath = path.join(artifactDir, JSON_FILENAME);
  console.log(`[processCmd] Target log file path: ${filePath}`); // Log target file path
  const logEntry: ExecutedCommandEntry = { tool, command };

  try {
    let entries: ExecutedCommandEntry[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        entries = JSON.parse(fileContent);
        if (!Array.isArray(entries)) {
           console.warn(`[processCmd] WARN: Content of ${filePath} is not an array. Resetting.`);
           entries = []; 
        }
      } catch (parseError) {
        console.warn(`[processCmd] WARN: Could not parse existing ${filePath}. Starting fresh. Error:`, parseError);
        entries = [];
      }
    }
    entries.push(logEntry);
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
    console.log(`[processCmd] Successfully wrote to ${filePath}`); // Log success
  } catch (error) {
    console.error(`[processCmd] ERROR: Failed to write to ${filePath}:`, error);
  }
}
// ---------------------------------------

// execCmd now takes the main command (e.g., 'analyze') and optional args string
export async function execCmd(mainCommand?: string, argsString?: string) {
  const commandParts = ['node', cliEntryPoint];
  if (mainCommand) {
    commandParts.push(mainCommand);
    // Split args more carefully, handling `option=value`
    if (argsString) {
       const splitArgs = argsString.split(' ').filter(arg => arg !== '');
       const finalArgs: string[] = [];
       splitArgs.forEach(arg => {
         if (arg.includes('=')) {
           finalArgs.push(...arg.split('=', 2)); // Split into two parts max
         } else {
           finalArgs.push(arg);
         }
       });
       commandParts.push(...finalArgs);
    }
  }
  const commandString = commandParts.join(' ');
  
  logExecutedCommand('execSync', commandString, process.cwd(), process.env.CURRENT_E2E_ARTIFACT_DIR || process.cwd());
  return execAsync(commandString);
}

// spawnCmd now takes the main command and optional args string
export function spawnCmd(
  commandWithArgs: string, // e.g., "analyze --repo-path=./ --include=*.js"
  cwd: string,
  env?: NodeJS.ProcessEnv,
  onData?: (data: string) => void,
  onError?: (data: string) => void,
  onClose?: (code: number | null) => void,
) {
  const artifactDir =
    process.env.CURRENT_E2E_ARTIFACT_DIR || join(cwd, '.stoked-artifacts'); // Fallback
  logExecutedCommand('spawn', commandWithArgs, cwd, artifactDir);

  const parts = commandWithArgs.trim().split(/\s+/);
  const commandName = parts[0]; // e.g., "analyze"
  const commandArgs = parts.slice(1); // e.g., ["--repo-path=./", "--include=*.js"]

  const nodeArgs = [cliEntry, commandName, ...commandArgs]; // Prepend commandName

  console.log(`[processCmd] Spawning: node ${nodeArgs.join(' ')} in ${cwd}`);

  // Ensure STOKED_CONFIG_DIR is set for the child process
  const defaultStokedConfigDir = join(cwd, '.stoked');
  const finalEnv = {
    ...process.env, // Inherit parent env
    ...env, // User-provided env vars override parent
    // Override if not set or set STOKED_CONFIG_DIR if not present
    STOKED_CONFIG_DIR:
      env?.STOKED_CONFIG_DIR ??
      process.env.STOKED_CONFIG_DIR ??
      defaultStokedConfigDir,
    CURRENT_E2E_ARTIFACT_DIR: artifactDir, // Pass artifact dir for potential nested calls
  };
  console.log(
    `[processCmd] Using STOKED_CONFIG_DIR: ${finalEnv.STOKED_CONFIG_DIR}`,
  );

  // Ensure ComSpec is set, especially for Windows + shell: true
  if (process.platform === 'win32' && !(finalEnv as NodeJS.ProcessEnv).ComSpec) {
    (finalEnv as NodeJS.ProcessEnv).ComSpec = (process.env as NodeJS.ProcessEnv).ComSpec || 'C:\\WINDOWS\\system32\\cmd.exe';
    console.log(`[processCmd] Setting ComSpec: ${(finalEnv as NodeJS.ProcessEnv).ComSpec}`);
  }

  // Construct the full command string for the shell, quoting arguments
  const commandString = [
    'node',
    cliEntry,
    commandName,
    ...commandArgs.map(arg => `"${arg.replace(/"/g, '\"')}"`), // Quote args
  ].join(' ');

  console.log(`[processCmd] Executing with shell: ${commandString}`);

  const options = {
    cwd,
    shell: true, // Use shell to handle paths and commands potentially
    env: finalEnv,
    stdio: ['pipe', 'pipe', 'pipe'] as import('child_process').StdioOptions,
  };

  // Use the constructed command string directly when shell is true
  const child = spawn(commandString, [], options); // Pass empty array for args when commandString is used

  // Setup listeners
  // Add null checks for stdout/stderr streams
  if (child?.stdout) {
    child.stdout.on('data', (data) => {
      if (onData) {
        onData(data.toString());
      }
    });
  }
  if (child?.stderr) {
    child.stderr.on('data', (data) => {
      if (onError) {
        onError(data.toString());
      }
    });
  }
  if (onClose) {
    child.on('close', onClose);
  }

  // Fix: Return the child process object
  return child;
}
