// Script to test processResults functionality
// Run with: node scripts/test-processresults.js

const events = [
  { id: 1, created_at: '2023-06-05T00:00:00Z', type: 'PushEvent' },
  { id: 2, created_at: '2023-06-06T00:00:00Z', type: 'IssueEvent' },
  { id: 3, created_at: '2023-06-07T00:00:00Z', type: 'PullRequestEvent' }
];

// Define yesterday's date
let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday = yesterday.toISOString();
const formattedYesterday = yesterday.split("T")[0];

console.log(`Yesterday's date: ${formattedYesterday}`);

// Function as a direct function
const directFunction = (response) => {
  return response.filter(event => {
    const eventDate = new Date(event.created_at).toISOString().split("T")[0];
    return eventDate === formattedYesterday;
  });
};

// Function as a string (like in JS modules)
const functionAsString = `
  return $response.filter((event) => {
    const eventDate = new Date(event.created_at).toISOString().split("T")[0];
    return eventDate === formattedYesterday;
  });
`;

// Test different ways to call the function
console.log('\nTesting direct function:');
try {
  const result1 = typeof directFunction === 'function' ? 
    directFunction(events) : 
    console.log('Not recognized as function');
  console.log('Result:', result1);
} catch (error) {
  console.error('Error with direct function:', error);
}

console.log('\nTesting object with call property:');
try {
  // This simulates how arrow functions from JS modules might behave
  const objectWithCall = {
    call: function() { 
      return directFunction(events);
    }
  };
  
  const isCallable = typeof objectWithCall === 'object' && 'call' in objectWithCall;
  console.log('Is callable?', isCallable);
  
  if (isCallable) {
    const result2 = objectWithCall.call();
    console.log('Result:', result2);
  }
} catch (error) {
  console.error('Error with object with call:', error);
}

console.log('\nTesting function from string:');
try {
  const functionFromString = new Function('$response', 'formattedYesterday', functionAsString);
  const result3 = functionFromString(events, formattedYesterday);
  console.log('Result:', result3);
} catch (error) {
  console.error('Error with function from string:', error);
}

// This test simulates what happens in our actual code
console.log('\nSimulating the actual case from the task.js example:');
const testActualCase = () => {
  const fetchInput = {
    processResults: ($response) => {
      return $response.filter((event) => {
        const eventDate = new Date(event.created_at).toISOString().split("T")[0];
        return eventDate === formattedYesterday;
      });
    }
  };
  
  console.log('Type of processResults:', typeof fetchInput.processResults);
  console.log('Has call property:', 'call' in fetchInput.processResults);
  
  let responseData = events;
  
  try {
    if (typeof fetchInput.processResults === 'function' || 
        (typeof fetchInput.processResults === 'object' && 'call' in fetchInput.processResults)) {
      console.log('Executing as function or callable object');
      responseData = fetchInput.processResults(responseData);
    } else {
      console.log('Not recognized as function or callable object');
    }
    
    console.log('Final results:', responseData);
    return responseData;
  } catch (error) {
    console.error('Error in actual case simulation:', error);
  }
};

testActualCase(); 