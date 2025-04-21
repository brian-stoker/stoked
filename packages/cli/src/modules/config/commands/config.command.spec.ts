import { Test, TestingModule } from '@nestjs/testing';
import { ConfigCommand } from './config.command.js';
import { ConfigService } from '../config.service.js';
import { RepoCommand } from './config.repo.command.js';
import { RemoveRepoCommand } from './config.remove.repo.command.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a properly typed mock for the Command class
class MockCommand {
  name = '';
  help = vi.fn();
}

describe('ConfigCommand', () => {
  let command: ConfigCommand;
  let mockCommand: MockCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigCommand,
        { provide: ConfigService, useValue: {} }
      ],
    }).compile();

    command = module.get<ConfigCommand>(ConfigCommand);
    mockCommand = new MockCommand();
    (command as any).command = mockCommand;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should call help method on run', async () => {
    await command.run([], {});
    expect(mockCommand.help).toHaveBeenCalled();
  });
});

describe('RepoCommand', () => {
  let command: RepoCommand;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      setGitRepoPriority: vi.fn(),
      getGitRepoPriority: vi.fn(),
      getAllGitRepos: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepoCommand,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    command = module.get<RepoCommand>(RepoCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should parse priority option correctly', () => {
    expect(command.parsePriority('high')).toBe('high');
    expect(command.parsePriority('medium')).toBe('medium');
    expect(command.parsePriority('low')).toBe('low');
  });

  it('should parse top option correctly', () => {
    expect(command.parseTop()).toBe(true);
  });
});

describe('RemoveRepoCommand', () => {
  let command: RemoveRepoCommand;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      removeGitRepo: vi.fn(),
      getConfig: vi.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoveRepoCommand,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    command = module.get<RemoveRepoCommand>(RemoveRepoCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should call removeGitRepo on run', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await command.run(['owner/repo'], {});
    expect(mockConfigService.removeGitRepo).toHaveBeenCalledWith('owner', 'repo');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should validate the repo format', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    await command.run(['invalid-repo'], {});
    
    expect(mockConfigService.removeGitRepo).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Invalid repository format. Please use owner/repo format'
    );
    
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});
