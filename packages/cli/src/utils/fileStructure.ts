import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';

/**
 * Recursively reads a directory and returns a list of all file paths relative to the root directory.
 * Works in ESM-compatible environments.
 * @param rootDir The root directory to scan.
 * @returns Promise resolving to an array of relative file paths.
 */
export async function getFileStructure(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = relative(rootDir, fullPath);
        results.push(relPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}