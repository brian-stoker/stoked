import { Test } from '@nestjs/testing';
import { LlmService, LlmMode } from '../../../../src/modules/llm/llm.service.js';
import { ConfigService } from '../../../../src/modules/config/config.service.js';
import axios from 'axios';

jest.mock('axios');
jest.mock('ollama');

describe('LlmService', () => {
  let service: LlmService;
  let configService: ConfigService;
  
  const mockOllamaResponse = {
    model: 'llama3.2',
    response: 'This is a mock response from Ollama',
  };
  
  const mockOpenAIResponse = {
    data: {
      choices: [
        {
          message: {
            content: 'This is a mock response from OpenAI',
          },
        },
      ],
    },
  };
  
  // Save original environment
  const originalEnv = { ...process.env };
  
  beforeEach(async () => {
    // Setup environment variables for testing
    process.env.OLLAMA_MODEL = 'llama3.2';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.OPENAI_MODEL = 'gpt-4o';
    
    // Mock axios for OpenAI calls
    (axios.post as jest.Mock).mockResolvedValue(mockOpenAIResponse);
  });
  
  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });
  
  describe('with OLLAMA mode', () => {
    beforeEach(async () => {
      // Set up environment for Ollama mode
      process.env.LLM_MODE = 'OLLAMA';
      
      const moduleRef = await Test.createTestingModule({
        providers: [
          LlmService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'OLLAMA_MODEL') return 'llama3.2';
                if (key === 'OLLAMA_HOST') return 'http://localhost:11434';
                if (key === 'OPENAI_API_KEY') return 'sk-test-key';
                if (key === 'OPENAI_MODEL') return 'gpt-4o';
                if (key === 'LLM_MODE') return 'OLLAMA';
                return null;
              }),
            },
          },
        ],
      }).compile();
      
      service = moduleRef.get<LlmService>(LlmService);
      configService = moduleRef.get<ConfigService>(ConfigService);
      
      // Mock Ollama client
      service['ollama'] = {
        generate: jest.fn().mockResolvedValue(mockOllamaResponse),
      } as any;
    });
    
    it('should query Ollama', async () => {
      // Setup spy on queryOllama
      const queryOllamaSpy = jest.spyOn(service as any, 'queryOllama');
      
      // Call the method
      const testPrompt = 'Test prompt';
      const result = await service.query(testPrompt);
      
      // Verify queryOllama was called
      expect(queryOllamaSpy).toHaveBeenCalledWith(testPrompt);
      
      // Verify result
      expect(result).toBe(mockOllamaResponse.response);
    });
    
    it('should return response with metadata', async () => {
      // Call the method
      const testPrompt = 'Test prompt';
      const result = await service.queryWithMetadata(testPrompt);
      
      // Verify result
      expect(result.response).toBe(mockOllamaResponse.response);
      expect(result.metadata).toBeDefined();
      if (result.metadata) {
        expect(result.metadata.model).toBe('llama3.2');
      }
    });
    
    it('should handle errors gracefully', async () => {
      // Mock error in Ollama client
      service['ollama'].generate = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Call the method and expect it to throw
      const testPrompt = 'Test prompt';
      await expect(service.query(testPrompt)).rejects.toThrow();
    });
  });
  
  describe('with OPENAI mode', () => {
    beforeEach(async () => {
      // Set up environment for OpenAI mode
      process.env.LLM_MODE = 'OPENAI';
      
      const moduleRef = await Test.createTestingModule({
        providers: [
          LlmService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'OLLAMA_MODEL') return 'llama3.2';
                if (key === 'OLLAMA_HOST') return 'http://localhost:11434';
                if (key === 'OPENAI_API_KEY') return 'sk-test-key';
                if (key === 'OPENAI_MODEL') return 'gpt-4o';
                if (key === 'LLM_MODE') return 'OPENAI';
                return null;
              }),
            },
          },
        ],
      }).compile();
      
      service = moduleRef.get<LlmService>(LlmService);
      configService = moduleRef.get<ConfigService>(ConfigService);
    });
    
    it('should query OpenAI', async () => {
      // Setup spy on queryOpenAI
      const queryOpenAISpy = jest.spyOn(service as any, 'queryOpenAI');
      
      // Call the method
      const testPrompt = 'Test prompt';
      const result = await service.query(testPrompt);
      
      // Verify queryOpenAI was called
      expect(queryOpenAISpy).toHaveBeenCalledWith(testPrompt);
      
      // Verify result matches what we'd expect from our mock
      expect(result).toContain('This is a mock response from OpenAI');
    });
  });
}); 