import { LlmService } from '../../src/modules/llm/llm.service.js';

/**
 * Mock LLM service for testing
 */
export class MockLlmService {
  /**
   * Create a mock implementation of the LLM service
   * 
   * @param responses Predefined responses for specific prompts
   * @returns A partial mock of the LLM service
   */
  static createMock(responses: Record<string, string | ((prompt: string) => string)> = {}) {
    const mockService: Partial<LlmService> = {
      query: async (prompt: string) => {
        for (const [pattern, response] of Object.entries(responses)) {
          // If the prompt includes the pattern, return the corresponding response
          if (prompt.includes(pattern)) {
            return typeof response === 'function' ? response(prompt) : response;
          }
        }
        
        // Default response
        return 'Mock LLM response';
      },
      
      queryWithMetadata: async (prompt: string) => {
        const responseText = await mockService.query!(prompt);
        return {
          response: responseText,
          metadata: {
            model: 'mock-model'
          }
        };
      },
      
      generateGitCommands: async (prompt: string) => {
        return 'git add .\ngit commit -m "Mock commit message"';
      },
      
      callOllamaLlm: async (prompt: string) => {
        for (const [pattern, response] of Object.entries(responses)) {
          // If the prompt includes the pattern, return the corresponding response
          if (prompt.includes(pattern)) {
            return typeof response === 'function' ? response(prompt) : response;
          }
        }
        
        // Default response
        return 'Mock Ollama response';
      },
      
      generateJSDoc: async (code: string) => {
        return `/**
 * Mock JSDoc comment
 * @param {string} param1 - First parameter
 * @returns {void}
 */`;
      },
      
      detectAIGenerated: async (code: string) => {
        return { isAIGenerated: false, confidence: 0.1 };
      },
      
      enhanceDocumentation: async (code: string, existingDocs: string) => {
        return `/**
 * Enhanced documentation
 * @param {string} param1 - First parameter
 * @returns {void}
 */`;
      },
    };
    
    return mockService;
  }
} 