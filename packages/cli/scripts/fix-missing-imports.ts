import * as fs from 'fs';
import * as path from 'path';

const filesToFix = [
  'src/modules/repo/repo.plan.command.ts',
  'src/modules/docs/process-batch.command.ts',
  'src/modules/test/test.command.ts'
];

async function main() {
  console.log('Fixing specific files with missing imports...');
  
  for (const filePath of filesToFix) {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}, skipping...`);
      continue;
    }
    
    console.log(`Processing ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Fix imports for NestJS decorators - make sure they are properly formatted
    if (content.includes('@nestjs/common')) {
      content = content.replace(
        /import\s+{([^}]+)}\s+from\s+['"]@nestjs\/common['"];?/,
        (match, imports) => {
          const normalizedImports = imports
            .split(',')
            .map(i => i.trim())
            .filter(i => i)
            .join(', ');
          return `import { ${normalizedImports} } from '@nestjs/common';`;
        }
      );
    }
    
    // Fix imports for nest-commander
    if (content.includes('nest-commander')) {
      content = content.replace(
        /import\s+{([^}]+)}\s+from\s+['"]nest-commander['"];?/,
        (match, imports) => {
          const normalizedImports = imports
            .split(',')
            .map(i => i.trim())
            .filter(i => i)
            .join(', ');
          return `import { ${normalizedImports} } from 'nest-commander';`;
        }
      );
    }
    
    // Make sure the decorator calls have parameters
    content = content.replace(
      /@(Command|SubCommand|Option|Injectable)\s*\(\s*\)/g,
      (match, decorator) => `@${decorator}({})`
    );
    
    // Write back the modified content
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${filePath}`);
  }
  
  console.log('All specific files fixed successfully');
}

main().catch(error => {
  console.error('Error fixing specific files:', error);
  process.exit(1);
}); 