// Mock external dependencies
jest.mock('ollama', () => ({
  Ollama: jest.fn(),
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service.js';
import { Ollama } from 'ollama';
import { exec, execSync, ChildProcess } from 'child_process';

describe('LlmService', () => {
  let service: LlmService;
  let mockOllama: jest.Mocked<Ollama>;

  beforeEach(async () => {
    // Set env variables for testing
    process.env.LLM_HOST = 'http://localhost:11434';
    process.env.LLM_MODEL = 'test-model';

    // Set up mocks
    mockOllama = {
      generate: jest.fn(),
    } as unknown as jest.Mocked<Ollama>;

    (Ollama as jest.Mock).mockImplementation(() => mockOllama);
    (execSync as unknown as jest.Mock).mockImplementation(
      () => 'mocked output',
    );
    (exec as unknown as jest.Mock).mockImplementation(
      () => ({ pid: 123 }) as ChildProcess,
    );

    // Create testing module
    const module: TestingModule = await Test.createTestingModule({
      providers: [LlmService],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.LLM_HOST;
    delete process.env.LLM_MODEL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('query', () => {
    it('should call Ollama generate with the correct parameters', async () => {
      const testPrompt = 'Test prompt';
      const mockResponse = {
        model: 'test-model',
        created_at: new Date(),
        done: true,
        done_reason: 'stop',
        context: [],
        total_duration: 0,
        load_duration: 0,
        prompt_eval_count: 0,
        prompt_eval_duration: 0,
        eval_count: 0,
        eval_duration: 0,
        response: 'Test response',
      };
      mockOllama.generate.mockResolvedValueOnce(mockResponse);

      const result = await service.query(testPrompt);

      expect(mockOllama.generate).toHaveBeenCalledWith({
        model: 'test-model',
        prompt: testPrompt,
      });
      expect(result).toBe('Test response');
    });

    it('should use the default model if LLM_MODEL is not set', async () => {
      delete process.env.LLM_MODEL;
      const testPrompt = 'Test prompt';
      const mockResponse = {
        model: 'incept5/llama3.1-claude:latest',
        created_at: new Date(),
        done: true,
        done_reason: 'stop',
        context: [],
        total_duration: 0,
        load_duration: 0,
        prompt_eval_count: 0,
        prompt_eval_duration: 0,
        eval_count: 0,
        eval_duration: 0,
        response: 'Test response',
      };
      mockOllama.generate.mockResolvedValueOnce(mockResponse);

      await service.query(testPrompt);

      expect(mockOllama.generate).toHaveBeenCalledWith({
        model: 'incept5/llama3.1-claude:latest', // Default value from the service
        prompt: testPrompt,
      });
    });
  });

  describe('validateCommand', () => {
    it('should return true for allowed commands', () => {
      expect(service.validateCommand('git status')).toBe(true);
      expect(service.validateCommand('echo "Hello"')).toBe(true);
    });

    it('should throw an error for disallowed commands', () => {
      expect(() => service.validateCommand('rm -rf /')).toThrow(
        'Command not allowed',
      );
      expect(() => service.validateCommand('curl https://example.com')).toThrow(
        'Command not allowed',
      );
    });
  });

  describe('exec', () => {
    it('should execute allowed commands', () => {
      const result = service.exec('git status');

      expect(execSync).toHaveBeenCalledWith('git status', {
        encoding: 'utf-8',
      });
      expect(result).toBe('mocked output');
    });

    it('should throw an error for disallowed commands', () => {
      expect(() => service.exec('rm -rf /')).toThrow('Command not allowed');

      expect(execSync).not.toHaveBeenCalled();
    });
  });

  describe('execAsync', () => {
    it('should execute command asynchronously', () => {
      const result = service.execAsync('git status');

      expect(exec).toHaveBeenCalledWith('git status', { encoding: 'utf-8' });
      expect(result).toEqual({ pid: 123 });
    });
  });

  describe('editFile', () => {
    it('should create a command to edit a file', () => {
      service.editFile('test.txt', 'file content');

      expect(execSync).toHaveBeenCalledWith('echo "file content" > test.txt', {
        encoding: 'utf-8',
      });
    });
  });
});
