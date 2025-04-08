import type { Provider } from '@nestjs/common';
import type { LLMService } from './llm.service.interface.js';
import { LlmService } from './llm.service.js';
import { MockLLMService } from './mock-llm.service.js';
import { ConfigService } from '../config/config.service.js';

/**
 * Token for the LLM service provider
 */
export const LLM_SERVICE = 'LLM_SERVICE';

/**
 * Factory provider for the LLM service
 * Returns either the real implementation or the mock implementation based on environment
 */
export const LlmServiceProvider: Provider = {
  provide: LLM_SERVICE,
  useFactory: (configService: ConfigService) => {
    const llmMode = process.env.LLM_MODE || 'OLLAMA';
    
    if (llmMode === 'MOCK') {
      console.log('Using MockLLMService for testing');
      return new MockLLMService();
    }
    
    return new LlmService(configService);
  },
  inject: [ConfigService]
}; 