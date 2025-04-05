import { SubCommand, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface BatchInfo {
  batchId: string;
  packagePath: string;
  timestamp: string;
  items: Array<{
    requestId: number;
    filePath: string;
    isEntryPoint: boolean;
  }>;
}

@Injectable()
@SubCommand({
  name: 'batch-check',
  description: 'Check status of all pending OpenAI batch operations',
})
export class BatchCheckCommand extends CommandRunner {
  constructor(
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    
    // Check if test mode is enabled
    this.testMode = process.env.JSDOCS_TEST_MODE === 'true';
    if (this.testMode) {
      this.maxTestFiles = parseInt(process.env.TEST_FILES || '5', 10);
    }
  }
  
  // Add test mode properties
  private testMode = false;
  private maxTestFiles = 5; // Default number of files to process in test mode

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
    // Find all pending batches
    const homeDir = os.homedir();
    const batchInfoDir = path.join(homeDir, '.stoked', 'batch-data');
    
    if (!fs.existsSync(batchInfoDir)) {
      this.logger.log('No batch information directory found. No pending batches to check.');
      return;
    }
    
    // Get all batch info files
    const batchFiles = fs.readdirSync(batchInfoDir)
      .filter(file => file.startsWith('items-'))
      .map(file => {
        const filePath = path.join(batchInfoDir, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BatchInfo;
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
      this.logger.log('No pending batches found to check.');
      return;
    }
    
    this.logger.log(`Found ${batchFiles.length} pending batches`);
    
    let completedBatches = 0;
    let processingBatches = 0;
    let failedBatches = 0;
    
    // Check status of each batch
    for (const batchFile of batchFiles) {
      const { content: batchInfo, batchId } = batchFile;
      const packagePath = batchInfo.packagePath;
      const packageName = path.basename(packagePath);
      const itemCount = batchInfo.items.length;
      const ageInHours = (Date.now() - batchFile.timestamp.getTime()) / (1000 * 60 * 60);
      
      this.logger.log(`\nBatch ${batchId}:`);
      this.logger.log(`- Package: ${packageName} (${packagePath})`);
      this.logger.log(`- Files: ${itemCount}`);
      this.logger.log(`- Created: ${batchFile.timestamp.toLocaleString()} (${ageInHours.toFixed(1)} hours ago)`);
      
      // Show test mode information if enabled
      if (this.testMode) {
        this.logger.log(`- Test Mode: Enabled (processing max ${this.maxTestFiles} files)`);
      }
      
      try {
        // Check the batch status
        const status = await this.llmService.checkBatchStatus(batchId);
        
        // Add direct curl command for debugging
        const curlCommand = `curl -s -X GET https://api.openai.com/v1/batches/${batchId} -H "Authorization: Bearer ${process.env.OPENAI_API_KEY}" -H "OpenAI-Beta: batches=v1"`;
        this.logger.log(`\n[DEBUG] Direct API check command:\n${curlCommand}\n`);
        this.logger.log(`Run this command to directly see the OpenAI API response.`);
        
        if (status.complete) {
          if (status.status === 'failed') {
            // Handle failed batch
            failedBatches++;
            
            // Get the raw batch status to extract error details
            const rawStatus = await this.llmService.getRawBatchStatus(batchId);
            
            this.logger.error(`- Status: ❌ FAILED`);
            
            // Log detailed error information if available
            if (rawStatus?.errors?.data && rawStatus.errors.data.length > 0) {
              this.logger.error(`- Error details:`);
              for (const error of rawStatus.errors.data) {
                this.logger.error(`  Line ${error.line}: ${error.message} (${error.code})`);
              }
            } else if (status.error) {
              this.logger.error(`- Error: ${status.error}`);
            }
            
            // Create failed directory if it doesn't exist
            const failedDir = path.join(batchInfoDir, 'failed');
            if (!fs.existsSync(failedDir)) {
              fs.mkdirSync(failedDir, { recursive: true });
            }
            
            // Move the batch files to the failed directory
            try {
              // Find the batch input file that corresponds to this batch
              const batchInputFiles = fs.readdirSync(batchInfoDir)
                .filter(file => file.startsWith('batch-input-') && file.endsWith('.jsonl'));
              
              let matchingInputFile = null;
              for (const inputFile of batchInputFiles) {
                try {
                  const fileContent = fs.readFileSync(path.join(batchInfoDir, inputFile), 'utf-8');
                  if (fileContent.includes(batchId)) {
                    matchingInputFile = inputFile;
                    break;
                  }
                } catch (readError) {
                  // Continue to next file if there's an error reading this one
                }
              }
              
              // Move the batch info file
              const batchInfoFile = `items-${batchId}.json`;
              if (fs.existsSync(path.join(batchInfoDir, batchInfoFile))) {
                fs.renameSync(
                  path.join(batchInfoDir, batchInfoFile),
                  path.join(failedDir, batchInfoFile)
                );
                this.logger.log(`- Moved batch info file to failed directory`);
              }
              
              // Move the batch input file if found
              if (matchingInputFile) {
                fs.renameSync(
                  path.join(batchInfoDir, matchingInputFile),
                  path.join(failedDir, matchingInputFile)
                );
                this.logger.log(`- Moved batch input file to failed directory`);
              }
            } catch (moveError) {
              this.logger.error(`- Failed to move batch files: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
            }
          } else {
            completedBatches++;
            this.logger.log(`- Status: ✅ COMPLETED`);
            
            // If results file exists, indicate it
            const resultsPath = path.join(process.cwd(), `.batch-results-${batchId}.json`);
            if (fs.existsSync(resultsPath)) {
              this.logger.log(`- Results: Available at ${resultsPath}`);
            } else {
              this.logger.log(`- Results: Not yet retrieved`);
            }
          }
        } else if (status.error) {
          failedBatches++;
          this.logger.error(`- Status: ❌ FAILED - ${status.error}`);
        } else {
          processingBatches++;
          this.logger.log(`- Status: ⏳ PROCESSING - Current status: ${status.status}`);
        }
      } catch (error) {
        this.logger.error(`- Status: ❓ ERROR checking batch - ${error instanceof Error ? error.message : String(error)}`);
        failedBatches++;
      }
    }
    
    this.logger.log(`\n📊 Batch Status Summary:`);
    this.logger.log(`- Total batches: ${batchFiles.length}`);
    this.logger.log(`- Completed: ${completedBatches}`);
    this.logger.log(`- Processing: ${processingBatches}`);
    this.logger.log(`- Failed: ${failedBatches}`);
    
    this.logger.log(`\n📋 Next Steps:`);
    
    if (completedBatches > 0) {
      this.logger.log(`- To process completed batches: run 'node dist/main.js jsdocs process-batch'`);
      
      if (this.testMode) {
        this.logger.log(`  Note: Test mode is enabled, will process max ${this.maxTestFiles} files per batch`);
      }
    }
    
    if (processingBatches > 0) {
      this.logger.log(`- Check again later with: 'node dist/main.js llm batch-check'`);
    }
  }
} 