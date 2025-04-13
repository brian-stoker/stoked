import { Test, TestingModule } from '@nestjs/testing';
import { LlmService, LlmMode } from '../../../../src/modules/llm/llm.service.js';
import { ConfigService } from '../../../../src/modules/config/config.service.js';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Ollama } from 'ollama';

// Hoisted mocks
const mockExecSync = vi.hoisted(() => vi.fn().mockReturnValue('mocked output'));
const mockExec = vi.hoisted(() => vi.fn().mockReturnValue({ pid: 123 }));
const mockOllamaGenerate = vi.hoisted(() => vi.fn());

// Mock external dependencies first
vi.mock('ollama', () => {
  return {
    Ollama: vi.fn(() => ({
      generate: mockOllamaGenerate,
    })),
  };
});

// Mock child_process module
vi.mock('child_process', () => {
  return {
    exec: mockExec,
    execSync: mockExecSync,
  };
});

describe('LlmService', () => {
  let service: LlmService;
  let mockOllama: any;
  
  // Save original environment
  const originalEnv = { ...process.env };
  
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Set environment variables for testing
    process.env.OLLAMA_MODEL = 'llama3.2';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    process.env.LLM_MODE = 'OLLAMA';
    
    // Get the mocked Ollama instance
    mockOllama = new Ollama();
    
    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const configMap: Record<string, string> = {
                'OLLAMA_MODEL': 'llama3.2',
                'OLLAMA_HOST': 'http://localhost:11434',
                'LLM_MODE': 'OLLAMA',
                'OPENAI_MODEL': 'gpt-4-turbo',
                'OPENAI_API_KEY': 'test-key',
                'OPENAI_API_BASE': 'https://api.openai.com/v1',
                'OPENAI_API_VERSION': '2024-02-15'
              };
              return configMap[key] || null;
            }),
          },
        },
      ],
    }).compile();
    
    service = moduleRef.get<LlmService>(LlmService);
    
    // Manually set the Ollama client to our mocked instance
    service['ollama'] = mockOllama;
  });
  
  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });
  
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  
  describe('query', () => {
    it('should query Ollama when LLM mode is OLLAMA', async () => {
      // Mock Ollama response
      const mockResponse = {
        model: 'llama3.2',
        response: 'This is a test response',
      };
      mockOllamaGenerate.mockResolvedValueOnce(mockResponse);
      
      // Call the method
      const testPrompt = 'Test prompt';
      const result = await service.query(testPrompt);
      
      // Verify Ollama was called
      expect(mockOllamaGenerate).toHaveBeenCalledWith({
        model: 'llama3.2',
        prompt: testPrompt,
      });
      
      // Verify result
      expect(result).toBe('This is a test response');
    });
    
    it('should handle errors gracefully', async () => {
      // Mock error in Ollama client
      mockOllamaGenerate.mockRejectedValueOnce(new Error('Test error'));
      
      // Call the method and expect it to throw
      const testPrompt = 'Test prompt';
      await expect(service.query(testPrompt)).rejects.toThrow();
    });
  });
  
  describe('queryWithMetadata', () => {
    it('should return response with metadata', async () => {
      // Mock Ollama response
      const mockResponse = {
        model: 'llama3.2',
        response: 'This is a test response',
      };
      mockOllamaGenerate.mockResolvedValueOnce(mockResponse);
      
      // Call the method
      const testPrompt = 'Test prompt';
      const result = await service.queryWithMetadata(testPrompt);
      
      // Verify result
      expect(result.response).toBe('This is a test response');
      expect(result.metadata).toBeDefined();
      if (result.metadata) {
        expect(result.metadata.model).toBe('llama3.2');
      }
    });
  });
  
  // Test command validation and execution
  describe('command execution', () => {
    it('should validate allowed commands', () => {
      // These should be allowed
      expect(service['validateCommand']('git status')).toBe(true);
      expect(service['validateCommand']('echo "test"')).toBe(true);
      expect(service['validateCommand']('node script.js')).toBe(true);
      
      // These should not be allowed
      expect(() => service['validateCommand']('rm -rf /')).toThrow();
      expect(() => service['validateCommand']('curl malicious.com')).toThrow();
    });
    
    it('should execute allowed commands', () => {
      const result = service.exec('git status');
      
      expect(mockExecSync).toHaveBeenCalledWith('git status', {
        encoding: 'utf-8',
      });
      expect(result).toBe('mocked output');
    });
    
    it('should not execute disallowed commands', () => {
      expect(() => service.exec('curl malicious.com')).toThrow();
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe('getName', () => {
    it('should return the OpenAI model name when in OpenAI mode', async () => {
      // Set environment variables for OpenAI mode
      process.env.LLM_MODE = 'OPENAI';
      process.env.OPENAI_MODEL = 'gpt-4-turbo';
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OLLAMA_MODEL;
      delete process.env.OLLAMA_HOST;

      const moduleRef = await Test.createTestingModule({
        providers: [
          LlmService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string) => {
                if (key === 'LLM_MODE') return 'OPENAI';
                if (key === 'OPENAI_MODEL') return 'gpt-4-turbo';
                if (key === 'OPENAI_API_KEY') return 'test-key';
                return '';
              }),
            },
          },
        ],
      }).compile();
      
      const openaiService = moduleRef.get<LlmService>(LlmService);
      expect(openaiService.getName()).toBe('gpt-4-turbo');

      // Restore environment variables
      process.env.LLM_MODE = 'OLLAMA';
      process.env.OLLAMA_MODEL = 'llama3.2';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      delete process.env.OPENAI_MODEL;
      delete process.env.OPENAI_API_KEY;
    });

    it('should return the Ollama model name when in Ollama mode', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          LlmService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string) => {
                if (key === 'LLM_MODE') return 'OLLAMA';
                if (key === 'OLLAMA_MODEL') return 'llama3';
                return '';
              }),
            },
          },
        ],
      }).compile();
      
      const ollamaService = moduleRef.get<LlmService>(LlmService);
      expect(ollamaService.getName()).toBe('llama3');
    });
  });

  describe('getVersion', () => {
    beforeEach(() => {
      // Clear environment variables before these tests
      delete process.env.OLLAMA_MODEL;
      delete process.env.LLM_MODE;
    });

    afterEach(() => {
      // Restore environment variables
      process.env.OLLAMA_MODEL = 'llama3.2';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.LLM_MODE = 'OLLAMA';
    });

    it('should extract version from OpenAI model name', async () => {
      // Create a new instance with OpenAI mode
      const configMock = {
        get: vi.fn((key: string) => {
          if (key === 'LLM_MODE') return 'OPENAI';
          if (key === 'OPENAI_MODEL') return 'gpt-4-turbo';
          if (key === 'OPENAI_API_KEY') return 'test-key';
          return '';
        }),
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          LlmService,
          {
            provide: ConfigService,
            useValue: configMock,
          },
        ],
      }).compile();
      
      const openaiService = moduleRef.get<LlmService>(LlmService);
      
      // Override readonly properties using type assertion
      (openaiService as any).openaiModel = 'gpt-4-turbo';
      (openaiService as any).llmMode = LlmMode.OPENAI;
      
      expect(openaiService.getVersion()).toBe('4');
    });

    it('should handle OpenAI model without version number', async () => {
      // Create a new instance with OpenAI mode
      const configMock = {
        get: vi.fn((key: string) => {
          if (key === 'LLM_MODE') return 'OPENAI';
          if (key === 'OPENAI_MODEL') return 'text-davinci';
          if (key === 'OPENAI_API_KEY') return 'test-key';
          return '';
        }),
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          LlmService,
          {
            provide: ConfigService,
            useValue: configMock,
          },
        ],
      }).compile();
      
      const openaiService = moduleRef.get<LlmService>(LlmService);
      
      // Override readonly properties using type assertion
      (openaiService as any).openaiModel = 'text-davinci';
      (openaiService as any).llmMode = LlmMode.OPENAI;
      
      expect(openaiService.getVersion()).toBe('1.0');
    });

    it('should extract version from Ollama model name', async () => {
      // Create a new instance with Ollama mode
      const configMock = {
        get: vi.fn((key: string) => {
          if (key === 'LLM_MODE') return 'OLLAMA';
          if (key === 'OLLAMA_MODEL') return 'llama3.1:latest';
          if (key === 'OLLAMA_HOST') return 'http://localhost:11434';
          return '';
        }),
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          LlmService,
          {
            provide: ConfigService,
            useValue: configMock,
          },
        ],
      }).compile();
      
      const ollamaService = moduleRef.get<LlmService>(LlmService);
      
      // Override readonly properties using type assertion
      (ollamaService as any).ollamaModel = 'llama3.1:latest';
      (ollamaService as any).llmMode = LlmMode.OLLAMA;
      
      expect(ollamaService.getVersion()).toBe('3.1');
    });

    it('should handle Ollama model without version number', async () => {
      // Create a new instance with Ollama mode
      const configMock = {
        get: vi.fn((key: string) => {
          if (key === 'LLM_MODE') return 'OLLAMA';
          if (key === 'OLLAMA_MODEL') return 'llama';
          if (key === 'OLLAMA_HOST') return 'http://localhost:11434';
          return '';
        }),
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          LlmService,
          {
            provide: ConfigService,
            useValue: configMock,
          },
        ],
      }).compile();
      
      const ollamaService = moduleRef.get<LlmService>(LlmService);
      
      // Override readonly properties using type assertion
      (ollamaService as any).ollamaModel = 'llama';
      (ollamaService as any).llmMode = LlmMode.OLLAMA;
      
      expect(ollamaService.getVersion()).toBe('1.0');
    });
  });
}); 