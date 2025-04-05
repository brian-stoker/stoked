// Debug script to directly check OpenAI batch status
require('dotenv').config();

// The batch ID to check - REPLACE THIS with your batch ID
const batchId = 'batch_67f05b03dea48190b78c3804eeb4a9c9';

async function checkBatch() {
  console.log(`Checking batch ${batchId}...`);
  
  try {
    const response = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'batches=v1'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error: ${response.status} - ${errorText}`);
      return;
    }
    
    const result = await response.json();
    console.log('======== BATCH API RESPONSE ========');
    console.log(JSON.stringify(result, null, 2));
    console.log('====================================');
    
    // Check for output file
    if (result.output_file_id) {
      console.log(`\nOutput file ID: ${result.output_file_id}`);
      
      // Try to get file info
      const fileResponse = await fetch(`https://api.openai.com/v1/files/${result.output_file_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      });
      
      if (fileResponse.ok) {
        const fileInfo = await fileResponse.json();
        console.log('\n======== FILE INFO ========');
        console.log(JSON.stringify(fileInfo, null, 2));
        console.log('============================');
      } else {
        console.log(`File info request failed: ${fileResponse.status}`);
      }
    } else {
      console.log('No output file available.');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

checkBatch(); 