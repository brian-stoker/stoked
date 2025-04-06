import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';
import { Inject, Injectable } from '@nestjs/common';
import { RepoService } from './repo.service.js';
import { THEME_MAP, ThemeLogger, THEMES } from '../../logger/theme.logger.js';
import chalk from 'chalk';

interface SearchCommandOptions {
  filter?: string;
}

@Injectable()
@SubCommand({
  name: 'search',
  description: 'Search code in the repository',
  arguments: '<query> [filter]',
  aliases: ['find'],
})
export class SearchCommand extends CommandRunner {
  // Use a simple console logger that won't cause issues

  constructor(
    private readonly logger: ThemeLogger,
    private readonly repoService: RepoService,
  ) {
    super();
    this.logger.setTheme(THEME_MAP['Solar Eclipse']);
  }

  @Option({
    flags: '-f, --filter [filter]',
    description: 'Filter code search results (e.g. "language:typescript")',
  })
  parseFilter(val: string): string {
    return val;
  }

  async run(
    inputs: string[],
    options?: SearchCommandOptions,
  ): Promise<void> {
    try {
      if (!inputs || inputs.length === 0) {
        console.log('No search query provided');
        return;
      }

      const query = inputs[0];
      console.log(`Searching for: ${chalk.bold(query)}`);
      
      if (options?.filter) {
        console.log(`Using filter: ${chalk.italic(options.filter)}`);
      }

      const results = await this.repoService.searchCode(query, options?.filter);
      
      if (!results || results.length === 0) {
        console.log('No search results found');
        return;
      }

      console.log(chalk.bold.underline('\nSearch Results:'));
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const repoName = chalk.bold.blue(result.repoFullName);
        const title = chalk.green(result.title);
        
        // Construct a clean and well-formatted output
        console.log(`\n${chalk.gray('─'.repeat(80))}`);
        console.log(`${chalk.white.bold(`#${i + 1}`)} ${repoName}`);
        console.log(`${chalk.white('File:')} ${title}`);
        
        // Display URL if available
        if (result.url) {
          console.log(`${chalk.white('Link:')} ${chalk.cyan.underline(result.url)}`);
        }
        
        // Display code snippet if available
        if (result.codeSnippet && result.codeSnippet.length > 0) {
          const matchLine = result.lineNumbers && result.lineNumbers.length > 0 
            ? parseInt(result.lineNumbers[0], 10)
            : 0;
          
          // Calculate line numbers for display
          const startLineNum = matchLine - Math.floor(result.codeSnippet.length / 2);
          
          console.log(`\n${chalk.white('Code Snippet:')}`);
          console.log(chalk.gray('┌' + '─'.repeat(78) + '┐'));
          
          const searchTermLower = query.toLowerCase();
          
          for (let j = 0; j < result.codeSnippet.length; j++) {
            const lineNum = startLineNum + j;
            const linePrefix = `${lineNum}`.padStart(4, ' ') + ' | ';
            const line = result.codeSnippet[j] || '';
            
            // Check if the current line contains the search term
            const containsSearchTerm = line.toLowerCase().includes(searchTermLower);
            
            if (containsSearchTerm) {
              // Highlight the line containing the search term
              console.log(chalk.gray(linePrefix) + chalk.bgYellow.black(line));
            } else {
              console.log(chalk.gray(linePrefix) + line);
            }
          }
          
          console.log(chalk.gray('└' + '─'.repeat(78) + '┘'));
        }
      }
      
      console.log(`\n${chalk.gray('─'.repeat(80))}`);
      console.log(chalk.italic(`Found ${results.length} results for "${query}"\n`));
    } catch (error) {
      console.error('Error searching code:', error);
    }
  }

}