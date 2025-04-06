import { LlmService } from './modules/llm/llm.service.js';
import { ConfigService } from './modules/config/config.service.js';

const configService = new ConfigService();
const llmService = new LlmService(configService);

const testContent = `import * as React from 'react';
import { type ReactNode } from 'react';
import { type ReactElement } from 'react';`;

try {
  llmService.editFile('test.txt', testContent);
  console.log('File written successfully');
} catch (error) {
  console.error('Failed to write file:', error);
}
