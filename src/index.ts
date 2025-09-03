#!/usr/bin/env node

export * from './cli';
export * from './core';
export * from './models';
export * from './services';
export * from './utils';

if (require.main === module) {
  require('./cli/main');
}
