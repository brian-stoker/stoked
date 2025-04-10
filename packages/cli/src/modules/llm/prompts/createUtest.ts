export const createUtestPrompt = (code: string, filePath: string, framework: string) => {
  const fileName = filePath.split(/[/\\]/).pop() || '';
  const extension = fileName.split('.').pop() || '';
  const isTypeScript = extension === 'ts' || extension === 'tsx';

  return `Generate unit tests for the following ${isTypeScript ? 'TypeScript' : 'JavaScript'} React component. 
  
The test should use the ${framework} testing framework.

Follow these specific rules:

1. Testing Fundamentals:
   - Focus on testing component behavior, not implementation details
   - Include tests for all props, user interactions, conditional rendering, and edge cases
   - Write descriptive test names that explain the expected behavior
   - Follow the AAA (Arrange-Act-Assert) pattern for test clarity
   - Use meaningful variable names that reflect their purpose

2. Component Testing Specifics:
   - Test that the component renders without crashing
   - Test all conditional rendering paths
   - Test prop validation by providing valid and invalid props
   - Test all user interactions (clicks, input changes, form submissions)
   - Test any side effects or state changes that should occur
   - Mock external dependencies and test component behavior with those mocks
   - Include at least one snapshot test if appropriate

3. Framework-Specific Guidelines:
   ${framework === 'jest' ? `
   - Use Jest's expect API for assertions
   - Use jest.fn() for creating mock functions
   - Use jest.mock() for mocking modules
   - For React components, pair with React Testing Library or Enzyme` : ''}
   
   ${framework === 'react-testing-library' || framework === 'rtl' ? `
   - Use screen queries like getBy*, queryBy*, findBy* appropriately
   - Prefer user-event over fireEvent for simulating user interactions
   - Test accessibility by using accessible queries when possible
   - Focus on testing from a user's perspective
   - Avoid testing implementation details` : ''}
   
   ${framework === 'enzyme' ? `
   - Use shallow rendering for isolated component tests
   - Use mount for testing component integration
   - Use enzyme's API for finding elements and simulating events
   - Test component lifecycle methods and state changes` : ''}

4. TypeScript-Specific Guidelines:
   ${isTypeScript ? `
   - Provide proper type annotations for test variables
   - Import types from the component file when needed
   - Use proper typing for mocked functions and objects` : ''}

5. File Structure:
   - The test file should follow the naming convention: ${fileName.replace(/\.(jsx?|tsx?)$/, '')}.test.${extension}
   - Include all necessary imports at the top of the file
   - Group related tests in describe blocks
   - Use beforeEach/afterEach for common setup and teardown

6. Output Format:
   - Return ONLY the test code file
   - Do not wrap the code in markdown code blocks
   - Do not include explanatory text
   - Include all necessary imports, especially React and testing framework imports
   - Include mock declarations as needed
   - Ensure the test file is ready to run without modifications

Source code to test:
\`\`\`
${code}
\`\`\``;
}; 