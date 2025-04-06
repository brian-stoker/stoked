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
              if (key === 'OLLAMA_MODEL') return 'llama3.2';
              if (key === 'OLLAMA_HOST') return 'http://localhost:11434';
              if (key === 'LLM_MODE') return 'OLLAMA';
              return null;
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
}); 