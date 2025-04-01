import { Injectable } from '@nestjs/common';

/**
 * Interface representing a completed pull request log entry
 * @interface CompletedPRLog
 */
interface CompletedPRLog {
  /** The repository path (owner/repo) */
  repo: string;
  /** The pull request number */
  pr: number;
}

/**
 * Interface representing a stuck task log entry
 * @interface StuckTaskLog
 */
interface StuckTaskLog {
  /** The repository path (owner/repo) */
  repo: string;
  /** The issue number */
  issue: number;
  /** The reason why the task is stuck */
  reason: string;
}

/**
 * Interface representing a skipped issue log entry
 * @interface SkippedIssueLog
 */
interface SkippedIssueLog {
  /** The repository path (owner/repo) */
  repo: string;
  /** The issue number */
  issue: number;
  /** The reason why the issue was skipped */
  reason: string;
}

/**
 * Interface representing all application logs
 * @interface AppLogs
 */
interface AppLogs {
  /** Array of completed pull request logs */
  completedPRs: CompletedPRLog[];
  /** Array of stuck task logs */
  stuckTasks: StuckTaskLog[];
  /** Array of skipped issue logs */
  skippedIssues: SkippedIssueLog[];
}

/**
 * Service responsible for managing application logs
 *
 * This service provides functionality for:
 * - Logging completed pull requests
 * - Logging stuck tasks
 * - Logging skipped issues
 * - Retrieving all logs
 *
 * @class LogService
 * @implements {Injectable}
 */
@Injectable()
export class LogService {
  /** In-memory storage for all application logs */
  private logs: AppLogs = {
    completedPRs: [],
    stuckTasks: [],
    skippedIssues: [],
  };

  /**
   * Logs a completed pull request
   *
   * @param {string} repo - The repository path (owner/repo)
   * @param {number} pr - The pull request number
   * @example
   * logService.logCompletedPR('owner/repo', 123);
   */
  logCompletedPR(repo: string, pr: number) {
    this.logs.completedPRs.push({ repo, pr });
  }

  /**
   * Logs a stuck task
   *
   * @param {string} repo - The repository path (owner/repo)
   * @param {number} issue - The issue number
   * @param {string} reason - The reason why the task is stuck
   * @example
   * logService.logStuckTask('owner/repo', 456, 'Task is too complex');
   */
  logStuckTask(repo: string, issue: number, reason: string) {
    this.logs.stuckTasks.push({ repo, issue, reason });
  }

  /**
   * Logs a skipped issue
   *
   * @param {string} repo - The repository path (owner/repo)
   * @param {number} issue - The issue number
   * @param {string} reason - The reason why the issue was skipped
   * @example
   * logService.logSkippedIssue('owner/repo', 789, 'Out of scope');
   */
  logSkippedIssue(repo: string, issue: number, reason: string) {
    this.logs.skippedIssues.push({ repo, issue, reason });
  }

  /**
   * Retrieves all application logs
   *
   * @returns {AppLogs} Object containing all logs
   * @example
   * const logs = logService.getLogs();
   * console.log('Completed PRs:', logs.completedPRs);
   */
  getLogs() {
    return this.logs;
  }
}
