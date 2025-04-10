# Documentation (docs) Module

## Overview

The Documentation (docs) module provides automated code documentation capabilities. It was previously known as "jsdocs" but has been renamed to be more generic and support multiple documentation formats. This module is designed to:

- Generate comprehensive documentation for your code using LLMs
- Support multiple languages (currently focused on JavaScript/TypeScript)
- Create JSDoc-compatible comments within your codebase
- Support batch processing for larger projects

## Usage

```bash
stoked docs owner/repo
```

### Options

- `-i, --include [packages]`: Document only specific packages (comma-separated)
- `-t, --test`: Enable test mode (processes only a few files to verify functionality)
- `-d, --debug`: Enable debug mode with verbose logging
- `--dry-run`: Create batch files without submitting them to OpenAI API (for batch mode)

## Features

- **Intelligent Documentation**: Uses LLMs to create high-quality documentation
- **Framework Detection**: Understands React components and creates appropriate JSDoc comments
- **Entry Point Detection**: Identifies package entry points and adds @packageDocumentation tags
- **PR Creation**: Can optionally create a PR with documentation changes
- **Batch Processing**: Supports processing large repositories in batches (OpenAI only)

## Configuration

The module can be configured through environment variables in the `.env` file:

```
# DOCS CONFIGURATION
DOCS_MODE=DEFAULT                    # Documentation processing mode (DEFAULT or BATCH)
BATCH_POLL_INTERVAL_SEC=5            # Batch polling interval in seconds (for BATCH mode)
```

## Future Development

This module will continue to evolve to:

- Support more programming languages
- Support different documentation formats (not just JSDoc)
- Improve documentation quality through specialized prompts
- Provide more language-specific documentation features 