# Agent Module

The Agent module provides an intelligent agent service that can perform various tasks using LLM capabilities and repository management.

## Features

- Task execution and management
- LLM-powered decision making
- Repository interaction
- Command execution
- File operations

## Usage

### Basic Agent Operations

```typescript
import { AgentService } from './agent.service';

const agentService = new AgentService();

// Start the agent
await agentService.start();

// Stop the agent
await agentService.stop();
```

### Task Management

```typescript
// Add a task
await agentService.addTask({
  type: 'code-review',
  priority: 'high',
  description: 'Review pull request #123',
});

// Get task status
const status = await agentService.getTaskStatus('task-id');

// List all tasks
const tasks = await agentService.listTasks();
```

### Repository Integration

```typescript
// Process a repository
await agentService.processRepository('repository-path');

// Analyze code
const analysis = await agentService.analyzeCode('file-path');
```

## Task Types

The agent supports various task types:

- Code Review
- Bug Fixing
- Feature Implementation
- Documentation
- Testing
- Refactoring

## Configuration

The module uses the following environment variables:

- `AGENT_MAX_TASKS`: Maximum number of concurrent tasks
- `AGENT_TIMEOUT`: Task timeout in milliseconds
- `AGENT_RETRY_COUNT`: Number of retries for failed tasks

## Security

The module includes security features:

- Task validation
- Resource limits
- Safe command execution
- Access control

## Logging

All agent operations are logged using the 'Alien Bioluminescence' theme for consistent visibility.

## Best Practices

1. Monitor agent resource usage
2. Set appropriate timeouts
3. Handle task failures gracefully
4. Keep tasks atomic and focused
5. Regular status checks
6. Proper error handling
