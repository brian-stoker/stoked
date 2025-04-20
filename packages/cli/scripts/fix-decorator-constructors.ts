import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const decoratorRegex = /@(Command|SubCommand)\s*\(\s*\{[^}]*\}\s*\)/;
const constructorRegex = /constructor\s*\(([^)]*)\)/;

/**
 * This script fixes common issues with NestJS decorators in command files
 * by ensuring constructor parameters have proper Inject decorators
 */
async function main() {
  console.log('Fixing command constructor parameters...');
  
  // Find all command files
  const commandFiles = await glob('src/modules/**/**.command.ts', {
    cwd: process.cwd(),
    ignore: ['node_modules/**', 'dist/**']
  });
  
  console.log(`Found ${commandFiles.length} command files to check`);
  
  let fixedCount = 0;
  
  for (const filePath of commandFiles) {
    const fullPath = path.resolve(process.cwd(), filePath);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Check if file has command decorators and needs fixing
    if (decoratorRegex.test(content)) {
      console.log(`Processing ${filePath}...`);
      
      // Replace constructor parameters with explicit Inject decorators
      let updated = content.replace(
        constructorRegex,
        (match, params) => {
          // Don't modify if no parameters or already has @Inject
          if (!params.trim() || match.includes('@Inject')) {
            return match;
          }
          
          // Add empty Inject decorator to each parameter
          const updatedParams = params.split(',')
            .map(param => {
              const trimmed = param.trim();
              if (trimmed.startsWith('@')) return trimmed; // Already has decorator
              
              // Extract the parameter type for the Inject token
              const typeParts = trimmed.split(':');
              if (typeParts.length < 2) return trimmed;
              
              const paramName = typeParts[0].trim().replace('private readonly ', '').replace('private ', '').replace('readonly ', '');
              const paramType = typeParts[1].trim().replace(/;$/, '');
              
              // Add @Inject() decorator with the parameter type as token
              return `@Inject(${paramType}) ${trimmed}`;
            })
            .join(',\n    ');
          
          return `constructor(\n    ${updatedParams}\n  )`;
        }
      );
      
      if (content !== updated) {
        // Add import for Inject if not already present
        if (!updated.includes('import { Inject }')) {
          updated = updated.replace(
            /import {([^}]*)}/,
            (match, imports) => {
              // If already importing from @nestjs/common, add Inject
              if (match.includes('@nestjs/common')) {
                const importList = imports.split(',').map(i => i.trim());
                if (!importList.includes('Inject')) {
                  importList.push('Inject');
                }
                return `import {${importList.join(', ')}}`;
              }
              
              // Otherwise add a new import line
              return `import { Inject } from '@nestjs/common';\n${match}`;
            }
          );
        }
        
        fs.writeFileSync(fullPath, updated, 'utf8');
        fixedCount++;
        console.log(`Fixed ${filePath}`);
      } else {
        console.log(`No changes needed for ${filePath}`);
      }
    }
  }
  
  console.log(`Done! Fixed ${fixedCount} out of ${commandFiles.length} command files.`);
}

main().catch(error => {
  console.error('Error fixing decorator constructors:', error);
  process.exit(1);
}); 