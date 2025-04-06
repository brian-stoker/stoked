import { execSync } from 'child_process';

try {
  // Run TypeScript compiler in noEmit mode on a specific file
  const output = execSync('npx tsc --noEmit src/modules/repo/repo.command.ts', { 
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  console.log('No TypeScript errors found!');
} catch (error) {
  console.error('TypeScript errors found:');
  console.error(error.stdout);
} 