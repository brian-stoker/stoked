# Documentation Module

## Overview

The Documentation module provides comprehensive documentation generation capabilities for repositories. It is designed to:

- Analyze repositories to determine their type (frontend, backend, library)
- Detect documentation patterns and existing documentation
- Generate appropriate documentation based on repository type and user preferences
- Support focused generation of specific documentation types (API, component, README)

## Relationship with Other Modules

This module functions as a unified documentation generation system:

- **Documentation Analysis**: Provides repository structure analysis and documentation pattern detection
- **Documentation Strategy**: Determines what types of documentation would be most beneficial
- **Documentation Generation**: Generates documentation directly or delegates to specialized generators

## Usage

```bash
# Generate all appropriate documentation for a repository
stoked docs owner/repo

# Focus specifically on API documentation
stoked docs owner/repo --api

# Generate specific documentation types
stoked docs owner/repo --types api,component,readme

# Target specific packages in a monorepo
stoked docs owner/repo --include package1,package2

# Specify a documentation format
stoked docs owner/repo --format markdown
```

### Options

- `--api`: Focus specifically on generating API documentation
- `--include`: Specify packages to include (comma-separated)
- `--types`: Types of documentation to generate (api, component, readme)
- `--format`: Documentation format to use (markdown, jsdoc, etc.)
- `--llmProvider`: LLM provider to use for generation (openai, ollama)
- `--test`: Enable test mode (processes only a few files to verify functionality)

## Documentation Generation Strategy

The module determines what types of documentation to generate based on:

1. **Repository Type**: Different repository types get different documentation strategies
   - Frontend web: component documentation, API documentation
   - Frontend mobile: component documentation, API documentation
   - Backend API: API documentation, usage examples
   - Libraries: API documentation, usage examples, README

2. **User Preferences**: Users can override the default strategy with options
   - `--api`: Focus only on API documentation
   - `--types`: Specify exactly which documentation types to generate

3. **Existing Documentation**: The module analyzes existing documentation to avoid duplication

## Architecture

The Documentation module uses a layered approach:

1. **Repository Analysis**: Determines repository type and structure
2. **Documentation Pattern Detection**: Identifies existing documentation patterns
3. **Strategy Determination**: Decides what documentation to generate
4. **Documentation Generation**: Generates documentation based on the determined strategy

## Future Development

This module will continue to evolve to:

- Support more repository types
- Provide more sophisticated analysis
- Implement documentation quality analysis
- Add support for more documentation formats
- Enhance documentation generation capabilities

## Command Usage

```bash
stoked docs {owner}/{repo} [options]
```

## Architecture

The documentation module has been designed with a modular, extensible architecture that builds on the foundation established by the test module.

### Directory Structure

```
src/modules/common/
  ├── repo-manager.service.ts      // Clone, analyze repos
  ├── code-analyzer.service.ts     // Analyze code structure & types
  ├── doc-detection.service.ts     // Detect existing documentation
  ├── llm-prompt-builder.service.ts // Shared prompt building logic
  └── batch-processing/            // Common batch processing logic

src/modules/docs/
  ├── docs.command.ts             // Main command entry point
  ├── docs-analysis.command.ts    // Analyze existing documentation
  ├── docs-generation.command.ts  // Generate documentation
  ├── types/                      // Type definitions
  |   ├── docs-config.ts          // Documentation configuration types
  |   └── docs-format.ts          // Format detection types
  ├── formats/                    // Format-specific handlers
  |   ├── markdown.service.ts
  |   ├── jsdoc.service.ts
  |   └── etc...
  └── strategies/                 // Documentation strategies by type
      ├── api-docs.strategy.ts
      ├── component-docs.strategy.ts
      ├── readme.strategy.ts
      └── usage.strategy.ts       // Usage examples
```

## Implementation Plan

The documentation module will be implemented in phases to ensure a focused, iterative approach.

### Phase 1: Analysis & Pattern Detection

- Command structure & repo cloning
- Repository type detection
- Documentation pattern detection

### Phase 2: Documentation Generation

- API documentation generation
- Component documentation generation
- README generation
- Documentation quality analysis

### Phase 3: Advanced Features

- Documentation strategy optimization
- Documentation quality metrics
- Interactive documentation
- Documentation testing 