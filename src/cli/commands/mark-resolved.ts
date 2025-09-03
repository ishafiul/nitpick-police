import { Command } from 'commander';
import chalk from 'chalk';
import { logInfo, logError } from '../../utils';
import fs from 'fs';
import path from 'path';

export function markResolvedCommand(program: Command): void {
  program
    .command('mark-resolved')
    .description('Mark review comments as resolved')
    .option('-i, --id <commentId>', 'Comment ID to mark as resolved')
    .option('-f, --file <path>', 'Mark all comments in a specific file as resolved')
    .option('-a, --all', 'Mark all pending comments as resolved')
    .option('--status <status>', 'Set comment status (resolved, pending, in-progress)', 'resolved')
    .option('--reason <reason>', 'Reason for status change')
    .action(async (options) => {
      try {
        const { id, file, all, status, reason } = options;
        
        if (!id && !file && !all) {
          console.error(chalk.red('❌ Error: Please specify --id, --file, or --all'));
          program.help();
          return;
        }

        logInfo(`🔄 Updating comment status to: ${status}`);
        console.log(chalk.blue(`🔄 Updating comment status to: ${status}`));

        const codeReviewDir = path.join(process.cwd(), '.code_review');
        if (!fs.existsSync(codeReviewDir)) {
          console.error(chalk.red('❌ Code review system not initialized. Run "code-review init" first.'));
          process.exit(1);
        }

        let comments: any[] = [];
        try {
          const stateFile = path.join(codeReviewDir, 'state', 'state.json');
          if (fs.existsSync(stateFile)) {
            const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            comments = stateData.comments || [];
          }
        } catch (error) {
          console.log(chalk.yellow('⚠️  Could not load existing comments'));
        }

        if (id) {
          const comment = comments.find((c: any) => c.id === id);
          if (comment) {
            comment.status = status;
            if (reason) comment.reason = reason;
            console.log(chalk.green(`✅ Updated comment ${id}`));
          } else {
            console.log(chalk.yellow(`⚠️  Comment ${id} not found`));
          }
        } else if (file) {
          const fileComments = comments.filter((c: any) => c.file === file);
          fileComments.forEach((c: any) => {
            c.status = status;
            if (reason) c.reason = reason;
          });
          console.log(chalk.green(`✅ Updated ${fileComments.length} comments in ${file}`));
        } else if (all) {
          const pendingComments = comments.filter((c: any) => c.status === 'pending');
          pendingComments.forEach((c: any) => {
            c.status = status;
            if (reason) c.reason = reason;
          });
          console.log(chalk.green(`✅ Updated ${pendingComments.length} pending comments`));
        }

        try {
          const stateFile = path.join(codeReviewDir, 'state', 'state.json');
          const stateData = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
          stateData.comments = comments;
          fs.writeFileSync(stateFile, JSON.stringify(stateData, null, 2));
        } catch (error) {
          console.log(chalk.yellow('⚠️  Could not save comment updates'));
        }

        if (id) { 
          console.log(chalk.yellow(`📝 Marking comment ${id} as ${status}`));
        } else if (file) {
          console.log(chalk.yellow(`📝 Marking all comments in ${file} as ${status}`));
        } else if (all) {
          console.log(chalk.yellow(`📝 Marking all pending comments as ${status}`));
        }

        if (reason) {
          console.log(chalk.gray(`💬 Reason: ${reason}`));
        }

        console.log(chalk.green('✅ Comment status updated successfully!'));

      } catch (error) {
        logError('❌ Failed to update comment status', error as Error);
        console.error(chalk.red('❌ Failed to update comment status:'), error);
        process.exit(1);
      }
    });
}
