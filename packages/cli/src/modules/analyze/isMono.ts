import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob'; // Use glob for pattern matching
import * as yaml from 'js-yaml'; // Use js-yaml for parsing YAML

// Keep the same result interface
interface RepoAnalysisResult {
  isMonorepo: boolean;
  type: 'pnpm' | 'lerna' | 'nx' | 'workspaces' | 'none';
  packages: string[]; // Relative paths from repo root
}

/**
 * Analyzes a directory to determine if it's a monorepo and identify packages
 * by reading config files and expanding glob patterns.
 *
 * @param repoPath - The absolute path to the repository's root directory.
 * @returns A Promise resolving to an object indicating if it's a monorepo,
 *          the type, and a list of relative package paths.
 */
export async function analyzeRepoStructureFs(repoPath: string): Promise<RepoAnalysisResult> {
  const result: RepoAnalysisResult = {
    isMonorepo: false,
    type: 'none',
    packages: [],
  };

  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    console.error(`Error: Repository path does not exist or is not a directory: ${repoPath}`);
    return result;
  }

  let detectedGlobs: string[] = [];
  let primaryType: RepoAnalysisResult['type'] = 'none';

  // --- Check for specific config files first ---
  const pnpmWsPath = path.join(repoPath, 'pnpm-workspace.yaml');
  const lernaPath = path.join(repoPath, 'lerna.json');
  const nxPath = path.join(repoPath, 'nx.json');
  const pkgPath = path.join(repoPath, 'package.json');

  // 1. PNPM Workspace
  if (fs.existsSync(pnpmWsPath)) {
    primaryType = 'pnpm';
    result.isMonorepo = true;
    try {
      const pnpmWsContent = fs.readFileSync(pnpmWsPath, 'utf8');
      const pnpmWsData = yaml.load(pnpmWsContent) as any;
      if (Array.isArray(pnpmWsData?.packages)) {
        detectedGlobs = pnpmWsData.packages;
      }
    } catch (err) {
      console.warn(`Warning: Could not parse pnpm-workspace.yaml: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Lerna
  if (fs.existsSync(lernaPath)) {
    result.isMonorepo = true;
    if (primaryType === 'none') primaryType = 'lerna'; // Set if not already set
    // Try getting globs from lerna if not already found from pnpm
    if (detectedGlobs.length === 0) {
        try {
            const lernaContent = fs.readFileSync(lernaPath, 'utf8');
            const lernaData = JSON.parse(lernaContent);
            if (Array.isArray(lernaData?.packages)) {
                detectedGlobs = lernaData.packages;
            }
        } catch (err) {
             console.warn(`Warning: Could not parse lerna.json: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
  }

   // 3. Nx
   if (fs.existsSync(nxPath)) {
    result.isMonorepo = true;
    if (primaryType === 'none') primaryType = 'nx';
    // Nx often relies on package.json workspaces or complex project inference.
    // We'll rely on package.json check below if globs aren't already found.
  }


  // 4. package.json Workspaces (Primary source if specific config doesn't define globs)
  if (fs.existsSync(pkgPath) && detectedGlobs.length === 0) {
    try {
      const pkgContent = fs.readFileSync(pkgPath, 'utf8');
      const pkgData = JSON.parse(pkgContent);
      let workspaceGlobs: string[] = [];

      if (pkgData?.workspaces) {
        if (Array.isArray(pkgData.workspaces)) {
          workspaceGlobs = pkgData.workspaces;
        } else if (typeof pkgData.workspaces === 'object' && Array.isArray(pkgData.workspaces.packages)) {
          workspaceGlobs = pkgData.workspaces.packages;
        }
      }

      if (workspaceGlobs.length > 0) {
         result.isMonorepo = true;
         if (primaryType === 'none') primaryType = 'workspaces';
         detectedGlobs = workspaceGlobs;
      }

    } catch (err) {
      console.warn(`Warning: Could not parse package.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // If monorepo detected and we have globs, expand them
  if (result.isMonorepo && detectedGlobs.length > 0) {
    const packagePaths = new Set<string>();
    for (const pattern of detectedGlobs) {
      // Use glob to find directories matching the pattern
      const potentialPackageDirs = await glob(pattern, {
        cwd: repoPath, // Search relative to the repo root
        absolute: false, // Get relative paths
        ignore: ['**/node_modules/**'], // Ignore node_modules
      });

      // Verify each found directory actually contains a package.json
      for (const dir of potentialPackageDirs) {
        if (fs.existsSync(path.join(repoPath, dir, 'package.json'))) {
          packagePaths.add(dir.replace(/\\/g, '/')); // Normalize path separators
        }
      }
    }
    result.packages = Array.from(packagePaths).sort(); // Sort for consistency
  }

  result.type = primaryType; // Set the determined type

  return result;
}

// // --- Example Usage ---
// async function main() {
//     // Replace with the actual path to the repository you want to analyze
//     // const repoDirectory = '/path/to/your/repository';
//     const repoDirectory = process.cwd(); // Example: Analyze the current directory

//     try {
//         const analysis = await analyzeRepoStructureFs(repoDirectory);
//         console.log(`Analysis for: ${repoDirectory}`);
//         console.log(`Is Monorepo: ${analysis.isMonorepo}`);
//         console.log(`Type: ${analysis.type}`);
//         console.log(`Packages (${analysis.packages.length}):`);
//         analysis.packages.forEach(pkg => console.log(`  - ${pkg}`));
//     } catch (error) {
//         console.error("Analysis failed:", error);
//     }
// }

// Uncomment to run the example when executing this file directly
// main();