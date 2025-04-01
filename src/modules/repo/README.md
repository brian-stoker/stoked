# Repository Module

The Repository module provides services for managing and interacting with Git repositories.

## Features

- Repository initialization and management
- Git operations (clone, pull, push, etc.)
- Repository status tracking
- Branch management
- Commit history access

## Usage

### Repository Operations

```typescript
import { RepoService } from './repo.service';

const repoService = new RepoService();

// Clone a repository
await repoService.clone('repository-url', 'local-path');

// Pull latest changes
await repoService.pull('repository-path');

// Push changes
await repoService.push('repository-path');
```

### Repository Status

```typescript
// Get repository status
const status = await repoService.getStatus('repository-path');

// Check if repository is clean
const isClean = await repoService.isClean('repository-path');
```

### Branch Operations

```typescript
// Create a new branch
await repoService.createBranch('repository-path', 'branch-name');

// Switch branches
await repoService.checkout('repository-path', 'branch-name');

// Get current branch
const currentBranch = await repoService.getCurrentBranch('repository-path');
```

## Repository Structure

Each repository managed by this module follows a standard structure:

- `.git/`: Git repository data
- `src/`: Source code
- `tests/`: Test files
- `docs/`: Documentation
- `README.md`: Repository documentation

## Configuration

The module uses the following environment variables:

- `GIT_USERNAME`: Git username for authentication
- `GIT_EMAIL`: Git email for commits
- `GIT_SSH_KEY`: Path to SSH key for Git operations

## Security

The module includes security features:

- SSH key authentication
- HTTPS authentication
- Repository access validation
- Safe file operations

## Logging

All repository operations are logged using the 'Desert Sunset' theme for consistent visibility.

## Best Practices

1. Always check repository status before operations
2. Use appropriate authentication methods
3. Keep repositories up to date
4. Handle merge conflicts appropriately
5. Maintain clean commit history

## Commands

### Main Repo Command

- `stoked repo` - Shows help for repository-related commands

### Issue Commands

- `stoked repo issues owner/name` - Lists open issues for a specified repository

### Plan Commands

- `stoked repo plan owner/name -n 123` - Analyzes issue #123 and generates an implementation plan

## Functionality

The RepoService provides the following capabilities:

- **Search GitHub**:

  - `searchCode()` - Search for code within GitHub repositories
  - `searchIssuesAndPRs()` - Search for issues and pull requests
  - `searchRepositories()` - Search for GitHub repositories
  - `searchTopics()` - Search for topics on GitHub

- **Repository Operations**:
  - `getIssues()` - Retrieve issues from a specified repository
  - `createBranch()` - Create a new branch in a repository
  - `createPR()` - Create a pull request

## Usage by Other Modules

The RepoService is used by:

- The **Agent module** to fetch issues that need to be worked on
- Future commands that will interact with GitHub repos

## Note on Repository Configuration

Repository configuration (adding/removing repos from the tool's configuration) is handled by the Config module, not the Repo module. Use `stoked config repo` commands for configuring which repositories the tool works with.

## Command Reference for Config Module

If you need to configure repositories, use these Config module commands:

- `stoked config repo` - Lists all repositories by priority
- `stoked config repo -p high` - Shows only high priority repositories
- `stoked config repo --top` - Shows only the single highest priority repository
- `stoked config repo owner/name` - Shows priority for a specific repository (adds with medium priority if not found)
- `stoked config repo owner/name -p high` - Sets high priority for a repository
- `stoked config repo remove owner/name` - Removes a repository from config
