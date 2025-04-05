import { LlmService } from './modules/llm/llm.service.js';
import { ConfigService } from './modules/config/config.service.js';
import { ThemeLogger } from './logger/theme.logger.js';

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

async function testJsDocGeneration() {
  const logger = new ThemeLogger();
  const configService = new ConfigService();
  const llmService = new LlmService(configService);

  logger.log('Testing JSDoc generation...\n');
  logger.log('Original code:');
  logger.log('----------------------------------------');
  logger.log(testCode);
  logger.log('----------------------------------------\n');

  const prompt = `Please generate detailed JSDoc documentation for the following TypeScript web application code. Follow these specific requirements:

1. For each component, include:
   - A detailed description of the component's purpose and functionality
   - All props with their types and descriptions
   - Any state variables and their purposes
   - Any hooks used and their effects
   - Any event handlers and their purposes
   - Any context providers or consumers
   - Any Redux/state management interactions
   - Any API calls or data fetching logic
   - Any performance considerations or optimizations
   - Any accessibility considerations
   - Any browser compatibility notes
   - Any dependencies or requirements

2. For each function/method, include:
   - A detailed description of what the function does
   - All parameters with their types and descriptions
   - The return type and description
   - Any side effects or state changes
   - Any error handling
   - Any performance implications
   - Any dependencies on other functions or state
   - Any browser compatibility notes
   - Any security considerations

3. For each type/interface, include:
   - A detailed description of the type's purpose
   - All properties with their types and descriptions
   - Any constraints or validations
   - Any relationships with other types
   - Any example usage

4. For each hook, include:
   - A detailed description of the hook's purpose
   - All parameters with their types and descriptions
   - The return value and its structure
   - Any side effects
   - Any cleanup logic
   - Any dependencies
   - Any performance considerations
   - Any error handling

5. For each context, include:
   - A detailed description of the context's purpose
   - The structure of the context value
   - Any providers or consumers
   - Any state management
   - Any side effects
   - Any performance considerations

6. For each API service, include:
   - A detailed description of the service's purpose
   - All endpoints and their purposes
   - All request/response types
   - Any error handling
   - Any authentication requirements
   - Any rate limiting considerations
   - Any caching strategies
   - Any retry logic

7. For each utility function, include:
   - A detailed description of the function's purpose
   - All parameters with their types and descriptions
   - The return type and description
   - Any edge cases handled
   - Any performance considerations
   - Any browser compatibility notes

8. For each constant or configuration, include:
   - A detailed description of the constant's purpose
   - Any relationships with other constants
   - Any environment-specific values
   - Any security considerations

9. For each test file, include:
   - A detailed description of what is being tested
   - Any test setup or teardown
   - Any mock data or fixtures
   - Any test coverage considerations
   - Any performance testing notes

10. For each style file, include:
    - A detailed description of the styling approach
    - Any theme variables or tokens
    - Any responsive design considerations
    - Any browser compatibility notes
    - Any accessibility considerations

Please ensure all documentation:
- Is clear and concise
- Uses proper TypeScript types
- Includes examples where helpful
- Notes any potential issues or gotchas
- References related components or functions
- Includes any necessary warnings or cautions
- Notes any breaking changes or deprecations
- Includes any performance optimizations
- Notes any security considerations
- Includes any accessibility requirements

Please format the documentation in a consistent style and ensure it follows JSDoc best practices.

Code to document:
${testCode}`;

  try {
    logger.log('Generating documentation...\n');
    const dockedCode = await llmService.query(prompt);
    
    if (dockedCode === 'No analysis available at this time.') {
      logger.error('LLM returned no analysis');
      return;
    }

    logger.log('Generated code with JSDoc comments:');
    logger.log('----------------------------------------');
    logger.log(dockedCode);
    logger.log('----------------------------------------');

    // Verify code integrity
    const cleanOriginal = testCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').replace(/\s+/g, '');
    const cleanDocumented = dockedCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').replace(/\s+/g, '');
    
    if (cleanOriginal === cleanDocumented) {
      logger.log('\nCode integrity verified: Only comments were added/modified');
    } else {
      logger.error('\nWarning: Code may have been modified during documentation');
    }
  } catch (error) {
    logger.error('Error:', (error as Error).message);
  }
}

// Run the test
testJsDocGeneration(); 