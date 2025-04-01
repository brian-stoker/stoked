#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixImportsInDirectory(dir) {
  // Get all TypeScript files in the directory
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Recursively process subdirectories
      fixImportsInDirectory(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      // Process TypeScript files
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Use regex to find and update relative imports
      // Match import statements with relative paths but without file extensions
      const importRegex = /import\s+(?:(?:\{[^}]*\})|(?:[^{}\s]+))\s+from\s+['"](\.[^'"]*)['"]/g;
      
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        
        // Skip imports that already have extensions
        if (path.extname(importPath) !== '') continue;
        
        // Replace import path with .js extension
        const newImportPath = `${importPath}.js`;
        const originalImport = match[0];
        const newImport = originalImport.replace(importPath, newImportPath);
        
        content = content.replace(originalImport, newImport);
      }
      
      // Write the updated content back to the file
      fs.writeFileSync(filePath, content);
      console.log(`Updated imports in ${filePath}`);
    }
  }
}

// Start from src directory
const srcDir = path.resolve(__dirname, '..');
fixImportsInDirectory(srcDir);

console.log('Done updating import statements.'); 