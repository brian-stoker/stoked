# Stoked - Autonomous GitHub Agent

[![Test Coverage](https://img.shields.io/codecov/c/github/stoked/stoked/main.svg)](https://codecov.io/github/stoked/stoked)
[![Build Status](https://img.shields.io/github/workflow/status/stoked/stoked/CI/main.svg)](https://github.com/stoked/stoked/actions)
[![NPM Version](https://img.shields.io/npm/v/stoked.svg)](https://www.npmjs.com/package/stoked)

Stoked is an autonomous GitHub agent that automatically works on issues, writes tests, implements solutions, and creates pull requests - allowing developers to focus on high-level decisions while Stoked handles the implementation details.

## 🚀 Overview

Stoked operates as an autonomous agent that:

1. Selects issues from configured GitHub repositories based on priority
2. Automatically generates test cases for the selected issue
3. Implements code to fix the issue or add the requested feature
4. Iteratively improves both tests and code until all tests pass
5. Creates a pull request with the solution
6. Moves on to the next issue

Think of Stoked as an AI pair programmer that works tirelessly on your GitHub issues, helping your team be more productive while maintaining code quality through comprehensive test coverage.

## 📋 Key Concepts

### Autonomous Workflow

Stoked works independently through a complete development cycle:

```
Select Issue → Generate Tests → Write Code → Iterate → Create PR → Repeat
```

This autonomous workflow means issues get addressed continuously without manual intervention, reducing the time from issue creation to resolution.

### Repository Prioritization

Stoked uses a priority system (low, medium, high) to determine which GitHub repositories and issues to focus on first. This ensures that critical projects receive attention before less important ones.

### Configuration Storage

All configuration is stored in `~/.stoked/config.yaml`. This file is automatically created when needed and uses a YAML structure for storing repository priorities:

```yaml
gitRepos:
  owner1:
    repo1:
      priority: high
    repo2:
      priority: medium
  owner2:
    repo3:
      priority: low
```

### Test-First Development

Stoked follows a test-first approach, creating tests that validate the expected behavior before implementing the solution. This ensures all code changes are properly tested and verified.

## 🔧 Installation

```bash
# Install globally using npm
npm install -g stoked

# Or using pnpm
pnpm add -g stoked

# Or yarn
yarn global add stoked
```

## 🛠️ Commands

### Configuration Commands

#### Managing Repository Priorities

```bash
# Without arguments - list repositories, showing highest priority ones first
stoked config repo

# Set high priority for a repository
stoked config repo owner/repo-name -p high

# Other priority levels
stoked config repo owner/repo-name -p medium
stoked config repo owner/repo-name -p low

# Get the priority of a specific repository
stoked config repo owner/repo-name

# Filter repositories by priority
stoked config repo -p high

# Show only the repository with highest priority
stoked config repo --top
```

#### Removing Repository

```bash
# Remove a repository from the configuration
stoked config repo remove owner/repo-name
```

### Agent Commands

```bash
# Start the Stoked agent to autonomously work on issues
stoked agent:start

# View the current issue being worked on
stoked agent:status

# Pause the agent
stoked agent:pause

# Resume the agent
stoked agent:resume

# View agent activity log
stoked agent:log
```

### Search Commands

Stoked also provides enhanced GitHub search capabilities with results prioritized based on your repository configurations:

```bash
# Search for code
stoked search:code "function example"

# Search for issues and pull requests
stoked search:issues "bug authentication"

# Search for repositories
stoked search:repos "machine learning"
```

## 🧪 Development

### Prerequisites

- Node.js 18+
- pnpm 7+
- GitHub Personal Access Token with appropriate permissions

### Getting Started

```bash
# Clone the repository
git clone https://github.com/stoked/stoked.git
cd stoked

# Install dependencies
pnpm install

# Set up your GitHub token
echo "GITHUB_TOKEN=your_token_here" > .env

# Build the project
pnpm build

# Run the CLI locally
pnpm dev
```

### Project Structure

```
├── packages/
│   ├── cli/           # CLI implementation
│   │   ├── src/
│   │   │   ├── config/        # Configuration module
│   │   │   ├── repo/          # Repository operations
│   │   │   ├── agent/         # Autonomous agent logic
│   │   │   └── ...
│   └── agent/         # Agent capabilities
├── README.md
└── package.json
```

### Testing

The project uses Jest for testing. You can run tests using the following commands:

```bash
# Run all tests
pnpm test

# Run specific tests
pnpm test -- --testPathPattern=config.service

# Run tests with coverage
pnpm test -- --coverage

# Watch mode
pnpm test -- --watch
```

### Test Coverage

We maintain high test coverage for all our modules. You can view detailed coverage reports after running the tests with the `--coverage` flag. The coverage badge at the top of this README reflects the current test coverage of the main branch.

## 🔍 How Stoked Works

1. **Issue Selection**: Stoked scans configured repositories for open issues, prioritizing them based on repository priority and issue characteristics.

2. **Test Generation**: For each selected issue, Stoked analyzes the requirements and generates test cases that define the expected behavior.

3. **Implementation**: Stoked implements code changes to address the issue or add the requested feature, ensuring the implementation passes all generated tests.

4. **Iteration**: If tests fail, Stoked iteratively refines both the tests and implementation until all tests pass.

5. **Pull Request**: Once a solution is validated, Stoked creates a pull request with a detailed description of the changes, including test coverage information.

6. **Next Issue**: After creating a PR, Stoked moves on to the next highest priority issue and repeats the process.

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📩 Contact

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/stoked/stoked/issues).