import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config.service.js';
import {
  ConfigCommand,
  RemoveGitRepoCommand,
  RepoCommand,
} from './config.command.js';
import { jest, expect, describe, it, beforeEach } from '@jest/globals';

// Create a properly typed mock for the Command class
class MockCommand {
  help = jest.fn().mockReturnValue(this);
}

describe('ConfigCommands', () => {
  // Mock the ConfigService
  const mockConfigService = {
    setGitRepoPriority: jest.fn(),
    getGitRepoPriority: jest.fn(),
    removeGitRepo: jest.fn(),
    getAllGitRepos: jest.fn(),
    getGitReposByPriority: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ConfigCommand', () => {
    let command: ConfigCommand;
    let configService: ConfigService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ConfigCommand,
          {
            provide: ConfigService,
            useValue: {
              setGitRepoPriority: jest.fn(),
              removeGitRepo: jest.fn(),
            },
          },
        ],
      }).compile();

      command = module.get<ConfigCommand>(ConfigCommand);
      configService = module.get<ConfigService>(ConfigService);

      // Use a properly typed mock for the command object
      command['command'] = new MockCommand() as any;
    });

    it('should be defined', () => {
      expect(command).toBeDefined();
    });

    it('should display help when run', async () => {
      await command.run([], {});
      expect(command['command'].help).toHaveBeenCalled();
    });
  });

  describe('RepoCommand', () => {
    let command: RepoCommand;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RepoCommand,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
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

    it('should set the priority for a repo when priority option is provided', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await command.run(['owner/repo'], { priority: 'high' });

      expect(mockConfigService.setGitRepoPriority).toHaveBeenCalledWith(
        'owner',
        'repo',
        'high',
      );
      expect(console.log).toHaveBeenCalledWith(
        'Set priority for owner/repo to high',
      );
    });

    it('should get the priority for a repo when no priority option is provided', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      // Mock getGitRepoPriority to return a priority
      mockConfigService.getGitRepoPriority.mockReturnValue('high');

      await command.run(['owner/repo'], {});

      expect(mockConfigService.getGitRepoPriority).toHaveBeenCalledWith(
        'owner',
        'repo',
      );
      expect(console.log).toHaveBeenCalledWith('Priority for owner/repo: high');
    });

    it('should show a message if no priority is set for a repo', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      // Mock getGitRepoPriority to return undefined
      mockConfigService.getGitRepoPriority.mockReturnValue(undefined);

      await command.run(['owner/repo'], {});

      expect(mockConfigService.getGitRepoPriority).toHaveBeenCalledWith(
        'owner',
        'repo',
      );
      expect(console.log).toHaveBeenCalledWith(
        'No priority set for owner/repo',
      );
    });

    it('should list all repos by priority when run without arguments', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      // Mock getAllGitRepos to return some repos with different priorities
      const mockRepos = [
        { owner: 'owner1', repo: 'repo1', priority: 'high' },
        { owner: 'owner2', repo: 'repo2', priority: 'medium' },
        { owner: 'owner3', repo: 'repo3', priority: 'low' },
      ];
      mockConfigService.getAllGitRepos.mockReturnValue(mockRepos);

      await command.run([], {});

      expect(mockConfigService.getAllGitRepos).toHaveBeenCalled();

      // Verify output contains expected headers
      expect(console.log).toHaveBeenCalledWith('Git Repositories:');
      expect(console.log).toHaveBeenCalledWith('\nHigh Priority:');
      expect(console.log).toHaveBeenCalledWith('\nMedium Priority:');
      expect(console.log).toHaveBeenCalledWith('\nLow Priority:');

      // Verify output contains expected repositories
      expect(console.log).toHaveBeenCalledWith('  owner1/repo1');
      expect(console.log).toHaveBeenCalledWith('  owner2/repo2');
      expect(console.log).toHaveBeenCalledWith('  owner3/repo3');
    });

    it('should show a message if no repos exist when listing', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      // Mock getAllGitRepos to return an empty array
      mockConfigService.getAllGitRepos.mockReturnValue([]);

      await command.run([], {});

      expect(mockConfigService.getAllGitRepos).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('No repositories configured');
    });

    it('should filter repos by priority when priority option is provided', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      // Mock getAllGitRepos to return some repos
      const mockRepos = [
        { owner: 'owner1', repo: 'repo1', priority: 'high' },
        { owner: 'owner2', repo: 'repo2', priority: 'high' },
        { owner: 'owner3', repo: 'repo3', priority: 'medium' },
      ];
      mockConfigService.getAllGitRepos.mockReturnValue(mockRepos);

      await command.run([], { priority: 'high' });

      expect(mockConfigService.getAllGitRepos).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'Repositories with high priority:',
      );
      expect(console.log).toHaveBeenCalledWith('  owner1/repo1');
      expect(console.log).toHaveBeenCalledWith('  owner2/repo2');
    });

    it('should show only the top priority repo when top option is provided', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      // Mock getAllGitRepos to return some repos with different priorities
      const mockRepos = [
        { owner: 'owner1', repo: 'repo1', priority: 'high' },
        { owner: 'owner2', repo: 'repo2', priority: 'high' },
        { owner: 'owner3', repo: 'repo3', priority: 'medium' },
        { owner: 'owner4', repo: 'repo4', priority: 'low' },
      ];
      mockConfigService.getAllGitRepos.mockReturnValue(mockRepos);

      await command.run([], { top: true });

      expect(mockConfigService.getAllGitRepos).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'Top priority repository: owner1/repo1 (high)',
      );
    });

    it('should show only the top medium priority repo when no high priority repos exist', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      // Mock getAllGitRepos to return some repos with different priorities
      const mockRepos = [
        { owner: 'owner3', repo: 'repo3', priority: 'medium' },
        { owner: 'owner4', repo: 'repo4', priority: 'low' },
      ];
      mockConfigService.getAllGitRepos.mockReturnValue(mockRepos);

      await command.run([], { top: true });

      expect(mockConfigService.getAllGitRepos).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'Top priority repository: owner3/repo3 (medium)',
      );
    });

    it('should show an error if repo format is invalid', async () => {
      // Mock console.error
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await command.run(['invalid-format'], { priority: 'high' });

      expect(console.error).toHaveBeenCalledWith(
        'Invalid repository format. Please use owner/repo format',
      );
      expect(mockConfigService.setGitRepoPriority).not.toHaveBeenCalled();
    });
  });

  describe('RemoveGitRepoCommand', () => {
    let command: RemoveGitRepoCommand;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RemoveGitRepoCommand,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      command = module.get<RemoveGitRepoCommand>(RemoveGitRepoCommand);
    });

    it('should be defined', () => {
      expect(command).toBeDefined();
    });

    it('should remove a repo', async () => {
      // Mock console.log
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await command.run(['owner/repo'], {});

      expect(mockConfigService.removeGitRepo).toHaveBeenCalledWith(
        'owner',
        'repo',
      );
      expect(console.log).toHaveBeenCalledWith(
        'Removed owner/repo from config',
      );
    });

    it('should show an error if no repo is provided', async () => {
      // Mock console.error
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await command.run([], {});

      expect(console.error).toHaveBeenCalledWith(
        'Please provide a repository in the format owner/repo',
      );
      expect(mockConfigService.removeGitRepo).not.toHaveBeenCalled();
    });

    it('should show an error if repo format is invalid', async () => {
      // Mock console.error
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await command.run(['invalid-format'], {});

      expect(console.error).toHaveBeenCalledWith(
        'Invalid repository format. Please use owner/repo format',
      );
      expect(mockConfigService.removeGitRepo).not.toHaveBeenCalled();
    });
  });
});
