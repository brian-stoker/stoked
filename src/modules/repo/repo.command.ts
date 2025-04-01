import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';
import { RepoService } from './repo.service.js';
import { LlmService } from '../llm/llm.service.js';
import { THEMES, ThemeLogger } from '../../logger/theme.logger.js';
@SubCommand({
  name: 'issues',
  description: 'List open issues for a GitHub repository',
})
export class IssuesCommand extends CommandRunner {
  constructor(
    private readonly logger: ThemeLogger,
    private readonly repoService: RepoService,
  ) {
    super();
    this.logger.setTheme(THEMES['Aqua & Azure']);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    if (!passedParams.length) {
      console.error('Please provide a repository in the format owner/repo');
      return;
    }

    const repoFullName = passedParams[0];

    try {
      const issues = await this.repoService.getIssues(repoFullName);

      if (issues.length === 0) {
        console.log(`No open issues found for ${repoFullName}`);
        return;
      }

      console.log(`Open issues for ${repoFullName}:`);
      issues.forEach((issue, index) => {
        console.log(`\n[${index + 1}] #${issue.number}: ${issue.title}`);
        console.log(`URL: ${issue.html_url}`);
        if (issue.body) {
          const truncatedBody =
            issue.body.length > 150
              ? issue.body.substring(0, 150) + '...'
              : issue.body;
          console.log(`Description: ${truncatedBody}`);
        }
        console.log(
          `Created: ${issue.created_at}, Updated: ${issue.updated_at}`,
        );
        console.log(
          `Labels: ${
            issue.labels
              .map((label) => (typeof label === 'string' ? label : label.name))
              .join(', ') || 'None'
          }`,
        );
      });
    } catch (error) {
      console.error(`Error fetching issues for ${repoFullName}:`, error);
    }
  }
}

@SubCommand({
  name: 'plan',
  description: 'Analyze an issue and generate an implementation plan',
})
export class PlanCommand extends CommandRunner {
  constructor(
    private readonly repoService: RepoService,
    private readonly llmService: LlmService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEMES['Aqua & Azure']);
  }

  @Option({
    flags: '-n, --number <number>',
    description: 'Issue number to analyze',
    required: true,
  })
  parseIssueNumber(val: string): number {
    return parseInt(val, 10);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    if (!passedParams.length) {
      console.error('Please provide a repository in the format owner/repo');
      return;
    }

    const repoFullName = passedParams[0];
    const issueNumber = options?.number;

    if (!issueNumber) {
      console.error('Please provide an issue number with --number or -n flag');
      return;
    }

    console.log(`Analyzing issue #${issueNumber} from ${repoFullName}...`);

    try {
      // Get the specific issue
      const [owner, repo] = repoFullName.split('/');
      const { data: issue } = await this.repoService.getIssueDetails(
        owner,
        repo,
        issueNumber,
      );

      console.log(`\nIssue #${issue.number}: ${issue.title}`);
      console.log(`URL: ${issue.html_url}`);

      // Generate a plan using LLM
      console.log('\nGenerating implementation plan...');

      const prompt = `
You are a helpful assistant tasked with creating a detailed implementation plan for a GitHub issue.

ISSUE TITLE: ${issue.title}
ISSUE DESCRIPTION:
${issue.body || 'No description provided'}

Please create a detailed implementation plan for this issue that includes:
1. A step-by-step breakdown of tasks needed to implement a solution
2. Any relevant technical considerations (libraries, patterns to use, etc.)
3. Potential obstacles and how to overcome them
4. Estimated complexity (Easy, Medium, Hard)

Format your response as a markdown document with clear sections and bullet points where appropriate.
      `;

      try {
        const plan = await this.llmService.query(prompt);
        console.log('\nImplementation Plan:');
        console.log(plan);

        // Post the plan as a comment
        console.log('\nPosting plan as a comment to the issue...');

        try {
          // Post the plan as a comment to the issue
          await this.repoService.createIssueComment(
            owner,
            repo,
            issueNumber,
            `## Implementation Plan\n\n${plan}`,
          );

          console.log('Plan posted successfully!');
        } catch (commentError) {
          // Silently handle GitHub API errors - the plan was still generated successfully
          console.log(
            'Note: Could not post plan to GitHub (requires authentication)',
          );
        }
      } catch (llmError) {
        console.error(
          'Error: Could not generate implementation plan. Please ensure your LLM service is properly configured.',
        );
      }
    } catch (error) {
      console.error(
        `Error: Could not analyze issue #${issueNumber} from ${repoFullName}. Please check the repository and issue exist.`,
      );
    }
  }
}

@SubCommand({
  name: 'priority',
  description: 'Set or remove priority for an issue',
})
export class PriorityCommand extends CommandRunner {
  constructor(
    private readonly repoService: RepoService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEMES['Aqua & Azure']);
  }

  @Option({
    flags: '-n, --number <number>',
    description: 'Issue number to set priority for',
    required: true,
  })
  parseIssueNumber(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '-p, --priority <priority>',
    description: 'Priority level (high, medium, low)',
    required: true,
  })
  parsePriority(val: string): 'high' | 'medium' | 'low' {
    if (!['high', 'medium', 'low'].includes(val)) {
      throw new Error('Priority must be one of: high, medium, low');
    }
    return val as 'high' | 'medium' | 'low';
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    if (!passedParams.length) {
      console.error('Please provide a repository in the format owner/repo');
      return;
    }

    const repoFullName = passedParams[0];
    const issueNumber = options?.number;
    const priority = options?.priority;

    if (!issueNumber) {
      console.error('Please provide an issue number with --number or -n flag');
      return;
    }

    if (!priority) {
      console.error('Please provide a priority with --priority or -p flag');
      return;
    }

    try {
      const [owner, repo] = repoFullName.split('/');
      await this.repoService.setIssuePriority(
        owner,
        repo,
        issueNumber,
        priority,
      );
      console.log(
        `Set priority ${priority} for issue #${issueNumber} in ${repoFullName}`,
      );
    } catch (error) {
      console.error(`Error setting priority for issue #${issueNumber}:`, error);
    }
  }
}

@Command({
  name: 'repo',
  description: 'Interact with GitHub repositories',
  subCommands: [IssuesCommand, PlanCommand, PriorityCommand],
})
export class RepoCommand extends CommandRunner {
  constructor(
    private readonly repoService: RepoService,
    private readonly logger: ThemeLogger,
  ) {
    super();
    this.logger.setTheme(THEMES['Aqua & Azure']);
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    // Basic command will display help by default
    this.command.help();
  }
}
