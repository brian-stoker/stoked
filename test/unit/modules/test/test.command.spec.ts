import { Test } from '@nestjs/testing';
import { TestCommand } from '../../../../src/modules/test/test.command.js';
import { LlmService } from '../../../../src/modules/llm/llm.service.js';
import { MockLlmService } from '../../../utils/mock-llm.js';
import * as fs from 'fs';
import { PathLike } from 'fs';
import * as path from 'path';

jest.mock('fs');
jest.mock('child_process');

describe('TestCommand', () => {
  let testCommand: TestCommand;
  let mockLlmService: Partial<LlmService>;
  
  beforeEach(async () => {
    mockLlmService = MockLlmService.createMock();
    
    const moduleRef = await Test.createTestingModule({
      providers: [
        TestCommand,
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
      ],
    }).compile();
    
    testCommand = moduleRef.get<TestCommand>(TestCommand);
    
    // Mock fs.existsSync to return true for directory checks
    jest.spyOn(fs, 'existsSync').mockImplementation((path: PathLike) => true);
    
    // Mock fs.mkdirSync
    jest.spyOn(fs, 'mkdirSync').mockImplementation();
    
    // Mock fs.readFileSync for package.json
    jest.spyOn(fs, 'readFileSync').mockImplementation((filePath: fs.PathOrFileDescriptor) => {
      if (typeof filePath === 'string' && filePath.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-package',
          dependencies: {
            react: '^18.0.0',
            jest: '^29.0.0',
          },
          devDependencies: {
            '@testing-library/react': '^14.0.0',
            'cypress': '^12.0.0',
          },
        });
      }
      return '';
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('run', () => {
    it('should analyze repository when valid repository is provided', async () => {
      // Mock console.log to prevent test output pollution
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Arrange
      const params = ['facebook/react'];
      const options = {
        types: 'unit,integration',
        coverageTarget: 80,
      };
      
      // Act
      await testCommand.run(params, options);
      
      // Assert
      expect(fs.existsSync).toHaveBeenCalled();
      
      // Clean up
      consoleLogSpy.mockRestore();
    });
    
    it('should error when repository parameter is missing', async () => {
      // Arrange
      const loggerErrorSpy = jest.spyOn(testCommand['logger'], 'error');
      
      // Act
      await testCommand.run([], {});
      
      // Assert
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Repository parameter is required')
      );
    });
    
    it('should error when repository format is invalid', async () => {
      // Arrange
      const loggerErrorSpy = jest.spyOn(testCommand['logger'], 'error');
      
      // Act
      await testCommand.run(['invalid-format'], {});
      
      // Assert
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid repository format')
      );
    });
  });
  
  describe('analyzeRepositoryType', () => {
    it('should detect frontend-web repository', async () => {
      // Act
      const result = await testCommand['analyzeRepositoryType']('/test/repo');
      
      // Assert
      expect(result.type).toBe('frontend-web');
    });
  });
  
  describe('detectTestFrameworks', () => {
    it('should detect jest and cypress frameworks', async () => {
      // Act
      const result = await testCommand['detectTestFrameworks']('/test/repo');
      
      // Assert
      expect(result.unit).toBe('jest');
      expect(result.e2e).toBe('cypress');
      expect(result.component).toBe('react-testing-library');
    });
  });
}); 