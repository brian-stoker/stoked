# LLM Module

The LLM (Large Language Model) module provides a service for interacting with language models through the Ollama API.

## Features

- Query language models with custom prompts
- Execute commands with proper logging and error handling
- Safe file operations with validation
- Themed logging for better visibility

## Usage

### Querying the LLM

```typescript
import { LlmService } from './llm.service';

const llmService = new LlmService();

// Query the LLM
const response = await llmService.query('Your prompt here');
```

### Executing Commands

The service provides safe command execution with logging:

```typescript
// Synchronous execution
const output = llmService.exec('your-command');

// Asynchronous execution
const childProcess = llmService.execAsync('your-command');
```

### File Operations

Safe file writing with validation:

```typescript
llmService.editFile('filename.txt', 'content');
```

## Configuration

The module uses the following environment variables:

- `LLM_HOST`: The host URL for the Ollama API
- `LLM_MODEL`: The model to use (defaults to 'incept5/llama3.1-claude:latest')

## Security

The module includes security features:

- Command validation against an allowed list
- Safe file operations
- Error handling and logging
- Prevention of command injection

## Allowed Commands

The following commands are allowed by default:

- git
- echo
- node
- npm
- pnpm
- yarn
- ts-node
- tsx
- tsc
- jest
- debug
- source-map-support

## Logging

All operations are logged using the 'Deep Ocean' theme for consistent visibility.
