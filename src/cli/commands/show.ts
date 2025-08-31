import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { logError } from '../../utils';

export function showCommand(program: Command): void {
  program
    .command('show <reviewId>')
    .description('Show detailed information for a specific review')
    .action(async (reviewId: string) => {
      try {
        const reviewsDir = path.join(process.cwd(), '.code_review', 'reviews');

        if (!fs.existsSync(reviewsDir)) {
          console.error(chalk.red('❌ No reviews found. Run "code-review review" first.'));
          process.exit(1);
        }

        // Find the review file - handle both short IDs and full IDs
        const reviewFiles = fs.readdirSync(reviewsDir)
          .filter(file => file.endsWith('.json'));

        let targetFile: string | null = null;

        // First try exact match
        const exactMatch = reviewFiles.find(file => file === `${reviewId}.json`);
        if (exactMatch) {
          targetFile = exactMatch;
        } else {
          // Try partial match (short ID)
          const partialMatch = reviewFiles.find(file => file.endsWith(`${reviewId}.json`));
          if (partialMatch) {
            targetFile = partialMatch;
          }
        }

        if (!targetFile) {
          console.error(chalk.red(`❌ Review with ID "${reviewId}" not found.`));
          console.log(chalk.gray('💡 Use "code-review list" to see available reviews'));
          process.exit(1);
        }

        // Load review data
        const reviewPath = path.join(reviewsDir, targetFile);
        const content = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
        const review = {
          ...content.metadata,
          status: content.status || 'pending',
          filesCount: content.filesCount || 0,
          issuesCount: content.issuesCount || 0,
          suggestionsCount: content.suggestionsCount || 0,
          details: content.details || []
        };

        // Display review header
        console.log('');
        console.log(chalk.blue.bold('🔍 Code Review Details'));
        console.log(chalk.gray('═'.repeat(50)));

        console.log(chalk.cyan('📋 Review ID:'), chalk.white(review.id));
        console.log(chalk.cyan('📝 Title:'), chalk.white(review.title || 'Untitled review'));
        console.log(chalk.cyan('📅 Date:'), chalk.white(review.date ? new Date(review.date).toLocaleString() : 'Unknown'));
        console.log(chalk.cyan('📊 Status:'), getStatusColor(review.status));
        console.log(chalk.cyan('📁 Files:'), chalk.white(review.filesCount.toString()));
        console.log(chalk.cyan('🔍 Issues:'), chalk.white(review.issuesCount.toString()));
        console.log(chalk.cyan('💡 Suggestions:'), chalk.white(review.suggestionsCount.toString()));

        if (review.summary) {
          console.log('');
          console.log(chalk.cyan('📖 Summary:'));
          console.log(chalk.gray(review.summary));
        }

        // Group details by file
        const fileGroups = groupByFile(review.details);

        if (Object.keys(fileGroups).length === 0) {
          console.log('');
          console.log(chalk.green('✅ No issues found in this review.'));
          return;
        }

        console.log('');
        console.log(chalk.blue.bold('📁 File-by-File Analysis'));
        console.log(chalk.gray('═'.repeat(50)));

        // Display each file's issues
        Object.entries(fileGroups).forEach(([filePath, issues], fileIndex) => {
          console.log('');
          console.log(chalk.yellow.bold(`${fileIndex + 1}. 📄 ${filePath}`));
          console.log(chalk.gray('─'.repeat(40)));

          issues.forEach((issue: any, issueIndex: number) => {
            const severity = (issue.severity || '').toUpperCase();
            const severityColor = getSeverityColor(severity);

            console.log('');
            console.log(chalk.gray(`   ${issueIndex + 1}. ${severityColor(severity)} Issue (Line ${issue.line || 'N/A'})`));

            if (issue.category) {
              console.log(chalk.gray(`      📂 Category: ${issue.category}`));
            }

            if (issue.comment) {
              console.log(chalk.gray(`      💬 Problem:`));
              console.log(`         ${chalk.white(issue.comment)}`);
            }

            if (issue.suggestion) {
              console.log(chalk.gray(`      💡 Suggestion:`));
              console.log(`         ${chalk.green(issue.suggestion)}`);
            }

            console.log('');
          });
        });

        // Display severity summary
        const severityCounts = getSeverityCounts(review.details);
        if (Object.values(severityCounts).some(count => count > 0)) {
          console.log('');
          console.log(chalk.blue.bold('📊 Severity Summary'));
          console.log(chalk.gray('═'.repeat(30)));

          const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
          severityOrder.forEach(severity => {
            const count = severityCounts[severity] || 0;
            if (count > 0) {
              const color = getSeverityColor(severity);
              const emoji = getSeverityEmoji(severity);
              console.log(`${emoji} ${color(severity)}: ${count} issue${count !== 1 ? 's' : ''}`);
            }
          });
        }

      } catch (error) {
        logError('❌ Failed to show review details', error as Error);
        console.error(chalk.red('❌ Failed to show review details:'), error);
        process.exit(1);
      }
    });
}

// Helper functions
function getStatusColor(status: string): string {
  const statusColors: { [key: string]: (text: string) => string } = {
    'pending': chalk.yellow,
    'in-progress': chalk.blue,
    'done': chalk.green,
    'resolved': chalk.green,
    'accepted': chalk.green,
    'rejected': chalk.red,
    'cancelled': chalk.gray
  };
  return (statusColors[status.toLowerCase()] || chalk.gray)(status);
}

function getSeverityColor(severity: string): (text: string) => string {
  const severityColors: { [key: string]: (text: string) => string } = {
    'CRITICAL': chalk.red.bold,
    'HIGH': chalk.red,
    'MEDIUM': chalk.yellow,
    'LOW': chalk.blue,
    'INFO': chalk.gray
  };
  return severityColors[severity] || chalk.gray;
}

function getSeverityEmoji(severity: string): string {
  const severityEmojis: { [key: string]: string } = {
    'CRITICAL': '🔴',
    'HIGH': '🟠',
    'MEDIUM': '🟡',
    'LOW': '🔵',
    'INFO': 'ℹ️'
  };
  return severityEmojis[severity] || '❓';
}

function groupByFile(details: any[]): { [filePath: string]: any[] } {
  const groups: { [filePath: string]: any[] } = {};

  details.forEach(detail => {
    const filePath = detail.file || 'Unknown file';
    if (!groups[filePath]) {
      groups[filePath] = [];
    }
    groups[filePath].push(detail);
  });

  return groups;
}

function getSeverityCounts(details: any[]): { [severity: string]: number } {
  const counts: { [severity: string]: number } = {
    'CRITICAL': 0,
    'HIGH': 0,
    'MEDIUM': 0,
    'LOW': 0,
    'INFO': 0
  };

  details.forEach(detail => {
    const severity = (detail.severity || '').toUpperCase();
    if (counts.hasOwnProperty(severity)) {
      counts[severity] = (counts[severity] || 0) + 1;
    }
  });

  return counts;
}
