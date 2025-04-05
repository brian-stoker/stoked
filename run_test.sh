#!/bin/bash
export JSDOCS_TEST_MODE=true
export LLM_MODE=OPENAI
export JSDOCS_MODE=BATCH
export OPENAI_API_KEY=your_key
node dist/main.js jsdocs stoked-ui/sui --include @stoked-ui/common --test
