import { Injectable } from '@nestjs/common';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { RepoService } from './repo.service.js';
import { ThemeLogger, THEME_MAP } from '../../logger/theme.logger.js';
import { LlmService } from '../llm/llm.service.js';

@Injectable()
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
    this.logger.setTheme(THEME_MAP['Aqua & Azure']);
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
