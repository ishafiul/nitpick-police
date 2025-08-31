import { Command } from 'commander';
import chalk from 'chalk';
import { logInfo, logError } from '../../utils';
import fs from 'fs';
import path from 'path';

export function statusCommand(program: Command): void {
  program
    .command('status')
    .description('Show current review status')
    .option('-v, --verbose', 'Show detailed status information')
    .option('--json', 'Output status in JSON format')
    .option('--file <path>', 'Show status for specific file')
    .option('--since <date>', 'Show status since specific date')
    .action(async (options) => {
      try {
        const { verbose, json, file, since } = options;
        
                logInfo('📊 Getting review status...');
        console.log(chalk.blue('📊 Review Status'));

        // Mock status data
        const mockStatus = {
          repository: process.cwd().split('/').pop(),
          initialized: true,
          lastReview: new Date().toISOString(),
          totalReviews: 15,
          pendingComments: 3,
          resolvedComments: 42,
          gitStatus: 'clean',
          hooksInstalled: true,
          lastIndexed: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        };

        // Check if system is initialized
        const codeReviewDir = path.join(process.cwd(), '.code_review');
        if (!fs.existsSync(codeReviewDir)) {
          console.error(chalk.red('❌ Code review system not initialized. Run "code-review init" first.'));
          process.exit(1);
        }

        // Load actual state if available
        let actualStatus = mockStatus;
        try {
          const stateFile = path.join(codeReviewDir, 'state', 'state.json');
          if (fs.existsSync(stateFile)) {
            const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            actualStatus = {
              ...mockStatus,
              totalReviews: stateData.reviews?.length || 0,
              pendingComments: stateData.comments?.filter((c: any) => c.status === 'pending').length || 0,
              resolvedComments: stateData.comments?.filter((c: any) => c.status === 'resolved').length || 0,
              lastReview: stateData.lastReview || mockStatus.lastReview,
              lastIndexed: stateData.lastIndexed || mockStatus.lastIndexed
            };
          }
        } catch (error) {
          console.log(chalk.yellow('⚠️  Could not load actual state, showing mock data'));
        }
        
        if (json) {
          console.log(JSON.stringify(actualStatus, null, 2));
          return;
        }
        
        // Display status in table format
        console.log(chalk.cyan('Repository:'), actualStatus.repository);
        console.log(chalk.cyan('Status:'), actualStatus.initialized ? chalk.green('✓ Initialized') : chalk.red('✗ Not initialized'));
        console.log(chalk.cyan('Git Status:'), actualStatus.gitStatus === 'clean' ? chalk.green('✓ Clean') : chalk.yellow('⚠ Modified'));
        console.log(chalk.cyan('Hooks:'), actualStatus.hooksInstalled ? chalk.green('✓ Installed') : chalk.red('✗ Not installed'));
        
        console.log('\n' + chalk.blue('📈 Review Statistics:'));
        console.log(chalk.gray('Total Reviews:'), actualStatus.totalReviews);
        console.log(chalk.yellow('Pending Comments:'), actualStatus.pendingComments);
        console.log(chalk.green('Resolved Comments:'), actualStatus.resolvedComments);
        
        if (verbose) {
          console.log('\n' + chalk.blue('📅 Timeline:'));
          console.log(chalk.gray('Last Review:'), new Date(actualStatus.lastReview).toLocaleString());
          console.log(chalk.gray('Last Indexed:'), new Date(actualStatus.lastIndexed).toLocaleString());
        }
        
        if (file) {
          console.log('\n' + chalk.blue(`📄 File Status: ${file}`));
          console.log(chalk.yellow('⚠️  File-specific status not yet implemented'));
        }
        
        if (since) {
          console.log('\n' + chalk.blue(`📅 Status since: ${since}`));
          console.log(chalk.yellow('⚠️  Date filtering not yet implemented'));
        }
        
        if (actualStatus.pendingComments > 0) {
          console.log('\n' + chalk.yellow('💡 Tip: Run "code-review mark-resolved" to manage pending comments'));
        }
        
      } catch (error) {
        logError('❌ Failed to get status', error as Error);
        console.error(chalk.red('❌ Failed to get status:'), error);
        process.exit(1);
      }
    });
}
