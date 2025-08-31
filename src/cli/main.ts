#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { reviewCommand } from './commands/review';
import { statusCommand } from './commands/status';
import { configCommand } from './commands/config';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { markResolvedCommand } from './commands/mark-resolved';
import { indexHistoryCommand } from './commands/index-history';
// Import version from package.json
const { version } = require('../../package.json');

// Create the main program
const program = new Command();

// Set up program metadata
program
  .name('code-review')
  .description('Intelligent code review CLI with AI-powered analysis')
  .version(version, '-v, --version')
  .usage('<command> [options]');

// Add global options
program
  .option('-q, --quiet', 'Suppress output (quiet mode)')
  .option('--verbose', 'Enable verbose output')
  .option('--json', 'Output in JSON format')
  .option('--no-color', 'Disable colored output');

// Add commands
initCommand(program);
reviewCommand(program);
statusCommand(program);
configCommand(program);
listCommand(program);
showCommand(program);
markResolvedCommand(program);
indexHistoryCommand(program);

// Parse command line arguments
program.parse();

// Commander will automatically show help if no command is provided

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});
