import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const testCode = `
import React, { useState, useEffect } from 'react';

interface Props {
  initialCount: number;
  onCountChange?: (count: number) => void;
}

export const Counter = ({ initialCount, onCountChange }: Props) => {
  const [count, setCount] = useState(initialCount);
  
  useEffect(() => {
    onCountChange?.(count);
  }, [count, onCountChange]);

  const increment = () => setCount(prev => prev + 1);
  const decrement = () => setCount(prev => prev - 1);

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
};
`;

async function testSimple() {
  console.log('Testing JSDoc generation with llama3.2...\n');
  console.log('Original code:');
  console.log(testCode);

  const prompt = `Add JSDoc comments to this React TypeScript code. Follow these specific rules:

1. Documentation Placement Rules:
   - Place documentation at the highest possible scope (e.g., before interfaces, component definitions)
   - Add a new JSDoc block if there are 8 or more consecutive lines without comments
   - When adding a block due to the 8-line rule, place it at the highest scope point within that section

2. Required Documentation:
   - Interface documentation: purpose, properties, usage
   - Component documentation: functionality, props, state, effects
   - Document any complex logic or business rules
   - Include accessibility notes only if critical

3. Style Rules:
   - Keep comments focused and concise
   - Use clear, professional language
   - Avoid redundant or obvious documentation
   - No inline comments between code lines unless absolutely necessary

4. Output:
   - Return only the code with the added JSDoc blocks
   - No additional text or explanations

${testCode}`;

  try {
    console.log('\nGenerating documentation...');
    
    // Create the request body
    const requestBody = {
      model: "llama3.2:latest",
      prompt: prompt,
      stream: false
    };

    // Write request to temp file
    const tempFile = 'request.json';
    writeFileSync(tempFile, JSON.stringify(requestBody));

    // Make request using the file
    const curlCommand = `curl -X POST "http://localhost:11434/api/generate" -H "Content-Type: application/json" -d @${tempFile}`;
    console.log('\nExecuting command:');
    console.log(curlCommand);

    const response = execSync(curlCommand, { encoding: 'utf-8' });

    // Clean up temp file
    unlinkSync(tempFile);

    console.log('\nRaw response:');
    console.log(response);

    const result = JSON.parse(response);
    console.log('\nParsed response:');
    console.log(JSON.stringify(result, null, 2));

    if (result.response) {
      console.log('\nGenerated code:');
      console.log(result.response);
    } else {
      console.error('\nNo response field in the result');
    }
  } catch (error) {
    console.error('Error:', error);
    if (error.stdout) console.error('Stdout:', error.stdout);
    if (error.stderr) console.error('Stderr:', error.stderr);
  }
}

testSimple(); 