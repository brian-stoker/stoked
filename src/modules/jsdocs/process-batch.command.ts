import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { ThemeLogger } from '../../logger/theme.logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as os from 'os';

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
  items: Array<{
    requestId: number;
    filePath: string;
    isEntryPoint: boolean;
  }>;
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

  async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
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
    
    let processedBatches = 0;
    let skippedBatches = 0;
    let failedBatches = 0;
    
    // Process each batch
    for (const batchFile of batchFiles) {
      const { content: batchInfo, batchId } = batchFile;
      
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
        
        await this.processBatch(batchInfo, batchResults);
        
        // After successful processing, move the batch info file to a "processed" folder instead of deleting it
        const processedDir = path.join(path.dirname(batchFile.filePath), 'processed');
        if (!fs.existsSync(processedDir)) {
          fs.mkdirSync(processedDir, { recursive: true });
        }
        
        // Move the batch info file
        const newFilePath = path.join(processedDir, path.basename(batchFile.filePath));
        try {
          fs.copyFileSync(batchFile.filePath, newFilePath);
          fs.unlinkSync(batchFile.filePath);
          this.logger.log(`Moved processed batch info file to ${newFilePath}`);
        } catch (moveError) {
          this.logger.error(`Failed to move batch info file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
        }
        
        // Also move the results file if it exists
        if (fs.existsSync(batchResultsPath)) {
          const newResultsPath = path.join(processedDir, `results-${batchId}.json`);
          try {
            fs.copyFileSync(batchResultsPath, newResultsPath);
            this.logger.log(`Copied batch results to ${newResultsPath}`);
            // Do not delete the original results file
          } catch (moveError) {
            this.logger.error(`Failed to copy results file: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
          }
        }
        
        // Delete the debug file if it exists - no longer needed for successful batches
        if (debugFilePath && fs.existsSync(debugFilePath)) {
          try {
            fs.unlinkSync(debugFilePath);
            this.logger.log(`Deleted debug file ${debugFilePath}`);
          } catch (deleteError) {
            this.logger.warn(`Failed to delete debug file: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
          }
        }
        
        processedBatches++;
      } catch (error) {
        this.logger.error(`Error processing batch ${batchId}: ${error instanceof Error ? error.message : String(error)}`);
        failedBatches++;
      }
    }
    
    this.logger.log(`Batch processing summary:`);
    this.logger.log(`- Successfully processed: ${processedBatches} batches`);
    this.logger.log(`- Still processing: ${skippedBatches} batches`);
    this.logger.log(`- Failed: ${failedBatches} batches`);
    
    if (skippedBatches > 0) {
      this.logger.log(`Run this command again later to process remaining batches once they complete.`);
    }
  }
  
  /**
   * Process a specific batch
   */
  private async processBatch(batchInfo: BatchInfo, batchResults: any[]): Promise<void> {
    const { batchId, packagePath } = batchInfo;
    
    this.logger.log(`Processing batch ${batchId} for package ${packagePath}`);
    this.logger.log(`Batch has ${batchInfo.items.length} items and ${batchResults.length} results`);
    
    // If the structure doesn't match what we expect, log it for debugging
    if (batchResults.length > 0) {
      this.logger.log(`[DEBUG] Result format: ${JSON.stringify(Object.keys(batchResults[0]))}`);
      if (batchResults[0].choices) {
        this.logger.log(`[DEBUG] Response is in 'choices' array: ${JSON.stringify(Object.keys(batchResults[0].choices[0]))}`);
      }
    }
    
    // Verify the package path exists
    if (!fs.existsSync(packagePath)) {
      this.logger.error(`Package path does not exist: ${packagePath}`);
      this.logger.log(`This could happen if the batch was created on a different machine or the path is no longer valid.`);
      this.logger.log(`Current working directory: ${process.cwd()}`);
      this.logger.log(`You may need to manually set the correct base path for these files.`);
      
      // Log all item file paths for debugging
      this.logger.log(`Files in this batch:`);
      batchInfo.items.forEach((item, index) => {
        this.logger.log(`[${index}] ${item.filePath}`);
      });
      
      return;
    }
    
    // Create object to track batch statistics
    const batchStats = {
      jsDocBlocksAdded: 0,
      componentsDocumented: 0
    };
    
    // Store components found during processing
    const componentDocs: ComponentDoc[] = [];
    
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
    
    // Process each result
    for (let i = 0; i < Math.min(itemsToProcess.length, batchResults.length); i++) {
      const item = itemsToProcess[i];
      // Extract the response from the result
      // The OpenAI Batch API returns results in JSONL format with choices array
      let response: string | undefined;
      
      if (batchResults[i]) {
        // Log the full structure to help debug
        this.logger.log(`[DEBUG] Result structure for item ${i}: ${JSON.stringify(Object.keys(batchResults[i]))}`);
        
        if (batchResults[i].choices && batchResults[i].choices[0] && batchResults[i].choices[0].message) {
          // Standard OpenAI format
          response = batchResults[i].choices[0].message.content;
        } else if (batchResults[i].response && typeof batchResults[i].response === 'string') {
          // Our custom format in case we've already processed it
          response = batchResults[i].response;
        } else if (batchResults[i].response && batchResults[i].response.body) {
          // New OpenAI Batch API format
          try {
            if (typeof batchResults[i].response.body === 'string') {
              // Sometimes body is a string that needs parsing
              const bodyObj = JSON.parse(batchResults[i].response.body);
              if (bodyObj.choices && bodyObj.choices[0] && bodyObj.choices[0].message) {
                response = bodyObj.choices[0].message.content;
              }
            } else if (typeof batchResults[i].response.body === 'object') {
              // Sometimes body is already an object
              const bodyObj = batchResults[i].response.body;
              if (bodyObj.choices && bodyObj.choices[0] && bodyObj.choices[0].message) {
                response = bodyObj.choices[0].message.content;
              }
            }
          } catch (parseError) {
            this.logger.error(`Failed to parse response body: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            this.logger.log(`Response body: ${JSON.stringify(batchResults[i].response.body).substring(0, 200)}...`);
          }
        } else {
          // Log the result structure to help debugging
          this.logger.error(`Unknown result format for item ${i}:`);
          this.logger.error(JSON.stringify(batchResults[i]).substring(0, 500) + '...');
          continue;
        }
      }
      
      if (!response) {
        this.logger.error(`Missing response for item ${i}`);
        this.logger.error(`Result data at index ${i}: ${JSON.stringify(batchResults[i])}`);
        continue;
      }
      
      // Get the file path and make sure it's absolute
      let filePath = item.filePath;
      if (!path.isAbsolute(filePath)) {
        filePath = path.join(packagePath, filePath);
      }
      
      this.logger.log(`Processing file ${filePath} from batch results`);
      
      // Load the original file content
      let originalCode: string;
      try {
        if (!fs.existsSync(filePath)) {
          this.logger.error(`File does not exist: ${filePath}`);
          continue;
        }
        originalCode = fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        this.logger.error(`Failed to read original file: ${filePath} - ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      
      // Clean up any markdown formatting in the response
      const cleanedResponse = this.cleanLLMResponse(response);
      
      // Verify the response is valid code
      if (!cleanedResponse || cleanedResponse.trim().length === 0) {
        this.logger.error(`Empty response from LLM for file: ${filePath}`);
        continue;
      }

      // Count new JSDoc blocks
      const originalJsDocMatches = originalCode.match(/\/\*\*[\s\S]*?\*\//g);
      const newJsDocMatches = cleanedResponse.match(/\/\*\*[\s\S]*?\*\//g);
      const originalCount = originalJsDocMatches ? originalJsDocMatches.length : 0;
      const newCount = newJsDocMatches ? newJsDocMatches.length : 0;
      const newDocsCount = newCount - originalCount;

      // Track the JSDoc blocks added in this batch
      batchStats.jsDocBlocksAdded += newDocsCount;

      // Write the documented code back to the file
      try {
        fs.writeFileSync(filePath, cleanedResponse);
        this.logger.log(`Updated file ${filePath} - Added ${newDocsCount} JSDoc blocks`);
      } catch (writeError) {
        this.logger.error(`Failed to write to file: ${filePath} - ${writeError instanceof Error ? writeError.message : String(writeError)}`);
        continue;
      }

      // Extract component info if it's a component file
      const extractedInfo = this.extractComponentInfo(cleanedResponse, filePath);
      if (extractedInfo) {
        componentDocs.push(extractedInfo);
        batchStats.componentsDocumented++;
      }
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
    
    // Create pull request with the changes
    if (batchStats.jsDocBlocksAdded > 0 || batchStats.componentsDocumented > 0) {
      try {
        const packageName = path.basename(packagePath);
        await this.createPullRequest([packageName], packagePath);
      } catch (prError) {
        this.logger.error(`Failed to create pull request: ${prError instanceof Error ? prError.message : String(prError)}`);
      }
    } else {
      this.logger.log(`No changes made, skipping pull request creation`);
    }
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
    // Look for React component definitions with JSDoc
    const componentMatch = code.match(/\/\*\*\s*([\s\S]*?)\*\/\s*(export\s+(?:default\s+)?(?:function|const|class)\s+(\w+))/);
    
    if (!componentMatch || !componentMatch[1] || !componentMatch[3]) {
      return null;
    }
    
    const jsDoc = componentMatch[1];
    const componentName = componentMatch[3];
    
    // Parse JSDoc content
    const descriptionMatch = jsDoc.match(/@description\s+(.*?)(?=@|$)/s) || jsDoc.match(/\*\s*([^@].*?)(?=@|$)/s);
    const description = descriptionMatch?.[1]?.trim();
      
    const propsMatch = jsDoc.match(/@props\s+(.*?)(?=@|$)/s);
    const props = propsMatch?.[1]?.trim();
    
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
    const filteredComponents = components.filter(doc => doc.filePath.startsWith(packageRoot));
    
    if (filteredComponents.length === 0) {
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
    fs.writeFileSync(docsPath, markdown);
    this.logger.log(`Generated components.md with documentation for ${filteredComponents.length} components at ${docsPath}`);
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
   * Gets the current stoked version from package.json
   */
  private getStokedVersion(packagePath?: string): string {
    try {
      // Get the Stoked tool version from the package.json in the project root
      // This represents the version of the documentation generator being used
      const packageJsonPath = packagePath ? 
        path.resolve(packagePath, 'package.json') : 
        path.resolve(process.cwd(), 'package.json');
        
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          // Use the package version if available
          if (packageJson.version) {
            return packageJson.version;
          } else {
            this.logger.debug(`Package.json at ${packageJsonPath} does not have a version field`);
          }
        } catch (err) {
          this.logger.debug(`Error parsing package.json: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      // Try to get version via command directly as fallback
      try {
        const util = require('util');
        const { exec } = require('child_process');
        const execSync = util.promisify(exec);
        const { stdout: versionOutput } = execSync('stoked -v', { encoding: 'utf8' });
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
      // Use dynamic import instead of require for better compatibility
      let execPromise;
      try {
        const util = await import('util');
        const childProcess = await import('child_process');
        execPromise = util.promisify(childProcess.exec);
      } catch (importError) {
        this.logger.error(`Failed to import child_process: ${importError instanceof Error ? importError.message : String(importError)}`);
        this.logger.log(`Skipping PR creation, but documentation was generated successfully`);
        return;
      }
      
      // Get the Stoked tool version for branch name
      const stokedVersion = this.getStokedVersion(packagePath);
      
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
        const { stdout: localBranches } = await execPromise('git branch', execOptions);
        if (localBranches.includes(branchName)) {
          await execPromise(`git checkout ${branchName}`, execOptions);
        } else {
          // Check if branch exists remotely
          const { stdout: remoteBranches } = await execPromise('git branch -r', execOptions);
          if (remoteBranches.includes(`origin/${branchName}`)) {
            await execPromise(`git checkout -b ${branchName} origin/${branchName}`, execOptions);
          } else {
            // Create new branch
            await execPromise(`git checkout -b ${branchName}`, execOptions);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to create/switch to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // Add all changes
      this.logger.log('Adding changes to git...');
      try {
        await execPromise('git add .', execOptions);
      } catch (error) {
        this.logger.error(`Failed to add changes: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if we have changes to commit
      const { stdout: status } = await execPromise('git status --porcelain', execOptions);
      if (!status.trim()) {
        this.logger.log('No changes to commit');
        return;
      }
      
      // Create a descriptive commit message
      const commitMessage = `docs: add JSDoc comments to ${packageNames.join(', ')}`;
      this.logger.log('Committing changes...');
      try {
        await execPromise(`git commit -m "${commitMessage}"`, execOptions);
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
        await execPromise(`git push origin ${branchName} --force`, execOptions);
      } catch (error) {
        this.logger.error(`Failed to push to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if PR already exists
      this.logger.log('Checking for existing pull request...');
      let prExists = false;
      try {
        const { stdout: prCheckResult } = await execPromise(`gh pr list --head ${branchName} --json number`, execOptions);
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

Generated using Stoked v${this.getStokedVersion(packagePath).replace(/-/g, '.')}`;

      try {
        await execPromise(
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
} 