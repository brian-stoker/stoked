import { FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright tests
 * 
 * This runs before all tests to set up the environment
 */
async function globalSetup(config: FullConfig) {
  // Setup environment variables
  process.env.NODE_ENV = 'test';
  
  // Mock Ollama for tests to avoid actual API calls
  process.env.LLM_MODE = 'MOCK';  // Use a mock mode for testing
  
  console.log('Global setup complete');
}

export default globalSetup; 