import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * Utility to run CLI commands in tests
 */
export class CliRunner {
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    private readonly cliPath: string = 'dist/main.js',
    testWorkspaceRoot?: string
  ) {
    // Create a copy of the current environment
    this.env = { ...process.env };
    
    // Set up test workspace if provided
    if (testWorkspaceRoot) {
      this.env.STOKED_WORKSPACE_ROOT = testWorkspaceRoot;
    } else if (!process.env.STOKED_WORKSPACE_ROOT) {
      // Create a default test workspace if none provided
      const defaultTestWorkspace = path.join(os.tmpdir(), `stoked-test-${Date.now()}`);
      fs.mkdirSync(path.join(defaultTestWorkspace, 'temp'), { recursive: true });
      this.env.STOKED_WORKSPACE_ROOT = defaultTestWorkspace;
    }
  }

  /**
   * Run a CLI command and return the stdout/stderr
   * 
   * @param args Arguments to pass to the CLI
   * @returns The stdout and stderr from the command
   */
  async run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const { stdout, stderr } = await execAsync(`node ${this.cliPath} ${args.join(' ')}`, {
        env: this.env
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
      };
    }
  }

  /**
   * Run a CLI command with a callback for real-time output
   * Useful for long-running commands like jsdocs
   * 
   * @param args Arguments to pass to the CLI
   * @param onOutput Callback for stdout/stderr
   * @returns Promise that resolves with exit code
   */
  runWithOutput(
    args: string[],
    onOutput?: (data: { type: 'stdout' | 'stderr'; data: string }) => void
  ): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn('node', [this.cliPath, ...args], {
        shell: true,
        env: this.env
      });

      child.stdout.on('data', (data) => {
        onOutput?.({ type: 'stdout', data: data.toString() });
      });

      child.stderr.on('data', (data) => {
        onOutput?.({ type: 'stderr', data: data.toString() });
      });

      child.on('close', (code) => {
        resolve(code || 0);
      });
    });
  }

  /**
   * Create a temporary test directory with optional files
   * 
   * @param files Map of file paths to file contents
   * @returns Path to the temp directory
   */
  static async createTempDir(files?: Record<string, string>): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `stoked-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    if (files) {
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(tempDir, filePath);
        const dirPath = path.dirname(fullPath);
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(fullPath, content);
      }
    }
    
    return tempDir;
  }

  /**
   * Clean up a temporary test directory
   * 
   * @param tempDir Path to the temp directory
   */
  static cleanupTempDir(tempDir: string): void {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Clean up resources when tests are done
   */
  cleanup(): void {
    // Clean up test workspace if we created one
    const workspaceRoot = this.env.STOKED_WORKSPACE_ROOT;
    if (workspaceRoot && workspaceRoot.includes('stoked-test-') && fs.existsSync(workspaceRoot)) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  }
} 