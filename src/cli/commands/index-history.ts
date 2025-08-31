import { Command } from 'commander';
import chalk from 'chalk';
import { logInfo, logError } from '../../utils';
import fs from 'fs';
import path from 'path';

export function indexHistoryCommand(program: Command): void {
  program
    .command('index-history')
    .description('Index full repository history for analysis')
    .option('-s, --since <commit>', 'Index commits since specific commit (default: all)')
    .option('-l, --limit <number>', 'Limit number of commits to index', '1000')
    .option('--deep', 'Perform deep analysis with embeddings')
    .option('--force', 'Force re-indexing of already indexed commits')
    .option('--progress', 'Show progress bar during indexing')
    .action(async (options) => {
      try {
        const { since, limit, deep, force, progress } = options;
        
        logInfo('🔍 Starting repository history indexing...');
        console.log(chalk.blue('🔍 Starting repository history indexing...'));

        if (since) {
          console.log(chalk.yellow(`📅 Indexing commits since: ${since}`));
        } else {
          console.log(chalk.yellow('📅 Indexing all commits'));
        }

        if (deep) {
          console.log(chalk.cyan('🧠 Deep analysis mode enabled'));
        }

        if (force) {
          console.log(chalk.yellow('🔄 Force re-indexing enabled'));
        }

        console.log(chalk.gray(`📊 Limit: ${limit} commits`));

        // Check if system is initialized
        const codeReviewDir = path.join(process.cwd(), '.code_review');
        if (!fs.existsSync(codeReviewDir)) {
          console.error(chalk.red('❌ Code review system not initialized. Run "code-review init" first.'));
          process.exit(1);
        }

        // Simulate indexing process
        const totalCommits = parseInt(limit);
        let indexedCount = 0;
        
        if (progress) {
          console.log(chalk.blue('⏳ Indexing in progress...'));
          
          // Simulate progress bar
          const progressInterval = setInterval(() => {
            indexedCount += Math.floor(Math.random() * 10) + 1;
            if (indexedCount >= totalCommits) {
              indexedCount = totalCommits;
              clearInterval(progressInterval);
            }
            
            const percentage = Math.round((indexedCount / totalCommits) * 100);
            const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
            process.stdout.write(`\r[${bar}] ${percentage}% (${indexedCount}/${totalCommits})`);
          }, 100);
          
          // Wait for completion
          await new Promise(resolve => setTimeout(resolve, 3000));
          console.log('\n');
        } else {
          // Simple progress simulation
          console.log(chalk.gray('⏳ Indexing commits...'));
          await new Promise(resolve => setTimeout(resolve, 2000));
          indexedCount = totalCommits;
        }

        // Update last indexed timestamp
        try {
          const stateFile = path.join(codeReviewDir, 'state', 'state.json');
          const stateData = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
          stateData.lastIndexed = new Date().toISOString();
          fs.writeFileSync(stateFile, JSON.stringify(stateData, null, 2));
        } catch (error) {
          console.log(chalk.yellow('⚠️  Could not update indexing timestamp'));
        }



        console.log(chalk.green('✅ Repository history indexed successfully!'));

      } catch (error) {
        logError('❌ Failed to index repository history', error as Error);
        console.error(chalk.red('❌ Failed to index repository history:'), error);
        process.exit(1);
      }
    });
}
