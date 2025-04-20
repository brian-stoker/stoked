import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import parseArgs from 'yargs-parser';

// --- Types ---
interface CommandOption { flags: string; description?: string; }
interface CommandArgument { name: string; required: boolean; variadic: boolean; description?: string; }
interface CommandInfo { name: string; path: string[]; fullCommand: string; description?: string; options: CommandOption[]; arguments: CommandArgument[]; subcommands: CommandInfo[]; }

// Output report types
interface CommandCoverageStats {
  combinationsTotal: number;
  combinationsCovered: number;
  combinationsPassing: number;
  coveragePercent: number;
  combinationsCoveredPassingPercent?: number;
  uncoveredOptions?: string[];
  uncoveredSubcommands?: string[];
}
interface CoverageReport {
  overall: {
    totalDefinedCommands: number;
    coveredCommands: number;
    passingCommands: number;
    commandCoveragePercent: number;
    coveredCommandsPassingPercent?: number;
    totalCombinations: number;
    coveredCombinations: number;
    passingCombinations: number;
    coveredCombinationsPassingPercent?: number;
    overallCoveragePercent: number;
  };
  commands: Record<string, CommandCoverageStats>;
}

// Playwright types (simplified)
interface PlaywrightTestResult { status: 'passed' | 'failed' | 'timedOut' | 'skipped'; /* ... other fields */ }
interface PlaywrightTest { results: PlaywrightTestResult[]; /* ... other fields */ }
interface PlaywrightSpec { title: string; tests: PlaywrightTest[]; ok: boolean; /* ... other fields */ }
interface PlaywrightSuite { title: string; file: string; specs: PlaywrightSpec[]; suites: PlaywrightSuite[]; }
interface PlaywrightResults { suites: PlaywrightSuite[]; /* ... other fields */ }
// -------------

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliRootDir = path.resolve(__dirname, '..');
const definitionsPath = path.join(cliRootDir, 'command-definitions.json');

const currentArtifactDir = process.env.CURRENT_E2E_ARTIFACT_DIR;
console.log(`[Coverage Check] Read env var CURRENT_E2E_ARTIFACT_DIR: ${currentArtifactDir}`);
if (!currentArtifactDir) {
    console.error('[Coverage Check] Error: Environment variable CURRENT_E2E_ARTIFACT_DIR is not set.');
    process.exit(1);
}
// **** Read results.json instead of executed_commands.json ****
const resultsJsonPath = path.join(currentArtifactDir, 'results.json');
// ***********************************************************

const outputReportPath = process.argv[2];

// --- Helper to get primary flag (prefer long flag) ---
function getPrimaryFlag(flagString: string): string | null {
  const flags = flagString.split(/,\s*|\s+/).filter(f => f.startsWith('-'));
  let longFlag: string | null = null;
  let shortFlag: string | null = null;
  for (const flag of flags) {
      const normalized = flag.split(/[<\s=]/)[0];
      if (normalized) {
          if (normalized.startsWith('--')) {
              longFlag = normalized;
              break; // Prefer long flag immediately
          } else if (!shortFlag) {
              shortFlag = normalized; // Keep first short flag found
          }
      }
  }
  return longFlag || shortFlag; // Return long if found, else short, else null
}
// ----------------------------------------------------

// --- NEW: Process Playwright results using Tags ---
function extractExecutionStatus(resultsPath: string): {
  coveredCommands: Set<string>;
  passingCommands: Set<string>;
  coveredOptions: Set<string>;
  passingOptions: Set<string>;
} {
  const coveredCommands = new Set<string>();
  const passingCommands = new Set<string>();
  const coveredOptions = new Set<string>();
  const passingOptions = new Set<string>();

  if (!fs.existsSync(resultsPath)) {
    console.warn(`[Coverage Detail] Playwright results file not found at: ${resultsPath}`);
    return { coveredCommands, passingCommands, coveredOptions, passingOptions };
  }

  try {
    const results: PlaywrightResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    function processSuite(suite: PlaywrightSuite) {
      suite.specs?.forEach(spec => {
        const testPassed = spec.ok; 
        const tags = (spec as any).tags || []; 

        tags.forEach(tag => {
          if (typeof tag === 'string') {
            if (tag.startsWith('cmd:')) {
              const command = tag.substring(4).replace(/_/g, ' ');
              coveredCommands.add(command);
              if (testPassed) passingCommands.add(command);
            } else if (tag.startsWith('opt:')) {
              const tagValue = tag.substring(4);
              const parts = tagValue.split('_');
              const optionFlag = parts.pop(); 
              const commandPart = parts.join(' '); 
              if (commandPart && optionFlag) {
                  const optionString = `${commandPart} ${optionFlag}`;
                  coveredOptions.add(optionString);
                  if (testPassed) passingOptions.add(optionString);

                  coveredCommands.add(commandPart);
                  if (testPassed) passingCommands.add(commandPart);
              }
            }
          }
        });
      });
      suite.suites?.forEach(processSuite); // Recurse
    }

    results.suites?.forEach(processSuite);

  } catch (error) {
    console.error(`[Coverage Detail] Error processing Playwright results file: ${error}`);
  }

  console.log(`[Coverage Detail] From Tags - Covered Commands: ${coveredCommands.size}, Passing: ${passingCommands.size}`);
  console.log(`[Coverage Detail] From Tags - Covered Options: ${coveredOptions.size}, Passing: ${passingOptions.size}`);
  return { coveredCommands, passingCommands, coveredOptions, passingOptions };
}
// --------------------------------------------

// --- Recursive Calculation (Modified) ---
function calculateCoverageRecursive(
    commandInfo: CommandInfo,
    coveredCommands: Set<string>,
    passingCommands: Set<string>,
    coveredOptions: Set<string>,
    passingOptions: Set<string>
): {
    stats: CommandCoverageStats;
    totalCombinations: number;
    coveredCombinations: number;
    passingCombinations: number;
    allDefinedSubcommands: string[];
} {
    const baseCmd = commandInfo.fullCommand;
    const isBaseCommandCovered = coveredCommands.has(baseCmd);
    const isBaseCommandPassing = passingCommands.has(baseCmd);

    const stats: CommandCoverageStats = {
        combinationsTotal: 1,
        combinationsCovered: isBaseCommandCovered ? 1 : 0,
        combinationsPassing: isBaseCommandPassing ? 1 : 0,
        coveragePercent: 0,
    };
    const uncoveredOptionsList: string[] = [];
    const uncoveredSubcommandsList: string[] = [];

    commandInfo.options.forEach(opt => {
        const primaryFlag = getPrimaryFlag(opt.flags);
        if (primaryFlag) {
            stats.combinationsTotal++;
            const optionString = `${baseCmd} ${primaryFlag}`.trim();
            const isOptionCovered = coveredOptions.has(optionString);
            const isOptionPassing = passingOptions.has(optionString);

            if (isOptionCovered) {
                stats.combinationsCovered++;
                if (isOptionPassing) {
                    stats.combinationsPassing++;
                }
            } else {
                uncoveredOptionsList.push(primaryFlag);
            }
        }
    });

    let subTotalCombinations = 0;
    let subCoveredCombinations = 0;
    let subPassingCombinations = 0;

    commandInfo.subcommands.forEach(subCmd => {
        const subResult = calculateCoverageRecursive(
            subCmd,
            coveredCommands,
            passingCommands,
            coveredOptions,
            passingOptions
        );
        subTotalCombinations += subResult.totalCombinations;
        subCoveredCombinations += subResult.coveredCombinations;
        subPassingCombinations += subResult.passingCombinations;

        if (!coveredCommands.has(subCmd.fullCommand)) {
             if (!uncoveredSubcommandsList.includes(subCmd.name)) {
                uncoveredSubcommandsList.push(subCmd.name); 
             }
        }
    });

    stats.combinationsTotal += subTotalCombinations;
    stats.combinationsCovered += subCoveredCombinations;
    stats.combinationsPassing += subPassingCombinations;

    stats.coveragePercent = stats.combinationsTotal > 0
        ? parseFloat(((stats.combinationsCovered / stats.combinationsTotal) * 100).toFixed(1))
        : 0;

    stats.combinationsCoveredPassingPercent = stats.combinationsCovered > 0
        ? parseFloat(((stats.combinationsPassing / stats.combinationsCovered) * 100).toFixed(1))
        : 0;

    if (uncoveredOptionsList.length > 0) stats.uncoveredOptions = uncoveredOptionsList;
    if (uncoveredSubcommandsList.length > 0) stats.uncoveredSubcommands = uncoveredSubcommandsList;

    return {
        stats: stats,
        totalCombinations: stats.combinationsTotal,
        coveredCombinations: stats.combinationsCovered,
        passingCombinations: stats.combinationsPassing,
        allDefinedSubcommands: uncoveredSubcommandsList,
    };
}
// ----------------------------------------------

async function checkCoverage(reportOutputPath: string) {
  console.log(`[Coverage Check] Starting coverage check...`);
  console.log(`[Coverage Check] Definitions Path: ${definitionsPath}`);
  console.log(`[Coverage Check] Results Path: ${resultsJsonPath}`);
  console.log(`[Coverage Check] Output Report Path: ${reportOutputPath}`);

  // --- Load Definitions ---
  if (!fs.existsSync(definitionsPath)) {
    console.error(`[Coverage Check] Command definitions file not found: ${definitionsPath}`);
    process.exit(1);
  }
  const definitions: CommandInfo = JSON.parse(fs.readFileSync(definitionsPath, 'utf8'));

  // --- Load and Process Executed Status from results.json ---
  const { coveredCommands, passingCommands, coveredOptions, passingOptions } = extractExecutionStatus(resultsJsonPath);

  // --- Calculate Coverage Recursively ---
  const report: CoverageReport = {
    overall: {
      totalDefinedCommands: 0,
      coveredCommands: coveredCommands.size,
      passingCommands: passingCommands.size,
      commandCoveragePercent: 0,
      totalCombinations: 0,
      coveredCombinations: 0,
      passingCombinations: 0,
      overallCoveragePercent: 0,
    },
    commands: {}
  };

  const allDefinedCommands = new Set<string>();
  function collectAllCommands(cmdInfo: CommandInfo) {
      allDefinedCommands.add(cmdInfo.fullCommand);
      cmdInfo.subcommands.forEach(collectAllCommands);
  }
  collectAllCommands(definitions);
  report.overall.totalDefinedCommands = allDefinedCommands.size;

  let overallTotalCombinations = 0;
  let overallCoveredCombinations = 0;
  let overallPassingCombinations = 0;

  function aggregateTotals(cmdInfo: CommandInfo) {
      const result = calculateCoverageRecursive(
          cmdInfo,
          coveredCommands,
          passingCommands,
          coveredOptions,
          passingOptions
      );
      overallTotalCombinations += result.totalCombinations;
      overallCoveredCombinations += result.coveredCombinations;
      overallPassingCombinations += result.passingCombinations;
      cmdInfo.subcommands.forEach(aggregateTotals);
  }
  aggregateTotals(definitions);

  function assignStats(cmdInfo: CommandInfo) {
      const result = calculateCoverageRecursive(cmdInfo, coveredCommands, passingCommands, coveredOptions, passingOptions);
      report.commands[cmdInfo.fullCommand] = result.stats;
      cmdInfo.subcommands.forEach(assignStats);
  }
  assignStats(definitions);

  report.overall.totalCombinations = overallTotalCombinations;
  report.overall.coveredCombinations = overallCoveredCombinations;
  report.overall.passingCombinations = overallPassingCombinations;

  report.overall.commandCoveragePercent = report.overall.totalDefinedCommands > 0
    ? parseFloat(((report.overall.coveredCommands / report.overall.totalDefinedCommands) * 100).toFixed(1))
    : 0;

  report.overall.overallCoveragePercent = report.overall.totalCombinations > 0
    ? parseFloat(((report.overall.coveredCombinations / report.overall.totalCombinations) * 100).toFixed(1))
    : 0;

  report.overall.coveredCommandsPassingPercent = report.overall.coveredCommands > 0
    ? parseFloat(((report.overall.passingCommands / report.overall.coveredCommands) * 100).toFixed(1))
    : 0;

  report.overall.coveredCombinationsPassingPercent = report.overall.coveredCombinations > 0
    ? parseFloat(((report.overall.passingCombinations / report.overall.coveredCombinations) * 100).toFixed(1))
    : 0;

  // --- Write Report --- 
  try {
    const outputDir = path.dirname(reportOutputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`[Coverage Check] Created output directory: ${outputDir}`);
    }
    fs.writeFileSync(reportOutputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[Coverage Check] Coverage report generated successfully at: ${reportOutputPath}`);
  } catch (error) {
    console.error(`[Coverage Check] Failed to write coverage report: ${error}`);
  }
}

// --- Run --- 
if (!outputReportPath) {
  console.error('[Coverage Check] Error: Output report path argument is required.');
  console.error('Usage: tsx scripts/check-e2e-coverage.ts <output-path.json>');
  process.exit(1);
}

checkCoverage(outputReportPath).catch(err => {
  console.error('[Coverage Check] Unhandled error:', err);
  process.exit(1);
});
