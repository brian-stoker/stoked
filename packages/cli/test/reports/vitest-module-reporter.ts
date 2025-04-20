import fs from 'fs/promises';
import path from 'path';

// Function to extract module name from file path
function getModuleName(filePath) {
  const match = filePath.match(/src[\/\\]modules[\/\\]([^/\\]+)/);
  return match ? match[1] : null; // Return null if not part of a module
}

export default async function createModuleCoverageReport(artifactDir: string) {
    if (!artifactDir) {
        console.log('No artifact directory found');
        return;
    }
    
    const inputPath = path.resolve(artifactDir, './coverage/coverage-summary.json');
    const outputPath = path.resolve(artifactDir, './coverage/coverage-module.json');


  try {
    // Read the coverage data
    const coverageData = JSON.parse(await fs.readFile(inputPath, 'utf-8'));

    // Object to store module-wise coverage
    const moduleCoverage = {};

    // Iterate over each file in the coverage data
    for (const [filePath, coverage] of Object.entries(coverageData)) {
      if (filePath === 'total') continue; // Skip the "total" entry

      const moduleName = getModuleName(filePath);
      if (!moduleName) continue; // Skip files not in a module

      // Initialize module entry if it doesn't exist
      if (!moduleCoverage[moduleName]) {
        moduleCoverage[moduleName] = {
          lines: { total: 0, covered: 0, skipped: 0 },
          statements: { total: 0, covered: 0, skipped: 0 },
          functions: { total: 0, covered: 0, skipped: 0 },
          branches: { total: 0, covered: 0, skipped: 0 },
        };
      }

      // Aggregate coverage data for the module
      ['lines', 'statements', 'functions', 'branches'].forEach((key) => {
        moduleCoverage[moduleName][key].total += coverage[key].total;
        moduleCoverage[moduleName][key].covered += coverage[key].covered;
        moduleCoverage[moduleName][key].skipped += coverage[key].skipped;
      });
    }

    // Calculate percentages for each module
    for (const module of Object.values(moduleCoverage)) {
      ['lines', 'statements', 'functions', 'branches'].forEach((key) => {
        module[key].pct = module[key].total
          ? ((module[key].covered / module[key].total) * 100).toFixed(2)
          : '0.00';
      });
    }

    // Save the grouped coverage data
    await fs.writeFile(outputPath, JSON.stringify(moduleCoverage, null, 2), 'utf-8');
    console.log('Module coverage report saved to:', outputPath);
  } catch (error) {
    console.error('Error parsing coverage data:', error.message);
  }
}