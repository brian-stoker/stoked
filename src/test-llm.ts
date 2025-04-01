import { LlmService } from './modules/llm/llm.service.js';

const llmService = new LlmService();

const testContent = `import * as React from 'react';
import { type ReactNode } from 'react';
import { type ReactElement } from 'react';`;

try {
  llmService.editFile('test.txt', testContent);
  console.log('File written successfully');
} catch (error) {
  console.error('Failed to write file:', error);
}
