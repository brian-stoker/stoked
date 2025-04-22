import { readdir } from 'fs/promises';
import { join, relative } from 'path';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import ignore from 'ignore';

/**
 * Recursively reads a directory and returns a list of all file paths relative to the root directory,
 * while respecting .gitignore rules.
 * @param rootDir The root directory to scan.
 * @returns Promise resolving to an array of relative file paths.
 */
export async function getFileStructure(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const ig = ignore();

  // Load .gitignore if it exists
  const gitignorePath = join(rootDir, '.gitignore');
  try {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  } catch {
    // If .gitignore doesn't exist, proceed without it
  }

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relPath = relative(rootDir, fullPath);

      // Skip ignored files and directories
      if (ig.ignores(relPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        results.push(relPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}