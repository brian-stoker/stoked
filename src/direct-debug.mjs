#!/usr/bin/env node

/**
 * Direct debug script for debugging nest-commander CLI
 * This version focuses only on the ConfigModule to avoid dependency issues
 */

// Get CLI arguments
const args = process.argv.slice(2);
console.log('Direct debug helper running with args:', args);

// Import dependencies
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '../dist/config/config.module.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a wrapper module specifically for debugging
const DebugModule = {
  module: {
    imports: [ConfigModule],
    providers: []
  }
};

// Override bootstrap to avoid dependency issues
async function bootstrap() {
  try {
    // Create a simpler NestJS app with just the ConfigModule
    console.log('Creating simplified NestJS application...');
    const app = await NestFactory.create(DebugModule.module, {
      logger: ['log', 'error', 'warn', 'debug']
    });
    
    // Initialize the app
    await app.init();
    
    // Get the ConfigModule
    console.log('Accessing ConfigModule...');
    const config = app.get(ConfigModule);
    console.log('ConfigModule:', config);
    
    // Get the ConfigService
    try {
      const configService = app.get('ConfigService');
      console.log('ConfigService:', configService);
      
      // Try to access repo data
      if (typeof configService.getAllGitRepos === 'function') {
        const repos = configService.getAllGitRepos();
        console.log('Repositories:', repos);
      }
    } catch (e) {
      console.error('Error accessing ConfigService:', e.message);
    }
    
    // Close the app
    await app.close();
    
  } catch (e) {
    console.error('Error in bootstrap:', e);
    process.exit(1);
  }
}

// Run the bootstrap function
bootstrap(); 