import { Command } from 'commander';
import chalk from 'chalk';
import { logError } from '../../utils';
import fs from 'fs';
import path from 'path';
import { ReviewGenerator } from '../../services';

export function reviewCommand(program: Command): void {
  program
    .command('review')
    .description('Generate code review for changes')
    .option('-s, --since <commit>', 'Review changes since specific commit')
    .option('-a, --all', 'Review all changes (ignore previous reviews)')
    .option('-f, --file <path>', 'Review specific file only')
    .option('--deep', 'Use cloud LLM for deeper analysis')
    .option('--escalate', 'Force escalation to cloud LLM for complex issues')
    .option('--format <format>', 'Output format (text, json, table)', 'text')
    .option('--output <path>', 'Save review to file')
    .action(async (options) => {
      try {
        const { since, all, file, deep, escalate, format, output } = options;
        
        if (!since && !all && !file) {
          console.error(chalk.red('❌ Error: Please specify --since, --all, or --file'));
          program.help();
          return;
        }

        // Check if system is initialized
        const codeReviewDir = path.join(process.cwd(), '.code_review');
        if (!fs.existsSync(codeReviewDir)) {
          console.error(chalk.red('❌ Code review system not initialized. Run "code-review init" first.'));
          process.exit(1);
        }

        const reviewsDir = path.join(codeReviewDir, 'reviews');
        if (!fs.existsSync(reviewsDir)) {
          fs.mkdirSync(reviewsDir, { recursive: true });
        }

        // Generate actual review
        const reviewGenerator = new ReviewGenerator();
        const review = await reviewGenerator.generateReview({
          sinceCommit: since,
          allChanges: all,
          specificFile: file,
          deepAnalysis: deep,
          forceEscalate: escalate
        });

        // Save review with metadata
        const reviewId = Date.now().toString();
        const reviewFile = path.join(reviewsDir, `${reviewId}.json`);
        const reviewData = {
          metadata: {
            id: reviewId,
            title: `Review for ${since ? `changes since ${since}` : all ? 'all changes' : file}`,
            date: new Date().toISOString(),
            summary: review.summary
          },
          status: 'pending',
          ...review
        };

        fs.writeFileSync(reviewFile, JSON.stringify(reviewData, null, 2));

        // Output based on format
        if (format === 'json') {
          console.log(JSON.stringify(reviewData, null, 2));
        } else if (format === 'table') {
          console.log(chalk.blue('📊 Review Summary:'));
          console.table({
            'Files reviewed': review.filesCount,
            'Issues found': review.issuesCount,
            'Suggestions': review.suggestionsCount,
            'Complexity': review.complexity
          });
        } else {
          console.log(chalk.blue('📊 Review Summary:'));
          console.log(`Files reviewed: ${review.filesCount}`);
          console.log(`Issues found: ${review.issuesCount}`);
          console.log(`Suggestions: ${review.suggestionsCount}`);
          console.log(`Complexity: ${review.complexity}`);
        }

        if (output) {
          fs.writeFileSync(output, JSON.stringify(reviewData, null, 2));
          console.log(chalk.gray(`💾 Review saved to: ${output}`));
        }

        console.log(chalk.green('✅ Code review completed!'));
        console.log(chalk.yellow(`📝 Review ID: ${reviewId}`));
        
      } catch (error) {
        logError('❌ Failed to generate code review', error as Error);
        console.error(chalk.red('❌ Failed to generate code review:'), error);
        process.exit(1);
      }
    });
}
