#!/usr/bin/env node
/**
 * Test script to verify that process.js's function reference is preserved
 * Run with: node scripts/test-process-function.js
 */

// Import required modules
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { parseJavaScriptFileAsTasks } from '../src/modules/schedule/schedule-helper.js';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up the paths
const processJsPath = path.resolve(__dirname, '../examples/process.js');
const processDebugJsPath = path.resolve(__dirname, '../examples/process-debug.js');

// Sample data similar to GitHub events
const testData = [
  { id: 1, created_at: new Date().toISOString(), type: 'Today Event' },
  { id: 2, created_at: new Date(Date.now() - 86400000).toISOString(), type: 'Yesterday Event' },
  { id: 3, created_at: new Date(Date.now() - 172800000).toISOString(), type: 'Two Days Ago Event' }
];

// Get yesterday's date for comparison
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const formattedYesterday = yesterday.toISOString().split("T")[0];

console.log('=== Testing processResults Function Preservation ===');
console.log('Yesterday\'s date:', formattedYesterday);

// Function to simulate the entire flow from parseJavaScriptFileAsTasks to execution
async function testParsingAndExecution(filePath) {
  console.log(`\nTesting file: ${path.basename(filePath)}`);
  
  try {
    // Parse the JS file
    console.log('Step 1: Parsing JavaScript file...');
    const tasks = await parseJavaScriptFileAsTasks(filePath);
    console.log(`Successfully parsed ${tasks.length} tasks`);
    
    // Check if we have a task with inputs.events.processResults
    if (tasks.length > 0 && tasks[0].inputs && tasks[0].inputs.length > 0) {
      const eventsInput = tasks[0].inputs.find(input => input.events && input.events.type === 'fetch');
      
      if (eventsInput && eventsInput.events.processResults) {
        console.log('Step 2: Found processResults function');
        console.log('Function type:', typeof eventsInput.events.processResults);
        console.log('Has call property:', 'call' in eventsInput.events.processResults);
        console.log('Function properties:', Object.getOwnPropertyNames(eventsInput.events.processResults).join(', '));
        
        // Try to call the function
        console.log('\nStep 3: Calling the function with test data...');
        try {
          const result = eventsInput.events.processResults(testData);
          console.log('Function call succeeded!');
          console.log(`Filtered from ${testData.length} to ${result.length} items`);
          
          // Verify the filtering worked correctly
          let correctlyFiltered = true;
          for (const item of result) {
            const itemDate = new Date(item.created_at).toISOString().split('T')[0];
            if (itemDate !== formattedYesterday) {
              console.error(`ERROR: Item has date ${itemDate}, expected ${formattedYesterday}`);
              correctlyFiltered = false;
            }
          }
          
          if (correctlyFiltered && result.length > 0) {
            console.log('PASS: Function correctly filtered to only yesterday\'s events');
          } else if (result.length === 0) {
            console.log('WARNING: Function filtered to 0 items - this might be correct if no items were from yesterday');
          } else {
            console.log('FAIL: Function did not filter correctly');
          }
        } catch (error) {
          console.error('ERROR: Function call failed', error);
        }
      } else {
        console.error('ERROR: No processResults function found in the parsed task');
      }
    } else {
      console.error('ERROR: No tasks with inputs found');
    }
  } catch (error) {
    console.error('ERROR:', error);
  }
}

// Test both process.js and process-debug.js
console.log('Testing with process.js...');
await testParsingAndExecution(processJsPath);

console.log('\nTesting with process-debug.js...');
await testParsingAndExecution(processDebugJsPath);

console.log('\n=== End of Test ==='); 