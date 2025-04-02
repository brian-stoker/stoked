import { LlmService } from './services/llm.service.js';
import { ThemeLogger } from './logger/theme.logger.js';

const testCode = `
function add(a: number, b: number): number {
  return a + b;
}
`;

async function testSimple() {
  const logger = new ThemeLogger();
  const llmService = new LlmService(logger);

  logger.log('Testing JSDoc generation with llama3.2...\n');
  logger.log('Original code:');
  logger.log(testCode);

  const prompt = `Add JSDoc comments to this TypeScript code. Include parameter descriptions, return type, and any relevant details:

${testCode}`;

  try {
    logger.log('\nGenerating documentation...');
    const response = await llmService.generateJsDoc(prompt);
    logger.log('\nGenerated code:');
    logger.log(response);
  } catch (error) {
    logger.error('Error:', error);
  }
}

testSimple().catch(console.error); 