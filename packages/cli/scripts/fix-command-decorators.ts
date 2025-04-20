import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

async function main() {
  console.log('Fixing command decorator issues...');
  
  // Find all command files that might have decorator issues
  const commandFiles = await glob('src/modules/**/*.command.ts', { cwd: process.cwd() });
  console.log(`Found ${commandFiles.length} command files`);
  
  for (const filePath of commandFiles) {
    console.log(`Processing ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check for the nest-commander import and ensure it's formatted correctly
    if (content.includes('nest-commander')) {
      // Make sure decorators are imported correctly
      content = content.replace(
        /import\s+{([^}]+)}\s+from\s+['"]nest-commander['"];?/,
        (match, imports) => {
          // Normalize the import to ensure Command, CommandRunner, etc. are imported correctly
          const normalizedImports = imports
            .split(',')
            .map(i => i.trim())
            .filter(i => i)
            .join(', ');
          return `import { ${normalizedImports} } from 'nest-commander';`;
        }
      );
      
      // Fix any incorrect usage of decorators
      // This is a simple fix that assumes decorators are used with @Command(), @SubCommand(), etc.
      content = content.replace(
        /@(Command|SubCommand|Option)\s*\(\s*\)/g,
        (match, decorator) => `@${decorator}({})`
      );
    }
    
    // Write back the modified content
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${filePath}`);
  }
  
  console.log('All command files processed successfully');
}

main().catch(error => {
  console.error('Error fixing command decorators:', error);
  process.exit(1);
}); 