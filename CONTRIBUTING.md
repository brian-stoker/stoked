# Contributing to Stoked

Thank you for your interest in contributing to Stoked! This document provides guidelines and instructions for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 7+
- Git

### Getting Started

1. Clone the repository:

```bash
git clone https://github.com/stoked/stoked.git
cd stoked
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
# Copy the example environment file
cp packages/cli/.env.example packages/cli/.env

# Edit the .env file to add your API keys
nano packages/cli/.env  # or use your preferred editor
```

At minimum, you'll need to set up:

```
# For GitHub operations
GITHUB_TOKEN=your_github_token_here

# For OpenAI operations (if using)
OPENAI_API_KEY=your_openai_api_key_here
```

4. Build the project:

```bash
pnpm build
```

5. Run the CLI locally:

```bash
pnpm dev
```

## Testing

The project uses Vitest for unit and integration tests, and Playwright for end-to-end tests.

```bash
# Run unit tests
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Run all tests
pnpm test

# Generate test coverage
pnpm test:cov
```

## Code Style

We use ESLint and Prettier to enforce a consistent code style:

```bash
# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: Code changes that neither fix a bug nor add a feature
- `test`: Adding or modifying tests
- `chore`: Changes to build process or auxiliary tools

## Local Environment Configuration

### Ollama Setup

To use Ollama locally:

1. Install Ollama: https://ollama.com/
2. Pull the necessary models: `ollama pull llama3.2`
3. Start the Ollama server: `ollama serve`
4. Configure your `.env` file to use Ollama:

```
LLM_MODE=OLLAMA
OLLAMA_MODEL=llama3.2:latest
OLLAMA_HOST=http://localhost:11434
```

### OpenAI Setup

To use OpenAI:

1. Get an API key from OpenAI
2. Configure your `.env` file:

```
LLM_MODE=OPENAI
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o
```

## License

By contributing to Stoked, you agree that your contributions will be licensed under the project's MIT License. 