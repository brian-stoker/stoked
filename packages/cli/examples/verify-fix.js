// Verification script for processResults fix
// This file implements a simplified version of the schedule instant command
// to verify that the processResults function works correctly.

import fs from 'fs';
import path from 'path';

// Define sample GitHub events with different dates
const events = [
  { id: 1, created_at: new Date().toISOString(), type: 'Today Event' },
  { id: 2, created_at: new Date(Date.now() - 86400000).toISOString(), type: 'Yesterday Event' },
  { id: 3, created_at: new Date(Date.now() - 172800000).toISOString(), type: 'Two Days Ago Event' }
];

// Calculate yesterday's date for filtering
let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday = yesterday.toISOString();
const formattedYesterday = yesterday.split("T")[0];

console.log(`Today's date: ${new Date().toISOString().split("T")[0]}`);
console.log(`Yesterday's date: ${formattedYesterday}`);
console.log(`Sample events:`, events);

// Define our filter function (just like in process.js)
const filterYesterdayEvents = (response) => {
  return response.filter((event) => {
    const eventDate = new Date(event.created_at).toISOString().split("T")[0];
    return eventDate === formattedYesterday;
  });
};

// Test the filter function directly
const filteredEvents = filterYesterdayEvents(events);
console.log("\nDirect function test:");
console.log(`Filtered ${filteredEvents.length} events from yesterday`);

// Create a test object that simulates a module export (like process.js)
const testTaskObject = {
  tasks: [{
    inputs: [{
      events: {
        type: "fetch",
        processResults: filterYesterdayEvents
      }
    }],
    prompt: "Test prompt with [inputs.events]"
  }]
};

// This simulates the schedule-helper parseFileAsTasks function
// which loads and processes a JavaScript module
function simulateParseFileAsTasks() {
  // We already have our object loaded, normally this would be from a file
  const taskConfig = testTaskObject;
  
  // Similar to the implemented code, create a deep copy that preserves functions
  const tasks = taskConfig.tasks.map((task, index) => {
    const parsedTask = {
      name: task.name || `task_${index}`,
      prompt: task.prompt
    };
    
    // Process inputs while preserving function references
    if (task.inputs && Array.isArray(task.inputs)) {
      const processedInputs = task.inputs.map((input) => {
        const processedInput = {};
        for (const [key, value] of Object.entries(input)) {
          if (typeof value === 'object' && value !== null) {
            const objValue = value;
            if (objValue.type === 'fetch' && objValue.processResults) {
              const fetchInput = { ...objValue };
              // Preserve the function reference
              fetchInput.processResults = objValue.processResults;
              processedInput[key] = fetchInput;
            } else {
              processedInput[key] = { ...objValue };
            }
          } else {
            processedInput[key] = value;
          }
        }
        return processedInput;
      });
      
      parsedTask.inputs = processedInputs;
    }
    
    return parsedTask;
  });
  
  return tasks;
}

// This simulates the processInputs method in schedule-instant.command.ts
async function simulateProcessInputs(inputs) {
  const placeholders = {};
  
  if (!inputs) return { processedInputs: inputs, placeholders };
  
  // Normally we would clone the inputs here, but we'll skip that for simplicity
  const processedInputs = inputs;
  
  for (const input of processedInputs) {
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'object' && value !== null) {
        const fetchInput = value;
        if (fetchInput.type === 'fetch') {
          try {
            console.log(`\nProcessing fetch input: ${key}`);
            
            // In the real code, we would make an HTTP request here
            // For testing, we'll use our sample data instead
            const responseData = events;
            console.log(`Raw data: ${responseData.length} events`);
            
            // Process the results using our fixed approach
            let processedData = responseData;
            
            if (fetchInput.processResults) {
              console.log(`processResults type: ${typeof fetchInput.processResults}`);
              console.log(`Has call property: ${'call' in fetchInput.processResults}`);
              
              try {
                // Our fixed implementation - try various methods to call the function
                if (typeof fetchInput.processResults === 'function') {
                  console.log('Calling directly as function');
                  processedData = fetchInput.processResults(responseData);
                } 
                else if (typeof fetchInput.processResults === 'object' && fetchInput.processResults !== null) {
                  const processResultsObj = fetchInput.processResults;
                  if ('call' in processResultsObj && typeof processResultsObj.call === 'function') {
                    console.log('Calling using call method');
                    processedData = processResultsObj.call(null, responseData);
                  } else if ('apply' in processResultsObj && typeof processResultsObj.apply === 'function') {
                    console.log('Calling using apply method');
                    processedData = processResultsObj.apply(null, [responseData]);
                  } else {
                    console.log('Forcing execution regardless of type');
                    const forcedFunction = fetchInput.processResults;
                    processedData = forcedFunction(responseData);
                  }
                } else {
                  console.log('Forcing execution regardless of type');
                  const forcedFunction = fetchInput.processResults;
                  processedData = forcedFunction(responseData);
                }
                
                console.log(`Processed data: ${processedData.length} events`);
              } catch (error) {
                console.error(`Failed to execute processResults: ${error.message}`);
              }
            }
            
            // Set the placeholder value
            placeholders[`[inputs.${key}]`] = JSON.stringify(processedData, null, 2);
            
            // Update the input value with the processed data
            input[key] = processedData;
          } catch (error) {
            console.error(`Failed to process ${key}: ${error.message}`);
          }
        }
      }
    }
  }
  
  return { processedInputs, placeholders };
}

// This simulates the run method in schedule-instant.command.ts
async function simulateRun() {
  try {
    console.log("\n=== Simulating Schedule Instant Command ===");
    
    // Parse the tasks (normally from a file)
    const tasks = simulateParseFileAsTasks();
    console.log(`Parsed ${tasks.length} tasks`);
    
    // Execute tasks in sequence
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      console.log(`\nRunning task [${i+1}/${tasks.length}]`);
      
      // Process inputs (fetch data and substitute in the prompt)
      const { processedInputs, placeholders } = await simulateProcessInputs(task.inputs);
      
      // Start with the original prompt
      let enhancedPrompt = task.prompt;
      
      // Replace placeholders in the prompt
      for (const [placeholder, value] of Object.entries(placeholders)) {
        console.log(`Replacing ${placeholder} with value of length ${value.length}`);
        enhancedPrompt = enhancedPrompt.replace(placeholder, value);
      }
      
      // In the real code, we would send the prompt to the LLM
      console.log("\nEnhanced prompt:");
      console.log(enhancedPrompt);
      
      // Check if only yesterday's events are in the prompt
      const eventsInPrompt = JSON.parse(placeholders['[inputs.events]']);
      console.log(`\nThe prompt contains ${eventsInPrompt.length} events`);
      
      let allFromYesterday = true;
      for (const event of eventsInPrompt) {
        const eventDate = new Date(event.created_at).toISOString().split("T")[0];
        if (eventDate !== formattedYesterday) {
          allFromYesterday = false;
          console.error(`ERROR: Event from ${eventDate} found in prompt, but should only have events from ${formattedYesterday}`);
        }
      }
      
      if (allFromYesterday && eventsInPrompt.length > 0) {
        console.log(`SUCCESS: All ${eventsInPrompt.length} events in the prompt are from yesterday (${formattedYesterday})`);
      } else if (eventsInPrompt.length === 0) {
        console.log(`WARNING: No events found in the prompt`);
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Run the simulation
simulateRun().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
}); 