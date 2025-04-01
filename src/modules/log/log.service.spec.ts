import { Test, TestingModule } from '@nestjs/testing';
import { LogService } from './log.service.js';

describe('LogService', () => {
  let service: LogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LogService],
    }).compile();

    service = module.get<LogService>(LogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logCompletedPR', () => {
    it('should add a completed PR to the logs', () => {
      service.logCompletedPR('owner/repo', 123);
      const logs = service.getLogs();
      
      expect(logs.completedPRs).toHaveLength(1);
      expect(logs.completedPRs[0]).toEqual({ repo: 'owner/repo', pr: 123 });
    });
  });

  describe('logStuckTask', () => {
    it('should add a stuck task to the logs', () => {
      service.logStuckTask('owner/repo', 456, 'Task is too complex');
      const logs = service.getLogs();
      
      expect(logs.stuckTasks).toHaveLength(1);
      expect(logs.stuckTasks[0]).toEqual({ 
        repo: 'owner/repo', 
        issue: 456, 
        reason: 'Task is too complex' 
      });
    });
  });

  describe('logSkippedIssue', () => {
    it('should add a skipped issue to the logs', () => {
      service.logSkippedIssue('owner/repo', 789, 'Out of scope');
      const logs = service.getLogs();
      
      expect(logs.skippedIssues).toHaveLength(1);
      expect(logs.skippedIssues[0]).toEqual({ 
        repo: 'owner/repo', 
        issue: 789, 
        reason: 'Out of scope' 
      });
    });
  });

  describe('getLogs', () => {
    it('should return all logs', () => {
      service.logCompletedPR('owner/repo1', 111);
      service.logStuckTask('owner/repo2', 222, 'Reason 1');
      service.logSkippedIssue('owner/repo3', 333, 'Reason 2');
      
      const logs = service.getLogs();
      
      expect(logs).toEqual({
        completedPRs: [{ repo: 'owner/repo1', pr: 111 }],
        stuckTasks: [{ repo: 'owner/repo2', issue: 222, reason: 'Reason 1' }],
        skippedIssues: [{ repo: 'owner/repo3', issue: 333, reason: 'Reason 2' }]
      });
    });
  });
}); 