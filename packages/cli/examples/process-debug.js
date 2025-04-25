// Debug version of process.js with enhanced logging
// This file verifies that the processResults function works correctly

// Calculate yesterday's date
console.log('Initializing processResults debug test');
let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday = yesterday.toISOString();
const formattedYesterday = yesterday.split("T")[0];

console.log(`Today's date: ${new Date().toISOString().split('T')[0]}`);
console.log(`Yesterday's date: ${formattedYesterday}`);

let today = new Date();
today.setDate(today.getDate());
today = today.toISOString();

// Define a test function that logs when it's called
const debugFilter = ($response) => {
  console.log(`[processResults] Function called with ${$response?.length || 0} items`);
  
  // Filter events from yesterday
  const filteredResults = $response.filter((event) => {
    const eventDate = new Date(event.created_at).toISOString().split("T")[0];
    const isYesterday = eventDate === formattedYesterday;
    return isYesterday;
  });
  
  console.log(`[processResults] Filtered to ${filteredResults.length} items from yesterday (${formattedYesterday})`);
  
  // Log what was filtered
  if (filteredResults.length > 0) {
    console.log(`[processResults] Sample item date: ${new Date(filteredResults[0].created_at).toISOString().split('T')[0]}`);
  }
  
  return filteredResults;
};

// Test the filter directly to verify it works
const testData = [
  { id: 1, created_at: new Date().toISOString(), type: 'Today Event' },
  { id: 2, created_at: new Date(Date.now() - 86400000).toISOString(), type: 'Yesterday Event' },
  { id: 3, created_at: new Date(Date.now() - 172800000).toISOString(), type: 'Two Days Ago Event' }
];

console.log('\nRunning direct test of filter function:');
const testResult = debugFilter(testData);
console.log(`Direct test result: ${testResult.length} events filtered`);

export default {
  tasks: [{
    inputs: [
      {
        events: {
          type: "fetch",
          url: "https://api.github.com/users/brian-stoker/events",
          headers: [
            {
              Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
              "User-Agent": "GitHub-Event-Fetcher",
            },
          ],
          processResults: debugFilter
        },
      }
    ],
    prompt: `You are a software engineer with 25 years of experience. 
Given the github events and the activity watch data from your computer you will create a daily public post for your personal website documenting your activities for the day. The post should pick one or two key activites and describe what was accomplished it should NOT be a list of activities and events. Those are provided to give context. Items that should be replaced from the template are marked with <>.

Here are your github events:

[inputs.events]

${formattedYesterday}

Respond with ONLY the following markdown structure (no explanations or other text):

---
title: '<create a title for the post>'
description: '<create a description for this post>'
date: '${today}'
authors: [ 'brian-stoker' ]
tags: ['brianstoker.com', '.plan', 'brian-stoker']
manualCard: true
---

<Post content here in markdown>
`,
    outputs: [{
      type: "fetch",
      url: "https://brianstoker.com/api/.plan/",
      method: "POST",
      body: '$llmResponse'
    }],
  }],
} 