import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import Table from 'cli-table3';
import { logError } from '../../utils';

export function listCommand(program: Command): void {
  program
    .command('list')
    .description('List all available reviews')
    .option('-s, --status <status>', 'Filter by status (pending, resolved, accepted, rejected)')
    .option('-f, --format <format>', 'Output format (text, json)', 'text')
    .action(async (options) => {
      try {
        const { status, format } = options;
        const reviewsDir = path.join(process.cwd(), '.code_review', 'reviews');
        
        if (!fs.existsSync(reviewsDir)) {
          console.error(chalk.red('❌ No reviews found. Run "code-review review" first.'));
          process.exit(1);
        }

        const reviewFiles = fs.readdirSync(reviewsDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            const content = JSON.parse(fs.readFileSync(path.join(reviewsDir, file), 'utf8'));
            return {
              id: file.replace('.json', ''),
              ...content.metadata,
              status: content.status || 'pending',
              filesCount: content.filesCount || 0,
              issuesCount: content.issuesCount || 0,
              suggestionsCount: content.suggestionsCount || 0,
              details: content.details || []
            };
          });

        // Sort by date (newest first)
        reviewFiles.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

        const reviewsToDisplay = status ? reviewFiles.filter(r => r.status === status) : reviewFiles;

        if (format === 'json') {
          console.log(JSON.stringify(reviewsToDisplay, null, 2));
        } else {
          if (reviewsToDisplay.length === 0) {
            console.log(chalk.yellow('📋 No reviews found.'));
            return;
          }

          // Create table
          const table = new Table({
            head: [
              chalk.cyan('ID'),
              chalk.cyan('Title'),
              chalk.cyan('Status'),
              chalk.cyan('Date'),
              chalk.cyan('Files'),
              chalk.cyan('Details')
            ],
            style: {
              head: [],
              border: []
            },
            colWidths: [6, 35, 10, 12, 6, 50]
          });

          // Add rows
          reviewsToDisplay.forEach(review => {
            const statusColor = review.status === 'pending' ? chalk.yellow :
                               review.status === 'done' ? chalk.green :
                               review.status === 'in-progress' ? chalk.blue :
                               chalk.gray;

            const dateStr = review.date ? new Date(review.date).toLocaleDateString() : 'Unknown';

            // Create details summary
            let detailsText = '';
            if (review.details && review.details.length > 0) {
              const firstDetail = review.details[0];
              const severity = (firstDetail.severity || '').toUpperCase();
              const severityColor = severity === 'CRITICAL' ? chalk.red :
                                  severity === 'HIGH' ? chalk.red :
                                  severity === 'MEDIUM' ? chalk.yellow :
                                  severity === 'LOW' ? chalk.blue :
                                  chalk.gray;

              const problem = firstDetail.comment || 'No details';
              const suggestion = firstDetail.suggestion || '';

              detailsText = `${severityColor(firstDetail.severity.toUpperCase())}: ${problem.substring(0, 25)}${problem.length > 25 ? '...' : ''}`;
              if (suggestion) {
                detailsText += `\n${chalk.green('💡')} ${suggestion.substring(0, 25)}${suggestion.length > 25 ? '...' : ''}`;
              }

              // Add count if there are more issues
              if (review.details.length > 1) {
                const criticalCount = review.details.filter((d: any) => (d.severity || '').toUpperCase() === 'CRITICAL').length;
                const highCount = review.details.filter((d: any) => (d.severity || '').toUpperCase() === 'HIGH').length;
                const mediumCount = review.details.filter((d: any) => (d.severity || '').toUpperCase() === 'MEDIUM').length;
                const lowCount = review.details.filter((d: any) => (d.severity || '').toUpperCase() === 'LOW').length;

                const counts = [];
                if (criticalCount > 0) counts.push(`${criticalCount}🔴`);
                if (highCount > 0) counts.push(`${highCount}🟠`);
                if (mediumCount > 0) counts.push(`${mediumCount}🟡`);
                if (lowCount > 0) counts.push(`${lowCount}🔵`);

                if (counts.length > 0) {
                  detailsText += `\n${counts.join(' ')}`;
                }
              }
            } else {
              detailsText = chalk.green('✅ No issues found');
            }

            table.push([
              chalk.gray(review.id.slice(-4)), // Short ID (last 4 chars)
              (review.title || 'Untitled review').substring(0, 32) + ((review.title || '').length > 32 ? '...' : ''),
              statusColor(review.status),
              chalk.white(dateStr),
              chalk.white(review.filesCount?.toString() || '0'),
              detailsText
            ]);
          });

          // Display table
          const headerText = status ? `📋 Reviews (${status})` : '📋 All Reviews';
          console.log(chalk.blue(headerText));
          console.log(table.toString());

          // Summary with severity breakdown
          const totalReviews = reviewsToDisplay.length;
          const allDetails = reviewsToDisplay.flatMap(r => r.details || []);
          const severityCounts = {
            critical: allDetails.filter((d: any) => (d.severity || '').toLowerCase() === 'critical').length,
            high: allDetails.filter((d: any) => (d.severity || '').toLowerCase() === 'high').length,
            medium: allDetails.filter((d: any) => (d.severity || '').toLowerCase() === 'medium').length,
            low: allDetails.filter((d: any) => (d.severity || '').toLowerCase() === 'low').length,
            info: allDetails.filter((d: any) => (d.severity || '').toLowerCase() === 'info').length
          };

          console.log('');
          console.log(chalk.gray(`Total: ${totalReviews} reviews • ${allDetails.length} findings`));

          // Show severity breakdown if there are findings
          if (allDetails.length > 0) {
            const severityParts = [];
            if (severityCounts.critical > 0) severityParts.push(`${severityCounts.critical}🔴`);
            if (severityCounts.high > 0) severityParts.push(`${severityCounts.high}🟠`);
            if (severityCounts.medium > 0) severityParts.push(`${severityCounts.medium}🟡`);
            if (severityCounts.low > 0) severityParts.push(`${severityCounts.low}🔵`);
            if (severityCounts.info > 0) severityParts.push(`${severityCounts.info}ℹ️`);

            if (severityParts.length > 0) {
              console.log(chalk.gray(`Severity: ${severityParts.join(' ')}`));
            }
          }
        }
      } catch (error) {
        logError('❌ Failed to list reviews', error as Error);
        console.error(chalk.red('❌ Failed to list reviews:'), error);
        process.exit(1);
      }
    });
}
