// Test script for understanding how arrow functions in modules behave
// Run with: node examples/test-process.js

// Define a sample set of GitHub events
const events = [
  { id: 1, created_at: new Date().toISOString(), type: 'Today Event' },
  { id: 2, created_at: new Date(Date.now() - 86400000).toISOString(), type: 'Yesterday Event' },
  { id: 3, created_at: new Date(Date.now() - 172800000).toISOString(), type: 'Two Days Ago Event' }
];

// Get yesterday's date
let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday = yesterday.toISOString();
const formattedYesterday = yesterday.split("T")[0];

console.log('Yesterday\'s date:', formattedYesterday);
console.log('Sample events:', events);

// This simulates how processResults is defined in process.js
const processResultsFunction = ($response) => {
  return $response.filter((event) => {
    const eventDate = new Date(event.created_at).toISOString().split("T")[0];
    return eventDate === formattedYesterday;
  });
};

// This simulates how the function is accessed after module import
const moduleExport = {
  tasks: [{
    inputs: [{
      events: {
        type: "fetch",
        url: "https://api.github.com/users/brian-stoker/events",
        processResults: processResultsFunction
      }
    }]
  }]
};

// Let's examine the function in different contexts
console.log('\n=== Function Properties Analysis ===');
console.log('Direct function typeof:', typeof processResultsFunction);
console.log('Function from module typeof:', typeof moduleExport.tasks[0].inputs[0].events.processResults);
console.log('Direct function has call:', 'call' in processResultsFunction);
console.log('Function from module has call:', 'call' in moduleExport.tasks[0].inputs[0].events.processResults);
console.log('Direct function properties:', Object.getOwnPropertyNames(processResultsFunction));
console.log('Function from module properties:', Object.getOwnPropertyNames(moduleExport.tasks[0].inputs[0].events.processResults));

// Let's try different ways to call the function
console.log('\n=== Calling Function in Different Ways ===');

// Method 1: Direct call
try {
  console.log('Method 1: Direct call');
  const result1 = processResultsFunction(events);
  console.log('Result:', result1.length, 'events filtered');
} catch (error) {
  console.error('Direct call error:', error);
}

// Method 2: Module function direct call
try {
  console.log('\nMethod 2: Module function direct call');
  const result2 = moduleExport.tasks[0].inputs[0].events.processResults(events);
  console.log('Result:', result2.length, 'events filtered');
} catch (error) {
  console.error('Module function direct call error:', error);
}

// Method 3: Using call method
try {
  console.log('\nMethod 3: Using call method');
  const processResults = moduleExport.tasks[0].inputs[0].events.processResults;
  const result3 = processResults.call(null, events);
  console.log('Result:', result3.length, 'events filtered');
} catch (error) {
  console.error('Call method error:', error);
}

// Method 4: Using apply method
try {
  console.log('\nMethod 4: Using apply method');
  const processResults = moduleExport.tasks[0].inputs[0].events.processResults;
  const result4 = processResults.apply(null, [events]);
  console.log('Result:', result4.length, 'events filtered');
} catch (error) {
  console.error('Apply method error:', error);
}

// Method 5: Force with type casting
try {
  console.log('\nMethod 5: Force with type casting');
  const processResults = moduleExport.tasks[0].inputs[0].events.processResults;
  const forcedFunction = processResults;
  const result5 = forcedFunction(events);
  console.log('Result:', result5.length, 'events filtered');
} catch (error) {
  console.error('Force with type casting error:', error);
}

// Test with modified module object (simulating deep cloning with JSON)
console.log('\n=== Testing with JSON Clone (simulates what happens in CLI) ===');
const jsonClonedModule = JSON.parse(JSON.stringify({
  tasks: [{
    inputs: [{
      events: {
        type: "fetch",
        url: "https://api.github.com/users/brian-stoker/events"
        // processResults is lost in JSON.stringify/parse
      }
    }]
  }]
}));

// Re-add the function after JSON operations
jsonClonedModule.tasks[0].inputs[0].events.processResults = processResultsFunction;

// Check properties again
console.log('JSON cloned function typeof:', typeof jsonClonedModule.tasks[0].inputs[0].events.processResults);
console.log('JSON cloned has call:', 'call' in jsonClonedModule.tasks[0].inputs[0].events.processResults);

// Try to call the function after JSON operations
try {
  console.log('\nCalling function after JSON operations:');
  const processResults = jsonClonedModule.tasks[0].inputs[0].events.processResults;
  const result = processResults(events);
  console.log('Result:', result.length, 'events filtered');
} catch (error) {
  console.error('Post-JSON function call error:', error);
}

console.log('\n=== End of Tests ==='); 