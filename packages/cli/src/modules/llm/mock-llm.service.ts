import { Injectable } from '@nestjs/common';
import type { LLMService } from './llm.service.interface.js';

/**
 * A mock implementation of the LLM service for testing purposes.
 * This service returns predefined responses without making actual API calls.
 */
@Injectable()
export class MockLLMService implements LLMService {
  private isInitialized = false;

  /**
   * Initialize the mock LLM service
   * @returns A promise that resolves to true if initialization is successful
   */
  async initialize(): Promise<boolean> {
    this.isInitialized = true;
    return Promise.resolve(true);
  }

  /**
   * Check if the mock LLM service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Generate a mock completion response
   * @param prompt The prompt text
   * @returns A mock completion response
   */
  async generateCompletion(prompt: string): Promise<string> {
    // For JSDoc generation, create a mock JSDoc comment
    if (prompt.includes('Generate JSDoc')) {
      return `/**
 * Mock function description
 * 
 * This is a mock JSDoc comment generated for testing purposes.
 * @param {string} param1 - First parameter description
 * @param {number} param2 - Second parameter description
 * @returns {boolean} Mock return description
 */`;
    }
    
    // Default mock response
    return "This is a mock response from the MockLLMService";
  }

  /**
   * Generate a mock completion as a stream
   * @param prompt The prompt text
   * @param callback Callback function that receives each chunk of the response
   */
  async generateCompletionStream(prompt: string, callback: (text: string) => void): Promise<void> {
    const mockResponse = await this.generateCompletion(prompt);
    
    // Split the response into chunks to simulate streaming
    const chunks = mockResponse.split('\n');
    
    for (const chunk of chunks) {
      callback(chunk + '\n');
      // Add a small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Get the name of this service
   * @returns The service name
   */
  getName(): string {
    return 'MOCK';
  }
} 