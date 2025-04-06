  // Add this somewhere appropriate in the file, such as near other Git operations

  // Create a pull request with the generated documentation
  private async createPullRequest(packageNames: string[]): Promise<void> {
    try {
      this.logger.log('Committing changes and creating a PR...');
      
      // Add all changes
      try {
        execSync('git add .', { encoding: 'utf8' });
      } catch (error) {
        this.logger.error(`Failed to add changes: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Create a descriptive commit message
      const commitMessage = `docs: add JSDoc comments to ${packageNames.join(', ')}`;
      try {
        execSync(`git commit -m "${commitMessage}"`, { encoding: 'utf8' });
      } catch (error) {
        // If no changes were staged, this is fine
        if (error instanceof Error && error.message.includes('nothing to commit')) {
          this.logger.log('No changes to commit');
          return;
        }
        this.logger.error(`Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Push to a branch
      try {
        execSync('git push origin HEAD:claude/jsdocs --force', { encoding: 'utf8' });
      } catch (error) {
        this.logger.error(`Failed to push to branch: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // Check if PR already exists
      let prExists = false;
      try {
        const prCheckResult = execSync('gh pr list --head claude/jsdocs --json number', { encoding: 'utf8' });
        try {
          const prData = JSON.parse(prCheckResult);
          prExists = Array.isArray(prData) && prData.length > 0;
        } catch (parseError) {
          // If parsing fails, assume no PR exists
          this.logger.debug(`Error parsing PR check result: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } catch (error) {
        this.logger.warn(`Error checking for existing PR: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with PR creation anyway
      }
      
      if (prExists) {
        this.logger.log('Pull request already exists, skipping PR creation');
        return;
      }
      
      // Create a PR
      const prBody = `This PR adds JSDoc comments to the following packages:
- ${packageNames.join('\n- ')}

## Changes
- Added JSDoc comments to functions, classes, and interfaces
- Generated components.md files for packages with React components
- Added documentation for props, usage examples, and component descriptions
- Followed consistent documentation style`;

      try {
        execSync(
          `gh pr create --title "docs: add JSDoc comments to ${packageNames.join(', ')}" --body "${prBody}" --base main`,
          { encoding: 'utf8' }
        );
        this.logger.log('Pull request created successfully');
      } catch (error) {
        this.logger.error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
      if (this.debug) {
        this.logger.debug(`PR error details: ${JSON.stringify(error)}`);
      }
    }
  } 