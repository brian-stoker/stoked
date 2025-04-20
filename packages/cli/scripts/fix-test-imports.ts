import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

async function main() {
  console.log('Fixing test imports to use Vitest instead of Jest...');
  
  // Find all test files
  const testFiles = await glob('src/**/*.spec.ts', { cwd: process.cwd() });
  console.log(`Found ${testFiles.length} test files`);
  
  for (const filePath of testFiles) {
    console.log(`Processing ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace Jest mocks with Vitest mocks
    content = content.replace(/jest\.mock\(/g, 'vi.mock(');
    
    // Replace Jest fn with Vitest fn
    content = content.replace(/jest\.fn\(\)/g, 'vi.fn()');
    
    // If there are missing describe/it/beforeEach imports, add them
    if (content.includes('describe(') && !content.includes('import { describe')) {
      const importMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]vitest['"];?/);
      if (importMatch) {
        // Add to existing vitest import
        const existingImports = importMatch[1];
        const newImports = existingImports.includes('describe') ? existingImports : 
          existingImports + ', describe, it, beforeEach, afterEach';
        content = content.replace(
          /import\s+{([^}]+)}\s+from\s+['"]vitest['"];?/, 
          `import { ${newImports} } from 'vitest';`
        );
      } else {
        // Add new vitest import
        content = `import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';\n${content}`;
      }
    }
    
    // Write back the modified content
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${filePath}`);
  }
  
  console.log('All test files processed successfully');
}

main().catch(error => {
  console.error('Error fixing test imports:', error);
  process.exit(1);
}); 