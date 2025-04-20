import * as fs from 'fs';
import * as path from 'path';

/**
 * This script ensures that emitDecoratorMetadata is enabled in tsconfig.json
 * and creates tsconfig.build.json with proper decorator settings
 */
async function main() {
  console.log('Fixing decorator metadata settings...');

  // Path to tsconfig.json
  const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json');
  
  // Read current tsconfig.json
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  
  // Ensure decorator settings are enabled
  tsconfig.compilerOptions = {
    ...tsconfig.compilerOptions,
    experimentalDecorators: true,
    emitDecoratorMetadata: true
  };
  
  // Write updated tsconfig.json
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf8');
  console.log('Updated tsconfig.json with proper decorator settings');
  
  // Create a tsconfig.build.json specifically for production builds
  const tsconfigBuildPath = path.resolve(process.cwd(), 'tsconfig.build.json');
  
  const tsconfigBuild = {
    extends: './tsconfig.json',
    compilerOptions: {
      sourceMap: false,
      declaration: true,
      incremental: true,
      removeComments: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', 'test', '**/*spec.ts']
  };
  
  fs.writeFileSync(tsconfigBuildPath, JSON.stringify(tsconfigBuild, null, 2), 'utf8');
  console.log('Created tsconfig.build.json for production builds');
  
  console.log('Decorator metadata settings updated successfully');
}

main().catch(error => {
  console.error('Error fixing decorator metadata:', error);
  process.exit(1);
}); 