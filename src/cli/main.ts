#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { reviewsCommand } from './commands/reviews';
import { statusCommand } from './commands/status';
import { configCommand } from './commands/config';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { markResolvedCommand } from './commands/mark-resolved';
import { indexHistoryCommand } from './commands/index-history';
import { ReviewCommand } from './commands/enhanced-review';
import { registerComposeCommand } from './commands/compose';
import { registerSearchCommand } from './commands/search';

const { version } = require('../../package.json');

const program = new Command();

program
  .name('code-review')
  .description('Intelligent code review CLI with AI-powered analysis')
  .version(version, '-v, --version')
  .usage('<command> [options]');

program
  .option('-q, --quiet', 'Suppress output (quiet mode)')
  .option('--verbose', 'Enable verbose output')
  .option('--json', 'Output in JSON format')
  .option('--no-color', 'Disable colored output');

initCommand(program);
reviewsCommand(program);
statusCommand(program);
configCommand(program);
listCommand(program);
showCommand(program);
markResolvedCommand(program);
indexHistoryCommand(program);

registerComposeCommand(program);
registerSearchCommand(program);

const review = new ReviewCommand();
review.register(program);

program.parse();

process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});
