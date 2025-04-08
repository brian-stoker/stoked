import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { LlmModule } from '../src/modules/llm/llm.module.js';
import { LLM_SERVICE } from '../src/modules/llm/llm.factory.js';
import type { LLMService } from '../src/modules/llm/llm.service.interface.js';
import { ConfigModule } from '../src/modules/config/config.module.js';

describe('Mock LLM Service', () => {
  let llmService: LLMService;
  
  // Store original env variable
  const originalLlmMode = process.env.LLM_MODE;
  
  beforeAll(async () => {
    // Set the environment variable to use the mock service
    process.env.LLM_MODE = 'MOCK';
    
    const moduleRef = await Test.createTestingModule({
      imports: [LlmModule, ConfigModule],
    }).compile();
    
    llmService = moduleRef.get<LLMService>(LLM_SERVICE);
    await llmService.initialize();
  });
  
  afterAll(() => {
    // Restore original env variable
    process.env.LLM_MODE = originalLlmMode;
  });
  
  it('should provide a mock LLM service when LLM_MODE is set to MOCK', () => {
    expect(llmService).toBeDefined();
    expect(llmService.getName()).toBe('MOCK');
  });
  
  it('should generate mock completions', async () => {
    const result = await llmService.generateCompletion('Testing mock service');
    expect(result).toContain('This is a mock response');
  });
  
  it('should generate mock JSDoc completions when prompted', async () => {
    const result = await llmService.generateCompletion('Generate JSDoc for my function');
    expect(result).toContain('Mock function description');
    expect(result).toContain('@param');
    expect(result).toContain('@returns');
  });
  
  it('should use streaming completion callback', async () => {
    let streamResult = '';
    
    await llmService.generateCompletionStream('Test prompt', (chunk) => {
      streamResult += chunk;
    });
    
    expect(streamResult).toContain('This is a mock response');
  });
}); 