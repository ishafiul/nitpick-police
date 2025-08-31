#!/usr/bin/env node

// Main module exports
export * from './cli';
export * from './core';
export * from './models';
export * from './services';
export * from './utils';

// CLI execution when run directly
if (require.main === module) {
  require('./cli/main');
}
