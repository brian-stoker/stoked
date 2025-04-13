#!/bin/bash

# Check if .env file exists and source it
if [ -f .env ]; then
  echo "Loading environment variables from .env file"
  set -a
  source .env
  set +a
else
  echo "No .env file found, using default environment variables"
  export DOCS_TEST_MODE=true
  export LLM_MODE=OPENAI
  export DOCS_MODE=BATCH
  export OPENAI_API_KEY=your_key
fi

# Override with test mode always
export DOCS_TEST_MODE=true

echo "Running with LLM_MODE=$LLM_MODE, DOCS_MODE=$DOCS_MODE"
node dist/main.js docs stoked-ui/sui --include @stoked-ui/common --test
