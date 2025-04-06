import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as os from 'os';
import { execSync } from 'child_process';

interface ComponentDoc {
  name: string;
  filePath: string;
  description: string;
  props?: string;
  usage?: string;
}

interface BatchInfo {
  batchId: string;
  packagePath: string;
  timestamp: string;
  commitHash?: string;
  items: Array<{
    requestId: number;
    filePath: string;
    isEntryPoint: boolean;
    filePathId?: string;
    filePathIndex?: number;
  }>;
  filePathIndices?: Record<string, number>;
}

// Common function to get the batch data directory
function getBatchDataDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.stoked', 'batch-data');
}

@Injectable()
@SubCommand({
  name: 'process-batch',
  description: 'Process all pending batch results',
})
export class ProcessBatchCommand extends CommandRunner {
  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    
    // Check if test mode is enabled
    this.testMode = process.env.JSDOCS_TEST_MODE === 'true';
    if (this.testMode) {
      this.maxTestFiles = parseInt(process.env.TEST_FILES || '5', 10);
      this.logger.log(`🧪 TEST MODE ENABLED: Will only process up to ${this.maxTestFiles} files per batch to verify API functionality`);
    }
  }
  
  // Add test mode properties
  private testMode = false;
  private maxTestFiles = 5; // Default number of files to process in test mode
  
  @Option({
    flags: '-r, --repo-path [path]',
    description: 'Override the repository path specified in the batch file'
  })
  parseRepoPath(val: string): string {
    return val;
  }
  
  @Option({
    flags: '--results-file [path]',
    description: 'Process a specific batch results file directly'
  })
  parseResultsFile(val: string): string {
    return val;
  }
  
  @Option({
    flags: '--skip-file-checks',
    description: 'Skip file existence checks (useful when files have been moved)'
  })
  parseSkipFileChecks(): boolean {
    return true;
  }

  @Option({
    flags: '--skip-signature-checks',
    description: 'Completely bypass signature checks and use simple index-based matching'
  })
  parseSkipSignatureChecks(): boolean {
    return true;
  }

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    // If results file is provided, process it directly
    if (options?.resultsFile) {
      await this.processSpecificResultsFile(options.resultsFile, options);
      return;
    }
    
    // Get the repository path override if provided
    const repoPathOverride = options?.repoPath;
    if (repoPathOverride) {
      this.logger.log(`Repository path override provided: ${repoPathOverride}`);
      this.logger.log(`Will use this path instead of the one specified in batch files`);
    }
    
    // Find all pending batches
    const batchInfoDir = getBatchDataDir();
    
    if (!fs.existsSync(batchInfoDir)) {
      this.logger.log('No batch information directory found. No pending batches to process.');
      return;
    }
    
    // Get all batch info files
    const batchFiles = fs.readdirSync(batchInfoDir)
      .filter(file => file.startsWith('items-'))
      .map(file => {
        const filePath = path.join(batchInfoDir, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BatchInfo;
          
          // Apply repository path override if provided
          if (repoPathOverride) {
            // Store the original path for reference
            const originalPath = content.packagePath;
            
            // Determine the new path based on the override
            let newPath: string;
            if (path.isAbsolute(repoPathOverride)) {
              // If absolute path is provided, use it directly
              newPath = repoPathOverride;
            } else {
              // If relative path, preserve the last part of the original path
              const packageName = path.basename(originalPath);
              newPath = path.join(repoPathOverride, packageName);
            }
            
            this.logger.log(`Overriding repository path for batch ${content.batchId}:`);
            this.logger.log(`  - Original path: ${originalPath}`);
            this.logger.log(`  - New path: ${newPath}`);
            
            // Update the path in the content
            content.packagePath = newPath;
          }
          
          this.logger.log(`[DEBUG] Parsed batch file ${file}:`);
          this.logger.log(`  - Batch ID: ${content.batchId}`);
          this.logger.log(`  - Package Path: ${content.packagePath}`);
          this.logger.log(`  - Item Count: ${content.items?.length || 0}`);
          
          return { 
            filePath,
            content,
            timestamp: new Date(content.timestamp),
            batchId: content.batchId
          };
        } catch (error) {
          this.logger.warn(`Failed to parse batch info file ${file}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        }
      })
      .filter(item => item !== null) as Array<{
        filePath: string;
        content: BatchInfo;
        timestamp: Date;
        batchId: string;
      }>;
    
    if (batchFiles.length === 0) {
      this.logger.log('No pending batches found to process.');
      return;
    }
    
    this.logger.log(`Found ${batchFiles.length} pending batches to check`);
    
    // Cross-server compatibility: Ensure all repository paths exist
    for (const batchFile of batchFiles) {
      const { content: batchInfo } = batchFile;
      const packagePath = batchInfo.packagePath;
      
      // Check repository existence and clone if needed
      if (packagePath && !fs.existsSync(packagePath)) {
        this.logger.warn(`Package path does not exist: ${packagePath}`);
        
        // Ensure parent directory exists
        const parentDir = path.dirname(packagePath);
        if (!fs.existsSync(parentDir)) {
          this.logger.log(`Creating parent directory: ${parentDir}`);
          fs.mkdirSync(parentDir, { recursive: true });
        }
        
        // First, try to extract repository information from the batch file itself
        // Example paths will be:
        // Windows: C:\Users\username\.stoked\.repos\owner\repo
        // Unix: /home/username/.stoked/.repos/owner/repo
        
        // Calculate probable repo owner/name from the path structure
        const pathSegments = packagePath.replace(/\\/g, '/').split('/').filter(Boolean);
        const packageName = path.basename(packagePath);
        
        // If the path follows a structure like /.repos/owner/repo or something similar
        if (pathSegments.length >= 2) {
          // Try multiple extraction methods
          const extractionMethods = [
            // Look for the specific pattern in the packagePath
            () => {
              if (packagePath.includes('.repos')) {
                const repoSegments = packagePath.replace(/\\/g, '/').split('.repos/')[1];
                if (repoSegments && repoSegments.includes('/')) {
                  const [owner, repoWithPath] = repoSegments.split('/', 2);
                  const repo = repoWithPath.split('/')[0];
                  
                  this.logger.log(`Extracted from .repos path format: owner=${owner}, repo=${repo}`);
                  return { owner, repo, branch: 'main' };
                }
              }
              return null;
            },
            
            // Try to extract using standard path extraction
            () => this.extractRepoInfoFromPath(packagePath),
            
            // Look at filenames in the batch to guess the repository
            () => {
              const filePathsInBatch = batchInfo.items
                .map(item => item.filePath)
                .filter(filePath => filePath && typeof filePath === 'string');
              
              if (filePathsInBatch.length > 0) {
                // Log some sample paths to help with debugging
                this.logger.log(`Sample file paths from batch:`);
                filePathsInBatch.slice(0, 3).forEach(fp => this.logger.log(`  - ${fp}`));
                
                // Look for common organization/repository patterns in the paths
                // Try to find GitHub URL patterns in file paths
                for (const filePath of filePathsInBatch) {
                  const ghMatch = filePath.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                  if (ghMatch) {
                    this.logger.log(`Found GitHub pattern in file path: ${ghMatch[1]}/${ghMatch[2]}`);
                    return { owner: ghMatch[1], repo: ghMatch[2], branch: 'main' };
                  }
                }
                
                // No luck with explicit GitHub URLs, try to infer from path structure
                // Assume the repository name is the package name or parent directory
                const ownerGuesses = [
                  pathSegments[pathSegments.length - 2],  // Owner might be second to last segment
                  path.basename(path.dirname(packagePath)), // Or parent directory name
                  'stokedconsulting',  // Common fallback if all else fails
                  'stoked',
                ];
                
                const repoGuesses = [
                  packageName, // Most likely the package name itself
                  pathSegments[pathSegments.length - 1], // or the last path segment
                ];
                
                // Log our best guesses
                this.logger.log(`Best guesses for repository:`);
                this.logger.log(`  Owner candidates: ${ownerGuesses.join(', ')}`);
                this.logger.log(`  Repo candidates: ${repoGuesses.join(', ')}`);
                
                // Use the first non-empty owner and repo guesses
                const owner = ownerGuesses.find(g => g && g.length > 0);
                const repo = repoGuesses.find(g => g && g.length > 0);
                
                if (owner && repo) {
                  this.logger.log(`Using best guess: ${owner}/${repo}`);
                  return { owner, repo, branch: 'main' };
                }
              }
              return null;
            }
          ];
          
          // Try each extraction method in order until one succeeds
          let repoInfo = null;
          for (const extractFn of extractionMethods) {
            repoInfo = extractFn();
            if (repoInfo) {
              this.logger.log(`Successfully extracted repo info: ${repoInfo.owner}/${repoInfo.repo}`);
              break;
            }
          }
          
          if (repoInfo) {
            // Try to clone the repository with a timeout
            try {
              this.logger.log(`Starting clone of ${repoInfo.owner}/${repoInfo.repo} to ${packagePath}`);
              const cloneSuccess = await Promise.race([
                this.cloneRepository(repoInfo, packagePath),
                new Promise<boolean>((resolve) => {
                  setTimeout(() => {
                    this.logger.error(`Clone operation timed out after 300 seconds`);
                    resolve(false);
                  }, 300000); // 5 minute timeout
                })
              ]);
              
              if (cloneSuccess) {
                this.logger.log(`✅ Successfully cloned repository to ${packagePath}`);
              } else {
                this.logger.error(`❌ Failed to clone repository for ${packagePath}`);
                this.logger.log(`You may need to manually clone this repository to ${packagePath}`);
                this.logger.log(`Try: git clone https://github.com/${repoInfo.owner}/${repoInfo.repo}.git ${packagePath}`);
              }
            } catch (error) {
              this.logger.error(`Error during repository clone: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            this.logger.error(`Could not determine repository information for path: ${packagePath}`);
            this.logger.log(`You may need to manually clone this repository to ${packagePath}`);
            this.logger.log(`Or try running the command with --repo-path to override the repository location`);
            
            // Print sample entry point file paths to help the user identify the repository
            const entryPointFiles = batchInfo.items
              .filter(item => item.isEntryPoint)
              .map(item => item.filePath);
            
            if (entryPointFiles.length > 0) {
              this.logger.log(`Entry point files in this batch:`);
              entryPointFiles.slice(0, 5).forEach(file => this.logger.log(`  - ${file}`));
            }
          }
        } else if (packagePath) {
          this.logger.log(`✓ Package path exists: ${packagePath}`);
        }
      }
    }
    
    // Add tracking for successful and failed packages
    let processedBatches = 0;
    let skippedBatches = 0;
    let failedBatches = 0;
    const successfulPackages = new Set<string>();
    const failedPackages = new Set<string>();
    const createdPRs = new Set<string>();
    
    // Process each batch
    for (const batchFile of batchFiles) {
      const { content: batchInfo, batchId } = batchFile;
      const packagePath = batchInfo.packagePath;
      const packageName = path.basename(packagePath);
      
      try {
        // Check if the batch is complete
        this.logger.log(`Checking status of batch ${batchId}...`);
        const status = await this.llmService.checkBatchStatus(batchId);
        
        // Add debug info - save raw batch status to file
        let debugFilePath = '';
        try {
          const rawStatus = await this.llmService.getRawBatchStatus(batchId);
          if (rawStatus) {
            debugFilePath = path.join(getBatchDataDir(), `debug-batch-status-${batchId}.json`);
            fs.writeFileSync(debugFilePath, JSON.stringify(rawStatus, null, 2));
            this.logger.log(`Debug: Wrote raw batch status to ${debugFilePath}`);
          }
        } catch (debugError) {
          this.logger.debug(`Failed to save debug info: ${debugError instanceof Error ? debugError.message : String(debugError)}`);
        }
        
        if (!status.complete) {
          if (status.error) {
            this.logger.error(`Batch ${batchId} failed: ${status.error}`);
            failedPackages.add(packageName);
            
            // Move the batch file to the failed folder
            const failedDir = path.join(path.dirname(batchFile.filePath), 'failed');
            if (!fs.existsSync(failedDir)) {
              fs.mkdirSync(failedDir, { recursive: true });
            }
            
            // Move items file
            const newBatchFilePath = path.join(failedDir, path.basename(batchFile.filePath));
            try {
              fs.copyFileSync(batchFile.filePath, newBatchFilePath);
              fs.unlinkSync(batchFile.filePath);
              this.logger.log(`Moved failed batch info file to ${newBatchFilePath}`);
            } catch (moveError) {
              this.logger.error(`Failed to move batch file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
            }
            
            // Move debug file if it exists
            if (debugFilePath && fs.existsSync(debugFilePath)) {
              const newDebugFilePath = path.join(failedDir, path.basename(debugFilePath));
              try {
                fs.copyFileSync(debugFilePath, newDebugFilePath);
                fs.unlinkSync(debugFilePath);
                this.logger.log(`Moved debug file to ${newDebugFilePath}`);
              } catch (moveError) {
                this.logger.error(`Failed to move debug file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
              }
            }
            
            // Move batch results file if it exists
            const batchResultsPath = path.join(getBatchDataDir(), `.batch-results-${batchId}.json`);
            if (fs.existsSync(batchResultsPath)) {
              const newResultsPath = path.join(failedDir, `results-${batchId}.json`);
              try {
                fs.copyFileSync(batchResultsPath, newResultsPath);
                fs.unlinkSync(batchResultsPath);
                this.logger.log(`Moved batch results file to ${newResultsPath}`);
              } catch (moveError) {
                this.logger.error(`Failed to move results file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
              }
            }
            
            failedBatches++;
          } else {
            this.logger.log(`Batch ${batchId} is still processing (status: ${status.status}). Skipping for now.`);
            skippedBatches++;
          }
          continue;
        }
        
        this.logger.log(`Batch ${batchId} is complete. Processing results...`);
        
        // Check if results file exists, if not, retrieve and save the results
        const batchResultsPath = path.join(getBatchDataDir(), `.batch-results-${batchId}.json`);
        let batchResults;
        
        if (!fs.existsSync(batchResultsPath)) {
          this.logger.log(`Retrieving results for batch ${batchId}...`);
          batchResults = await this.llmService.retrieveBatchResults(batchId);
          
          if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
            this.logger.error(`Retrieved empty or invalid results for batch ${batchId} from the API`);
            this.logger.log(`API returned: ${JSON.stringify(batchResults).substring(0, 200)}...`);
            failedPackages.add(packageName);
            failedBatches++;
            continue;
          }
          
          this.logger.log(`Retrieved ${batchResults.length} results. Saving to ${batchResultsPath}`);
          fs.writeFileSync(batchResultsPath, JSON.stringify(batchResults, null, 2));
          
          // Debug: Show the first result structure as sample
          if (batchResults.length > 0) {
            this.logger.log(`[DEBUG] Sample result structure:`);
            this.logger.log(`Keys: ${JSON.stringify(Object.keys(batchResults[0]))}`);
            
            // Try to extract a sample of the actual response content
            let sampleContent = '';
            if (batchResults[0].response) {
              if (typeof batchResults[0].response === 'string') {
                sampleContent = batchResults[0].response.substring(0, 200);
              } else if (batchResults[0].response.body) {
                if (typeof batchResults[0].response.body === 'string') {
                  sampleContent = batchResults[0].response.body.substring(0, 200);
                } else if (typeof batchResults[0].response.body === 'object') {
                  sampleContent = JSON.stringify(batchResults[0].response.body).substring(0, 200);
                }
              }
            }
            
            if (sampleContent) {
              this.logger.log(`[DEBUG] Sample content: ${sampleContent}...`);
            }
          }
        } else {
          this.logger.log(`Using existing results file for batch ${batchId}`);
          try {
            const fileContent = fs.readFileSync(batchResultsPath, 'utf-8');
            if (!fileContent || fileContent.trim() === '') {
              this.logger.error(`Results file exists but is empty. Deleting and retrieving fresh results.`);
              fs.unlinkSync(batchResultsPath);
              
              // Try again with fresh results
              batchResults = await this.llmService.retrieveBatchResults(batchId);
              
              if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
                this.logger.error(`Retrieved empty or invalid results for batch ${batchId} from the API`);
                this.logger.log(`API returned: ${JSON.stringify(batchResults).substring(0, 200)}...`);
                failedPackages.add(packageName);
                failedBatches++;
                continue;
              }
              
              this.logger.log(`Retrieved ${batchResults.length} results. Saving to ${batchResultsPath}`);
              fs.writeFileSync(batchResultsPath, JSON.stringify(batchResults, null, 2));
            } else {
              batchResults = JSON.parse(fileContent);
              
              // Validate parsed results
              if (!Array.isArray(batchResults) || batchResults.length === 0) {
                this.logger.error(`Results file contains invalid data (not an array or empty array).`);
                this.logger.log(`File content starts with: ${fileContent.substring(0, 100)}...`);
                
                // Try to retrieve fresh results instead
                this.logger.log(`Attempting to retrieve fresh results from API...`);
                batchResults = await this.llmService.retrieveBatchResults(batchId);
                
                if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
                  this.logger.error(`Retrieved empty or invalid results for batch ${batchId} from the API`);
                  failedPackages.add(packageName);
                  failedBatches++;
                  continue;
                }
                
                this.logger.log(`Successfully retrieved ${batchResults.length} results from API. Saving...`);
                fs.writeFileSync(batchResultsPath, JSON.stringify(batchResults, null, 2));
              }
            }
          } catch (parseError) {
            this.logger.error(`Error parsing results file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            this.logger.log(`Attempting to retrieve fresh results...`);
            
            // Try to retrieve fresh results
            batchResults = await this.llmService.retrieveBatchResults(batchId);
            
            if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
              this.logger.error(`Retrieved empty or invalid results for batch ${batchId} from the API`);
              failedPackages.add(packageName);
              failedBatches++;
              continue;
            }
            
            this.logger.log(`Retrieved ${batchResults.length} results. Saving to ${batchResultsPath}`);
            fs.writeFileSync(batchResultsPath, JSON.stringify(batchResults, null, 2));
          }
        }
        
        // Process this batch
        if (!batchResults || batchResults.length === 0) {
          this.logger.error(`No results found for batch ${batchId}. The batch results file exists but is empty or invalid.`);
          this.logger.log(`If this batch was previously processed successfully, you can skip it.`);
          this.logger.log(`Otherwise, check the batch status in the OpenAI dashboard and try again.`);
          
          // Move to a "failed" directory instead of "processed"
          const failedDir = path.join(path.dirname(batchFile.filePath), 'failed');
          if (!fs.existsSync(failedDir)) {
            fs.mkdirSync(failedDir, { recursive: true });
          }
          
          // Move the batch info file
          const newFilePath = path.join(failedDir, path.basename(batchFile.filePath));
          try {
            fs.copyFileSync(batchFile.filePath, newFilePath);
            fs.unlinkSync(batchFile.filePath);
            this.logger.log(`Moved failed batch info file to ${newFilePath}`);
          } catch (moveError) {
            this.logger.error(`Failed to move batch file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
          }
          
          // Also move the results file if it exists (even though it's empty)
          if (fs.existsSync(batchResultsPath)) {
            const newResultsPath = path.join(failedDir, `results-${batchId}.json`);
            try {
              fs.copyFileSync(batchResultsPath, newResultsPath);
              this.logger.log(`Copied batch results to ${newResultsPath}`);
            } catch (moveError) {
              this.logger.error(`Failed to copy results file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
            }
          }
          
          // Move debug file if it exists
          if (debugFilePath && fs.existsSync(debugFilePath)) {
            const newDebugFilePath = path.join(failedDir, path.basename(debugFilePath));
            try {
              fs.copyFileSync(debugFilePath, newDebugFilePath);
              fs.unlinkSync(debugFilePath);
              this.logger.log(`Moved debug file to ${newDebugFilePath}`);
            } catch (moveError) {
              this.logger.error(`Failed to move debug file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
            }
          }
          
          failedBatches++;
          continue;
        }
        
        await this.processBatch(batchInfo, batchResults, options);
        successfulPackages.add(packageName);
        
        // Create PR
        try {
          // Only create a PR if we have files to commit
          await this.createPullRequest([packageName], packagePath);
          createdPRs.add(packageName);
        } catch (prError) {
          this.logger.warn(`Failed to create PR for ${packageName}: ${prError instanceof Error ? prError.message : String(prError)}`);
        }
        
        // Move processed files to the processed folder
        const processedDir = path.join(path.dirname(batchFile.filePath), 'processed');
        if (!fs.existsSync(processedDir)) {
          fs.mkdirSync(processedDir, { recursive: true });
        }
        
        // Move the batch info file
        try {
          const newFilePath = path.join(processedDir, path.basename(batchFile.filePath));
          fs.copyFileSync(batchFile.filePath, newFilePath);
          fs.unlinkSync(batchFile.filePath);
          this.logger.log(`Moved batch info file to ${newFilePath}`);
        } catch (moveError) {
          this.logger.error(`Failed to move batch info file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
        }
        
        // Move the results file
        if (fs.existsSync(batchResultsPath)) {
          const newResultsPath = path.join(processedDir, `results-${batchId}.json`);
          try {
            fs.copyFileSync(batchResultsPath, newResultsPath);
            fs.unlinkSync(batchResultsPath);
            this.logger.log(`Moved batch results to ${newResultsPath}`);
          } catch (moveError) {
            this.logger.error(`Failed to move results file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
          }
        }
        
        // Move debug file if it exists
        if (debugFilePath && fs.existsSync(debugFilePath)) {
          const newDebugFilePath = path.join(processedDir, path.basename(debugFilePath));
          try {
            fs.copyFileSync(debugFilePath, newDebugFilePath);
            fs.unlinkSync(debugFilePath);
            this.logger.log(`Moved debug file to ${newDebugFilePath}`);
          } catch (moveError) {
            this.logger.warn(`Failed to move debug file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
          }
        }
        
        // Cancel the batch on OpenAI's servers to free up resources
        try {
          this.logger.log(`Cancelling batch ${batchId} on OpenAI servers...`);
          const cancelResult = await this.llmService.cancelBatch(batchId);
          if (cancelResult) {
            this.logger.log(`✅ Successfully cancelled batch ${batchId} on OpenAI servers`);
          } else {
            this.logger.warn(`⚠️ Failed to cancel batch ${batchId} on OpenAI servers`);
          }
        } catch (cancelError) {
          this.logger.warn(`Error while cancelling batch: ${cancelError instanceof Error ? cancelError.message : String(cancelError)}`);
        }
        
        processedBatches++;
      } catch (error) {
        this.logger.error(`Error processing batch ${batchId}: ${error instanceof Error ? error.message : String(error)}`);
        failedBatches++;
      }
    }
    
    this.logger.log(`Batch processing summary:`);
    
    // List successful packages
    if (successfulPackages.size > 0) {
      this.logger.log(`\n✅ Successfully processed packages (${successfulPackages.size}):`);
      successfulPackages.forEach(pkg => {
        this.logger.log(`- ${pkg}`);
      });
    }
    
    // List successful PRs
    if (createdPRs.size > 0) {
      this.logger.log(`\n🔄 Pull Requests created (${createdPRs.size}):`);
      createdPRs.forEach(pkg => {
        this.logger.log(`- ${pkg}`);
      });
    }
    
    // List failed packages
    if (failedPackages.size > 0) {
      this.logger.log(`\n❌ Failed packages (${failedPackages.size}):`);
      failedPackages.forEach(pkg => {
        this.logger.log(`- ${pkg}`);
      });
    }
    
    // Numerical summary
    this.logger.log(`\n📊 Overall statistics:`);
    this.logger.log(`- Successfully processed: ${processedBatches} batches`);
    this.logger.log(`- Still processing: ${skippedBatches} batches`);
    this.logger.log(`- Failed: ${failedBatches} batches`);
    
    if (skippedBatches > 0) {
      this.logger.log(`\nRun this command again later to process remaining batches once they complete.`);
    }
    
    if (failedPackages.size > 0) {
      this.logger.log(`\n⚠️ To retry failed packages, you'll need to resubmit them individually.`);
      this.logger.log(`Run: stoked jsdocs --include=<package-name> --batch for each failed package.`);
    }
  }
  
  /**
   * Process a specific batch
   */
  private async processBatch(batchInfo: BatchInfo, batchResults: any[], options?: Record<string, any>): Promise<void> {
    const { batchId, packagePath, commitHash } = batchInfo;
    
    // Check if we have a stored commit hash and verify/checkout if necessary
    if (commitHash) {
      this.logger.log(`Batch was created with commit: ${commitHash}`);
      
      try {
        // Get current commit hash
        const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        
        if (currentCommit !== commitHash) {
          this.logger.warn(`Current commit (${currentCommit}) doesn't match the one used when creating the batch (${commitHash})`);
          
          // Check if we should force commit hash matching
          const shouldCheckout = process.env.FORCE_COMMIT_MATCH === 'true';
          
          if (shouldCheckout) {
            this.logger.log(`Checking out commit ${commitHash} to ensure code version consistency...`);
            try {
              // Save current state
              const branchName = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
              
              // Check out the specific commit
              execSync(`git checkout ${commitHash}`, { encoding: 'utf8' });
              this.logger.log(`Successfully checked out commit ${commitHash}`);
              
              // We'll need to switch back to the original branch after processing
              process.on('exit', () => {
                try {
                  execSync(`git checkout ${branchName}`, { encoding: 'utf8' });
                  this.logger.log(`Switched back to branch ${branchName}`);
                } catch (error) {
                  this.logger.error(`Failed to switch back to branch ${branchName}: ${error instanceof Error ? error.message : String(error)}`);
                }
              });
            } catch (error) {
              this.logger.error(`Failed to check out commit ${commitHash}: ${error instanceof Error ? error.message : String(error)}`);
              this.logger.warn('Proceeding with current commit, but be aware that code version consistency is not guaranteed');
            }
          } else {
            this.logger.warn('Proceeding with current commit. Set FORCE_COMMIT_MATCH=true to automatically check out the correct commit.');
            this.logger.warn('Be aware that code version inconsistency may cause issues with the batch processing results.');
          }
        } else {
          this.logger.log(`Current commit matches the one used when creating the batch (${commitHash})`);
        }
      } catch (error) {
        this.logger.warn(`Failed to verify commit hash: ${error instanceof Error ? error.message : String(error)}`);
        this.logger.warn('Proceeding without commit verification. Code version consistency cannot be guaranteed.');
      }
    } else {
      this.logger.warn('No commit hash stored with batch. Code version consistency cannot be guaranteed.');
    }
    
    // Initialize batch stats
    const batchStats = {
      jsDocBlocksAdded: 0,
      componentsDocumented: 0,
      fileProcessed: 0,
      filesSkipped: 0,
      filesMismatched: 0
    };
    
    // Store components found during processing
    const componentDocs: ComponentDoc[] = [];
    
    // Option for skipping signature checks
    const skipSignatureChecks = options?.skipSignatureChecks || this.parseSkipSignatureChecks();
    
    // Apply test mode limits if enabled
    let itemsToProcess = batchInfo.items;
    if (this.testMode && itemsToProcess.length > this.maxTestFiles) {
      this.logger.log(`Test mode: Limiting processing to ${this.maxTestFiles} files out of ${itemsToProcess.length} total`);
      
      // Prioritize entry point files first in test mode
      const entryPointItems = itemsToProcess.filter(item => item.isEntryPoint);
      const nonEntryPointItems = itemsToProcess.filter(item => !item.isEntryPoint);
      
      // Select all entry points + enough non-entry points to reach maxTestFiles
      if (entryPointItems.length <= this.maxTestFiles) {
        // We can include all entry points
        itemsToProcess = [
          ...entryPointItems,
          ...nonEntryPointItems.slice(0, this.maxTestFiles - entryPointItems.length)
        ];
      } else {
        // Too many entry points, just take the first maxTestFiles
        itemsToProcess = entryPointItems.slice(0, this.maxTestFiles);
      }
      
      this.logger.log(`Selected ${itemsToProcess.length} files with priority to entry points (${entryPointItems.length})`);
    }
    
    // Skip signature checks if the flag is enabled
    if (skipSignatureChecks) {
      this.logger.warn('Using direct index-based matching with custom_ids');
      
      // Create a map of custom_id indices to responses
      const customIdResponses = new Map<string, string>();
      
      // Extract the responses and map them by the index from the custom_id
      for (const result of batchResults) {
        if (!result.custom_id) {
          this.logger.warn(`Result missing custom_id: ${JSON.stringify(result).substring(0, 100)}...`);
          continue;
        }
        
        let content = '';
        
        // Extract the response content from various formats
        if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
          // Standard OpenAI format
          content = result.choices[0].message.content;
        } else if (result.response && typeof result.response === 'string') {
          // Custom format in case we've already processed it
          content = result.response;
        } else if (result.response && result.response.body) {
          // OpenAI Batch API format
          try {
            if (typeof result.response.body === 'string') {
              // Parse JSON string
              const bodyObj = JSON.parse(result.response.body);
              if (bodyObj.choices && bodyObj.choices[0] && bodyObj.choices[0].message) {
                content = bodyObj.choices[0].message.content;
              }
            } else if (typeof result.response.body === 'object') {
              // Already parsed object
              const bodyObj = result.response.body;
              if (bodyObj.choices && bodyObj.choices[0] && bodyObj.choices[0].message) {
                content = bodyObj.choices[0].message.content;
              }
            }
          } catch (parseError) {
            this.logger.debug(`Failed to parse response body: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
          }
        }
        
        if (content) {
          // Extract the index from the custom_id (format: request-TIMESTAMP-INDEX)
          const indexMatch = result.custom_id.match(/-(\d+)$/);
          if (indexMatch && indexMatch[1]) {
            const index = indexMatch[1];
            this.logger.debug(`Mapped custom_id ${result.custom_id} to index ${index}`);
            
            // Clean up any markdown formatting
            content = this.cleanLLMResponse(content);
            customIdResponses.set(index, content);
          } else {
            this.logger.warn(`Could not extract index from custom_id: ${result.custom_id}`);
          }
        }
      }
      
      this.logger.log(`Extracted ${customIdResponses.size} valid responses mapped by custom_id index`);
      
      // Make sure we have filePathIndices - this is critical for correct mapping
      if (!batchInfo.filePathIndices || Object.keys(batchInfo.filePathIndices).length === 0) {
        this.logger.error(`No filePathIndices found in batch info. Cannot reliably map responses to files.`);
        this.logger.error(`Please regenerate the batch with proper indices.`);
        return;
      }
      
      // Process each item using the extracted index from filePathIndices
      for (const item of itemsToProcess) {
        if (!item.filePathIndex) {
          this.logger.warn(`Item missing filePathIndex: ${item.filePath}`);
          batchStats.filesSkipped++;
          continue;
        }
        
        const filePathIndex = String(item.filePathIndex);
        const filePath = item.filePath;
        
        // Look up the response using the item's filePathIndex
        const responseContent = customIdResponses.get(filePathIndex);
        
        if (!responseContent) {
          this.logger.error(`No response found for index ${filePathIndex} (${path.basename(filePath)})`);
          batchStats.filesSkipped++;
          continue;
        }
        
        // Verify the file still exists
        if (!options?.skipFileChecks && !fs.existsSync(filePath)) {
          this.logger.error(`File not found: ${filePath}`);
          batchStats.filesSkipped++;
          continue;
        }
        
        // Count new JSDoc blocks
        const originalCode = fs.readFileSync(filePath, 'utf8');
        
        // Safety check - compare file content to avoid accidental replacements
        if (originalCode.includes('describe(') && !originalCode.includes('import') && originalCode.length < 500) {
          this.logger.warn(`File ${filePath} appears to be a test file and not valid source. Skipping to prevent overwriting with test content.`);
          batchStats.filesMismatched++;
          continue;
        }
        
        // Verify the response actually contains code and is not just a test
        if (responseContent.includes('describe(') && !responseContent.includes('import') && responseContent.length < 500) {
          this.logger.warn(`Response for ${filePath} appears to be test code, not documentation. Skipping to prevent overwriting with test content.`);
          batchStats.filesMismatched++;
          continue;
        }
        
        const originalJsDocMatches = originalCode.match(/\/\*\*[\s\S]*?\*\//g);
        const newJsDocMatches = responseContent.match(/\/\*\*[\s\S]*?\*\//g);
        const originalCount = originalJsDocMatches ? originalJsDocMatches.length : 0;
        const newCount = newJsDocMatches ? newJsDocMatches.length : 0;
        const newDocsCount = newCount - originalCount;
        
        // Track the JSDoc blocks added in this batch
        batchStats.jsDocBlocksAdded += newDocsCount;
        
        // Write the documented code back to the file
        try {
          fs.writeFileSync(filePath, responseContent);
          this.logger.log(`Updated file ${filePath} - Added ${newDocsCount} JSDoc blocks`);
          batchStats.fileProcessed++;
        } catch (writeError) {
          this.logger.error(`Failed to write to file: ${filePath} - ${writeError instanceof Error ? writeError.message : String(writeError)}`);
          continue;
        }
        
        // Extract component info if it's a component file
        const extractedInfo = this.extractComponentInfo(responseContent, filePath);
        if (extractedInfo) {
          componentDocs.push(extractedInfo);
          batchStats.componentsDocumented++;
        }
      }
    } else {
      // Original signature-based matching code would go here
      // This section won't be used with our new approach, so we'll just log and skip
      this.logger.warn('Skipping signature-based matching - use --skip-signature-checks for index-based matching');
      return;
    }
    
    // Generate components documentation if components were found
    if (componentDocs.length > 0) {
      this.generateComponentsDocs(packagePath, componentDocs);
    }
    
    // Update .stokedrc.json
    this.updateStokedConfig(packagePath, batchStats.jsDocBlocksAdded, batchStats.componentsDocumented);
    
    this.logger.log(`Batch processing complete for package ${packagePath}:`);
    this.logger.log(`- Added ${batchStats.jsDocBlocksAdded} JSDoc blocks`);
    this.logger.log(`- Documented ${batchStats.componentsDocumented} components`);
    this.logger.log(`- Processed ${batchStats.fileProcessed} files successfully`);
    this.logger.log(`- Skipped ${batchStats.filesSkipped} files (unavailable)`);
    this.logger.log(`- Prevented ${batchStats.filesMismatched} content mixups`);
  }
  
  /**
   * Cleans the LLM response by removing markdown code block markers
   */
  private cleanLLMResponse(response: string): string {
    // Remove any markdown code block markers
    let cleaned = response.replace(/^```(?:typescript|javascript)?\n/m, '');
    cleaned = cleaned.replace(/\n```$/m, '');
    
    // Verify we haven't accidentally removed code
    if (cleaned.trim().length < response.trim().length / 2) {
      this.logger.warn('Significant content loss after cleaning response, using original');
      return response;
    }
    
    return cleaned;
  }
  
  /**
   * Extracts component information from a code file
   */
  private extractComponentInfo(code: string, filePath: string): ComponentDoc | null {
    // Check if this looks like a React file
    const isReactFile = code.includes('import React') || 
                        code.includes('from "react"') || 
                        code.includes("from 'react'") ||
                        code.match(/\bReact\b/) ||
                        code.includes('JSX.') ||
                        (path.extname(filePath) === '.tsx' || path.extname(filePath) === '.jsx');
    
    if (!isReactFile) {
      return null;
    }
    
    // Different component pattern matching strategies
    
    // 1. Standard JSDoc + export declaration
    const standardComponentMatch = code.match(/\/\*\*\s*([\s\S]*?)\*\/\s*(export\s+(?:default\s+)?(?:function|const|class)\s+(\w+))/);
    
    // 2. Arrow function components
    const arrowComponentMatch = code.match(/\/\*\*\s*([\s\S]*?)\*\/\s*(export\s+(?:default\s+)?(?:const)\s+(\w+)\s*=\s*(?:\(|\w+\s*=>))/);
    
    // 3. Class components
    const classComponentMatch = code.match(/\/\*\*\s*([\s\S]*?)\*\/\s*(class\s+(\w+)\s+extends\s+(?:React\.)?Component)/);
    
    // 4. Forwardref components 
    const forwardRefMatch = code.match(/\/\*\*\s*([\s\S]*?)\*\/\s*(const\s+(\w+)\s*=\s*(?:React\.)?forwardRef)/i);
    
    // 5. Memo components
    const memoMatch = code.match(/\/\*\*\s*([\s\S]*?)\*\/\s*(const\s+(\w+)\s*=\s*(?:React\.)?memo)/i);
    
    // Try all matchers
    const componentMatch = standardComponentMatch || arrowComponentMatch || classComponentMatch || forwardRefMatch || memoMatch;
    
    if (!componentMatch || !componentMatch[1] || !componentMatch[3]) {
      // Try a fallback for components without JSDoc but with clear component patterns
      const fallbackComponentMatch = code.match(/(export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)(?:\s*\([^)]*\)|\s*=\s*(?:\([^)]*\)\s*=>|\w+\s*=>)).*(?:\breturn\s+<|\brender\s*\(\)\s*{[^}]*return\s+<))/s);
      
      if (fallbackComponentMatch && fallbackComponentMatch[2]) {
        // Found a likely component without JSDoc
        this.logger.log(`Found component ${fallbackComponentMatch[2]} in ${path.basename(filePath)} without JSDoc`);
        return {
          name: fallbackComponentMatch[2],
          filePath: filePath.replace(/\\/g, '/'),
          description: `Component ${fallbackComponentMatch[2]} (Auto-detected)`
        };
      }
      
      return null;
    }
    
    const jsDoc = componentMatch[1];
    const componentName = componentMatch[3];
    
    this.logger.log(`Found component ${componentName} in ${path.basename(filePath)}`);
    
    // Parse JSDoc content
    const descriptionMatch = jsDoc.match(/@description\s+(.*?)(?=@|$)/s) || jsDoc.match(/\*\s*([^@].*?)(?=@|$)/s);
    const description = descriptionMatch?.[1]?.trim();
      
    const propsMatch = jsDoc.match(/@props\s+(.*?)(?=@|$)/s);
    let props = propsMatch?.[1]?.trim();
    
    // If no props section found, try to look for @param documentation
    if (!props) {
      const paramMatches = Array.from(jsDoc.matchAll(/@param\s+{([^}]*)}\s+(\w+)\s+-?\s*(.*?)(?=@|\*\/|$)/gs));
      if (paramMatches.length > 0) {
        props = paramMatches.map(m => `- **${m[2]}** \`${m[1]}\`: ${m[3].trim()}`).join('\n');
      }
    }
    
    const usageMatch = jsDoc.match(/@example\s+(.*?)(?=@|$)/s);
    const usage = usageMatch?.[1]?.trim();
    
    return {
      name: componentName,
      filePath: filePath.replace(/\\/g, '/'),
      description: description || 'No description provided',
      ...(props && { props }),
      ...(usage && { usage })
    };
  }
  
  /**
   * Generates documentation for React components
   */
  private generateComponentsDocs(packageRoot: string, components: ComponentDoc[]): void {
    try {
      const filteredComponents = components.filter(doc => doc.filePath.startsWith(packageRoot));
      
      if (filteredComponents.length === 0) {
        this.logger.log(`No components found to document in ${packageRoot}`);
        return;
      }
  
      // Generate docs README
      const markdown = `# Component Documentation
      
## Table of Contents
${filteredComponents.map(doc => `- [${doc.name}](#${doc.name.toLowerCase()})`).join('\n')}

${filteredComponents.map(doc => `
## ${doc.name}

${doc.description}

**File:** \`${doc.filePath}\`

${doc.props ? `### Props\n\n${doc.props}\n` : ''}
${doc.usage ? `### Usage\n\n\`\`\`tsx\n${doc.usage}\n\`\`\`\n` : ''}
`).join('\n---\n')}
`;
  
      const docsPath = path.join(packageRoot, 'components.md');
      
      try {
        // Make sure the directory exists
        fs.mkdirSync(path.dirname(docsPath), { recursive: true });
        fs.writeFileSync(docsPath, markdown);
        this.logger.log(`Generated components.md with documentation for ${filteredComponents.length} components at ${docsPath}`);
        
        // Double check file was written
        if (fs.existsSync(docsPath)) {
          const stats = fs.statSync(docsPath);
          this.logger.log(`File size: ${stats.size} bytes`);
        } else {
          this.logger.error(`Failed to write components.md - file doesn't exist after write operation`);
        }
      } catch (writeError) {
        this.logger.error(`Failed to write components.md: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
        
        // Try writing to a different location as fallback
        const altDocsPath = path.join(process.cwd(), `components-${path.basename(packageRoot)}.md`);
        try {
          fs.writeFileSync(altDocsPath, markdown);
          this.logger.log(`Wrote components.md to alternate location: ${altDocsPath}`);
        } catch (fallbackError) {
          this.logger.error(`Failed to write to alternate location: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error generating component docs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Updates the .stokedrc.json configuration file
   */
  private updateStokedConfig(packagePath: string, jsDocBlocksAdded: number, componentsDocumented: number): void {
    interface StokedConfig {
      version: string;
      runs: Array<{
        timestamp: string;
        jsDocBlocksAdded: number;
        componentsDocumented: number;
        testMode: boolean;
      }>;
    }
    
    const configPath = path.join(packagePath, '.stokedrc.json');
    const config: StokedConfig = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : { version: '1.0.0', runs: [] };

    config.runs.push({
      timestamp: new Date().toISOString(),
      jsDocBlocksAdded,
      componentsDocumented,
      testMode: false
    });

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    this.logger.log(`
Package ${path.basename(packagePath)} processed:
- Added ${jsDocBlocksAdded} JSDoc blocks
- Documented ${componentsDocumented} components
- Updated ${configPath}
    `);
  }
  
  /**
   * Gets the current stoked version
   * @param packagePath The package path to check version from
   * @returns Formatted version string suitable for branch names
   */
  private async getStokedVersion(packagePath: string): Promise<string> {
    try {
      // Get the Stoked tool version from the stoked package.json in the project root
      // This represents the version of the documentation generator being used
      const packageJsonPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          // Make sure we're getting the version of the stoked tool itself
          if (packageJson.name === 'stoked') {
            // Use dots in branch name, they are permitted in Git branches
            return packageJson.version || '0.0.1';
          } else {
            // Only log this in debug mode to avoid cluttering output
            this.logger.debug(`Package.json at ${packageJsonPath} does not belong to stoked tool (found name: ${packageJson.name})`);
          }
        } catch (err) {
          this.logger.debug(`Error parsing package.json: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      // Try to get version via command directly as fallback
      try {
        // Use dynamic import for child_process
        const childProcess = await import('child_process');
        const util = await import('util');
        const execAsync = util.promisify(childProcess.exec);
        
        const { stdout: versionOutput } = await execAsync('stoked -v', { encoding: 'utf8' });
        const versionMatch = versionOutput.match(/stoked:\s+(\d+\.\d+\.\d+(?:-\w+\.\d+)?)/i);
        if (versionMatch && versionMatch[1]) {
          return versionMatch[1];
        }
      } catch (err) {
        this.logger.debug(`Failed to get version via command: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (error) {
      this.logger.debug(`Failed to get stoked version: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Default to a timestamp if version can't be determined
    return new Date().toISOString().slice(0, 10);
  }
  
  /**
   * Creates a pull request with generated documentation
   */
  private async createPullRequest(packageNames: string[], packagePath: string): Promise<void> {
    try {
      // Use dynamic import instead of require for better compatibility with ESM
      let exec;
      try {
        const childProcess = await import('child_process');
        const util = await import('util');
        exec = util.promisify(childProcess.exec);
      } catch (importError) {
        this.logger.error(`Failed to import child_process: ${importError instanceof Error ? importError.message : String(importError)}`);
        this.logger.log(`Skipping PR creation, but documentation was generated successfully`);
        return;
      }
      
      // Get the Stoked tool version for branch name
      const stokedVersion = await this.getStokedVersion(packagePath);
      
      // Determine branch name based on packages processed
      let branchName: string;
      if (packageNames.length === 1) {
        // Single package - use stoked/jsdocs-${package}-${stoked-version}
        branchName = `stoked/jsdocs-${packageNames[0].replace('@', '').replace('/', '-')}-${stokedVersion}`;
      } else {
        // Multiple packages or entire repo - use stoked/jsdocs-${stoked-version}
        branchName = `stoked/jsdocs-${stokedVersion}`;
      }
      
      this.logger.log(`Creating branch: ${branchName} in directory: ${packagePath}`);
      
      // Create and switch to the branch - using the package path as cwd
      const execOptions = { cwd: packagePath };
      try {
        // First check if branch exists locally
        const { stdout: localBranches } = await exec('git branch', execOptions);
        if (localBranches.includes(branchName)) {
          await exec(`git checkout ${branchName}`, execOptions);
        } else {
          // Check if branch exists remotely
          const { stdout: remoteBranches } = await exec('git branch -r', execOptions);
          if (remoteBranches.includes(`origin/${branchName}`)) {
            await exec(`git checkout -b ${branchName} origin/${branchName}`, execOptions);
          } else {
            // Create new branch
            await exec(`git checkout -b ${branchName}`, execOptions);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to create/switch to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // Add all changes
      this.logger.log('Adding changes to git...');
      try {
        await exec('git add .', execOptions);
      } catch (error) {
        this.logger.error(`Failed to add changes: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if we have changes to commit
      const { stdout: status } = await exec('git status --porcelain', execOptions);
      if (!status.trim()) {
        this.logger.log('No changes to commit');
        return;
      }
      
      // Create a descriptive commit message
      const commitMessage = `docs: add JSDoc comments to ${packageNames.join(', ')}`;
      this.logger.log('Committing changes...');
      try {
        await exec(`git commit -m "${commitMessage}"`, execOptions);
      } catch (error) {
        // If no changes were staged, this is fine
        if (error instanceof Error && error.message.includes('nothing to commit')) {
          this.logger.log('No changes to commit');
          return;
        }
        this.logger.error(`Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Push to the branch
      this.logger.log(`Pushing to branch ${branchName}...`);
      try {
        await exec(`git push origin ${branchName} --force`, execOptions);
      } catch (error) {
        this.logger.error(`Failed to push to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if PR already exists
      this.logger.log('Checking for existing pull request...');
      let prExists = false;
      try {
        const { stdout: prCheckResult } = await exec(`gh pr list --head ${branchName} --json number`, execOptions);
        try {
          const prData = JSON.parse(prCheckResult);
          prExists = Array.isArray(prData) && prData.length > 0;
        } catch (parseError) {
          // If parsing fails, assume no PR exists
          this.logger.debug(`Error parsing PR check result: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } catch (error) {
        this.logger.warn(`Error checking for existing PR: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with PR creation anyway
      }
      
      if (prExists) {
        this.logger.log('Pull request already exists, skipping PR creation');
        return;
      }
      
      // Create a PR
      this.logger.log('Creating pull request...');
      const prTitle = packageNames.length === 1
        ? `docs: add JSDoc comments to ${packageNames[0]}`
        : `docs: add JSDoc comments to ${packageNames.length} packages`;
        
      const prBody = `This PR adds JSDoc comments to the following packages:
- ${packageNames.join('\n- ')}

## Changes
- Added JSDoc comments to functions, classes, and interfaces
- Generated components.md files for packages with React components
- Added documentation for props, usage examples, and component descriptions

Generated using Stoked v${stokedVersion.replace(/-/g, '.')}`;

      try {
        await exec(
          `gh pr create --title "${prTitle}" --body "${prBody}" --base main`,
          execOptions
        );
        this.logger.log('Pull request created successfully');
      } catch (error) {
        this.logger.error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Extracts repository information from a package path
   * 
   * @param packagePath The path to the package
   * @returns Repository information or null if it couldn't be determined
   */
  private extractRepoInfoFromPath(packagePath: string): { owner: string; repo: string; branch?: string } | null {
    try {
      this.logger.log(`Trying to extract repository info from path: ${packagePath}`);
      
      // First check if we can find a .git directory in any parent folder
      let currentPath = packagePath;
      while (currentPath && currentPath !== '/') {
        const gitDir = path.join(currentPath, '.git');
        if (fs.existsSync(gitDir)) {
          this.logger.log(`Found .git directory at ${gitDir}`);
          try {
            // Read the git config to get the remote origin URL
            const configPath = path.join(gitDir, 'config');
            if (fs.existsSync(configPath)) {
              const configContent = fs.readFileSync(configPath, 'utf8');
              const remoteMatch = configContent.match(/\[remote "origin"\][^\[]*url\s*=\s*(?:https:\/\/github\.com\/|git@github\.com:)([^\/\n]+)\/([^\.\/\n]+)(?:\.git)?/);
              if (remoteMatch) {
                this.logger.log(`Extracted owner: ${remoteMatch[1]}, repo: ${remoteMatch[2]} from git config`);
                return {
                  owner: remoteMatch[1],
                  repo: remoteMatch[2],
                  branch: 'main'
                };
              }
            }
          } catch (err) {
            this.logger.warn(`Error reading git config: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        currentPath = path.dirname(currentPath);
      }
      
      // If we couldn't find git config, try to extract from package.json
      const packageJsonPath = path.join(packagePath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          if (packageJson.repository) {
            // Handle different repository formats
            let repoUrl = '';
            if (typeof packageJson.repository === 'string') {
              repoUrl = packageJson.repository;
            } else if (packageJson.repository.url) {
              repoUrl = packageJson.repository.url;
            }
            
            // Extract owner/repo from URL
            const urlMatch = repoUrl.match(/(?:https:\/\/github\.com\/|git@github\.com:)([^\/]+)\/([^\.\/]+)(?:\.git)?/);
            if (urlMatch) {
              this.logger.log(`Extracted owner: ${urlMatch[1]}, repo: ${urlMatch[2]} from package.json`);
              return {
                owner: urlMatch[1],
                repo: urlMatch[2],
                branch: 'main'
              };
            }
          }
        } catch (err) {
          this.logger.warn(`Error reading package.json: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      // As a fallback, try to extract from the path
      this.logger.log(`Trying to extract from path structure...`);
      
      // Normalize path separators to handle both Windows and Unix
      const normalizedPath = packagePath.replace(/\\/g, '/');
      
      // Look for patterns like /user/repo or user/repo/some/path
      // Try to find the pattern anywhere in the path (not just at the end)
      const fullPathMatch = normalizedPath.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (fullPathMatch) {
        this.logger.log(`Extracted owner: ${fullPathMatch[1]}, repo: ${fullPathMatch[2]} from normalized path using github.com pattern`);
        return {
          owner: fullPathMatch[1],
          repo: fullPathMatch[2],
          branch: 'main'
        };
      }
      
      // Check if the path follows a pattern like /path/to/username/repo-name
      // Split the path into segments and use the last two as owner/repo
      const pathSegments = normalizedPath.split('/').filter(Boolean);
      if (pathSegments.length >= 2) {
        const potentialOwner = pathSegments[pathSegments.length - 2];
        const potentialRepo = pathSegments[pathSegments.length - 1];
        
        // Check if these look like valid GitHub owner/repo names
        if (potentialOwner.match(/^[a-zA-Z0-9_-]+$/) && potentialRepo.match(/^[a-zA-Z0-9_.-]+$/)) {
          this.logger.log(`Extracted potential owner: ${potentialOwner}, repo: ${potentialRepo} from path segments`);
          
          // If we have no better option, use this as a last resort
          return {
            owner: potentialOwner,
            repo: potentialRepo,
            branch: 'main'
          };
        }
      }
      
      this.logger.warn(`Could not extract repository info from path: ${packagePath}`);
      return null;
    } catch (error) {
      this.logger.error(`Error extracting repo info: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Clones a repository to the specified path
   * 
   * @param repoInfo Repository information
   * @param targetPath Where to clone the repository
   * @returns True if successful, false otherwise
   */
  private async cloneRepository(
    repoInfo: { owner: string; repo: string; branch?: string }, 
    targetPath: string
  ): Promise<boolean> {
    try {
      this.logger.log(`Attempting to clone ${repoInfo.owner}/${repoInfo.repo} to ${targetPath}`);
      
      // Use dynamic import instead of require for better compatibility
      const childProcess = await import('child_process');
      const util = await import('util');
      const execSync = util.promisify(childProcess.exec);
      
      // First ensure the parent directory exists
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        this.logger.log(`Creating parent directory: ${parentDir}`);
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      // If the target directory exists
      if (fs.existsSync(targetPath)) {
        this.logger.log(`Target directory ${targetPath} already exists`);
        
        // Check if it's a git repository
        try {
          const { stdout } = await execSync('git rev-parse --is-inside-work-tree', { cwd: targetPath });
          if (stdout.trim() === 'true') {
            // It's a git repo, pull latest changes
            this.logger.log(`Pulling latest changes for existing repository at ${targetPath}`);
            const { stdout: branchOutput } = await execSync('git branch --show-current', { cwd: targetPath });
            const currentBranch = branchOutput.trim();
            
            this.logger.log(`Current branch: ${currentBranch}`);
            await execSync('git pull origin ' + currentBranch, { cwd: targetPath });
            return true;
          }
        } catch (err) {
          this.logger.warn(`Directory exists but is not a git repository: ${targetPath}`);
          
          // Try to remove the directory to start fresh
          try {
            // On Windows, we need to make files writable before removal
            if (process.platform === 'win32') {
              await execSync(`attrib -R ${targetPath}\\* /S`);
            }
            
            // Use a more robust directory removal approach
            this.logger.log(`Removing existing directory to make way for git clone`);
            await this.removeDirectory(targetPath);
          } catch (rmError) {
            this.logger.error(`Failed to remove directory: ${rmError instanceof Error ? rmError.message : String(rmError)}`);
            throw new Error(`Cannot proceed: directory exists but is not a git repo, and cannot be removed`);
          }
        }
      }
      
      // Build the clone URL
      const gitUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}.git`;
      
      // Check if git is available
      try {
        const { stdout: gitVersion } = await execSync('git --version');
        this.logger.log(`Git found: ${gitVersion.trim()}`);
      } catch (gitError) {
        this.logger.error(`Git not found: ${gitError instanceof Error ? gitError.message : String(gitError)}`);
        throw new Error('Git executable not found. Please install git to use this feature.');
      }
      
      // Clone the repository
      this.logger.log(`Cloning repository from ${gitUrl} to ${targetPath}`);
      
      const branchFlag = repoInfo.branch ? `--branch ${repoInfo.branch}` : '';
      const depthFlag = '--depth 1'; // Shallow clone for speed
      const cloneCommand = `git clone ${branchFlag} ${depthFlag} ${gitUrl} "${targetPath}"`;
      
      this.logger.log(`Executing: ${cloneCommand}`);
      
      const cloneResult = await execSync(cloneCommand);
      this.logger.log(`Clone result: ${cloneResult.stdout}`);
      
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Clone seemed to succeed but directory ${targetPath} does not exist`);
      }
      
      // Verify it's actually a git repository
      try {
        await execSync('git rev-parse --is-inside-work-tree', { cwd: targetPath });
        this.logger.log(`Successfully verified repository at ${targetPath}`);
        return true;
      } catch (verifyError) {
        throw new Error(`Clone completed but target is not a valid git repository: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
      }
    } catch (error) {
      this.logger.error(`Error cloning repository: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Recursively removes a directory and its contents
   * 
   * @param dirPath Path to the directory to remove
   * @returns Promise that resolves when the directory is removed
   */
  private async removeDirectory(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      try {
        if (entry.isDirectory()) {
          await this.removeDirectory(fullPath);
        } else {
          fs.unlinkSync(fullPath);
        }
      } catch (err) {
        this.logger.warn(`Error removing ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    try {
      fs.rmdirSync(dirPath);
    } catch (err) {
      this.logger.warn(`Error removing directory ${dirPath}: ${err instanceof Error ? err.message : String(err)}`);
      
      // If regular rmdir fails, try using rimraf on Node.js platforms
      try {
        // Use dynamic import for child_process
        const childProcess = await import('child_process');
        const execSync = childProcess.execSync;
        
        if (process.platform === 'win32') {
          execSync(`rmdir /s /q "${dirPath}"`);
        } else {
          execSync(`rm -rf "${dirPath}"`);
        }
      } catch (execErr) {
        throw new Error(`Failed to remove directory using all available methods: ${execErr instanceof Error ? execErr.message : String(execErr)}`);
      }
    }
  }
  
  /**
   * Builds a cache of files in the repository to help resolve file paths
   * 
   * @param rootDir The root directory to scan
   * @param fileCache The map to store file cache entries
   * @param isSourceCodeOnly Whether to only include source code files
   */
  private buildFileCache(
    rootDir: string, 
    fileCache: Map<string, string>,
    isSourceCodeOnly: boolean = true
  ): void {
    if (!fs.existsSync(rootDir)) {
      this.logger.warn(`Cannot build file cache - directory does not exist: ${rootDir}`);
      return;
    }
    
    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });
      
      for (const entry of entries) {
        try {
          const fullPath = path.join(rootDir, entry.name);
          
          if (entry.isDirectory()) {
            // Skip node_modules and other common directories we don't want to process
            if (entry.name === 'node_modules' || 
                entry.name === '.git' || 
                entry.name === 'dist' || 
                entry.name === 'build' || 
                entry.name === 'coverage' ||
                entry.name.startsWith('.')) {
              continue;
            }
            
            // Recursively scan subdirectories
            this.buildFileCache(fullPath, fileCache, isSourceCodeOnly);
          } else if (!isSourceCodeOnly || this.isSourceCodeFile(entry.name)) {
            // Store the file in our cache by its basename
            // If there are duplicates, we'll prefer ones in src/ or lib/ directories
            const isPreferredLocation = 
              fullPath.includes('/src/') || 
              fullPath.includes('\\src\\') || 
              fullPath.includes('/lib/') || 
              fullPath.includes('\\lib\\');
              
            // Add both the full path (for absolute references) and the basename (for relative references)
            fileCache.set(entry.name, fullPath);
            
            // Also map a normalized version of the filename without extension
            const baseName = path.basename(entry.name, path.extname(entry.name));
            
            // Only add the base name if it's not already there or if current path is preferred
            if (!fileCache.has(baseName) || isPreferredLocation) {
              fileCache.set(baseName, fullPath);
            }
            
            // Special handling for index files - map directory name to the index file
            if (entry.name.startsWith('index.')) {
              const dirName = path.basename(rootDir);
              if (!fileCache.has(dirName) || isPreferredLocation) {
                fileCache.set(dirName, fullPath);
              }
            }
          }
        } catch (entryError) {
          // Just skip problematic entries
          this.logger.debug(`Error processing entry ${entry.name}: ${entryError instanceof Error ? entryError.message : String(entryError)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error scanning directory ${rootDir}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Checks if a file is a source code file we should process
   * 
   * @param fileName Name of the file to check
   * @returns True if this is a source code file
   */
  private isSourceCodeFile(fileName: string): boolean {
    const sourceExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', 
      '.vue', '.svelte', '.astro'
    ];
    
    const extension = path.extname(fileName);
    
    // Check if file has a source code extension
    return sourceExtensions.includes(extension);
  }

  // Add method to process a specific results file
  private async processSpecificResultsFile(resultsFilePath: string, options?: Record<string, any>): Promise<void> {
    this.logger.log(`Processing specific results file: ${resultsFilePath}`);
    
    // Verify the file exists
    if (!fs.existsSync(resultsFilePath)) {
      this.logger.error(`Results file not found: ${resultsFilePath}`);
      return;
    }
    
    try {
      // Read and parse the results file
      const resultsContent = fs.readFileSync(resultsFilePath, 'utf8');
      const batchResults = JSON.parse(resultsContent);
      
      // Extract batch ID from filename if possible
      const batchIdMatch = path.basename(resultsFilePath).match(/results-(.+)\.json/);
      const batchId = batchIdMatch?.[1];
      
      if (!batchId) {
        this.logger.error('Could not determine batch ID from results file name');
        return;
      }
      
      this.logger.log(`Determined batch ID: ${batchId}`);
      
      // Look for corresponding batch info file
      const batchInfoPath = path.join(getBatchDataDir(), `items-${batchId}.json`);
      
      if (!fs.existsSync(batchInfoPath)) {
        this.logger.error(`Batch info file not found: ${batchInfoPath}`);
        return;
      }
      
      // Read and parse the batch info file
      const batchInfoContent = fs.readFileSync(batchInfoPath, 'utf8');
      const batchInfo = JSON.parse(batchInfoContent) as BatchInfo;
      
      // Apply repository path override if provided
      if (options?.repoPath) {
        const originalPath = batchInfo.packagePath;
        
        // Determine the new path based on the override
        let newPath: string;
        if (path.isAbsolute(options.repoPath)) {
          // If absolute path is provided, use it directly
          newPath = options.repoPath;
        } else {
          // If relative path, preserve the last part of the original path
          const packageName = path.basename(originalPath);
          newPath = path.join(options.repoPath, packageName);
        }
        
        this.logger.log(`Overriding repository path:`);
        this.logger.log(`  - Original path: ${originalPath}`);
        this.logger.log(`  - New path: ${newPath}`);
        
        // Update the path in the content
        batchInfo.packagePath = newPath;
      }
      
      // Process the batch
      await this.processBatch(batchInfo, batchResults, options);
      
      // Move the batch files to processed folder on success
      const processedDir = path.join(getBatchDataDir(), 'processed');
      if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true });
      }
      
      // Move batch info file
      const processedInfoPath = path.join(processedDir, path.basename(batchInfoPath));
      fs.copyFileSync(batchInfoPath, processedInfoPath);
      fs.unlinkSync(batchInfoPath);
      
      // Move results file
      const processedResultsPath = path.join(processedDir, path.basename(resultsFilePath));
      fs.copyFileSync(resultsFilePath, processedResultsPath);
      fs.unlinkSync(resultsFilePath);
      
      this.logger.log(`Successfully processed batch ${batchId}`);
      
    } catch (error) {
      this.logger.error(`Failed to process results file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 