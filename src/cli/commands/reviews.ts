import { Command } from 'commander';
import chalk from 'chalk';
import { ReviewStorageService, ReviewSearchOptions } from '../../services/review-storage.service';
import { QdrantReviewStorageService } from '../../services/qdrant-review-storage.service';

export function reviewsCommand(program: Command): void {
  const reviewsCmd = program
    .command('reviews')
    .description('Manage stored review results');

  reviewsCmd
    .command('list')
    .description('List stored reviews')
    .option('-s, --source <source>', 'Filter by source (file, commit, repository)')
    .option('-m, --model <model>', 'Filter by model')
    .option('-t, --type <type>', 'Filter by review type (code, commit)')
    .option('--severity <severity>', 'Filter by severity (low, medium, high, critical)')
    .option('--tags <tags>', 'Filter by tags (comma-separated)')
    .option('--limit <limit>', 'Limit number of results', parseInt, 20)
    .option('--format <format>', 'Output format (table, json)', 'table')
    .action(async (options) => {
      try {
        const { source, model, type, severity, tags, limit, format } = options;

        const storage = new ReviewStorageService();
        await storage.initialize();

        const searchOptions: ReviewSearchOptions = {
          source: source as 'file' | 'commit' | 'repository',
          model,
          reviewType: type as 'code' | 'commit',
          severity: severity as 'low' | 'medium' | 'high' | 'critical',
          tags: tags ? tags.split(',').map((t: string) => t.trim()) : undefined,
          limit,
        };

        const reviews = await storage.searchReviews(searchOptions);

        if (format === 'json') {
          console.log(JSON.stringify(reviews.map(r => r.metadata), null, 2));
        } else {
          if (reviews.length === 0) {
            console.log(chalk.yellow('📭 No reviews found matching the criteria'));
            return;
          }

          console.log(chalk.blue(`📋 Found ${reviews.length} reviews:`));
          console.table(reviews.map(review => ({
            ID: review.metadata.id.substring(0, 12) + '...',
            Title: review.metadata.title.substring(0, 50) + (review.metadata.title.length > 50 ? '...' : ''),
            Type: review.metadata.reviewType,
            Source: review.metadata.source,
            Model: review.metadata.model,
            'Issues': review.metadata.issueCount || 'N/A',
            Severity: review.metadata.severity || 'N/A',
            Date: new Date(review.metadata.timestamp).toLocaleDateString(),
          })));
        }
      } catch (error) {
        console.error(chalk.red('❌ Failed to list reviews:'), error);
        process.exit(1);
      }
    });

  reviewsCmd
    .command('show <id>')
    .description('Show detailed information about a specific review')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .action(async (id, options) => {
      try {
        const { format } = options;

        const storage = new ReviewStorageService();
        await storage.initialize();

        const review = await storage.getReview(id);

        if (!review) {
          console.error(chalk.red(`❌ Review with ID ${id} not found`));
          process.exit(1);
        }

        if (format === 'json') {
          console.log(JSON.stringify(review, null, 2));
        } else {
          const metadata = review.metadata;
          console.log(chalk.blue('📋 Review Details:'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(`ID: ${chalk.cyan(metadata.id)}`);
          console.log(`Title: ${chalk.white(metadata.title)}`);
          if (metadata.description) {
            console.log(`Description: ${chalk.gray(metadata.description)}`);
          }
          console.log(`Type: ${chalk.yellow(metadata.reviewType)}`);
          console.log(`Source: ${chalk.green(metadata.source)}`);
          if (metadata.sourcePath) {
            console.log(`File: ${chalk.gray(metadata.sourcePath)}`);
          }
          if (metadata.sourceCommit) {
            console.log(`Commit: ${chalk.gray(metadata.sourceCommit.substring(0, 8))}`);
          }
          console.log(`Model: ${chalk.magenta(metadata.model)}`);
          console.log(`Processing Time: ${chalk.gray(metadata.processingTime + 'ms')}`);
          console.log(`Tokens: ${chalk.gray(`${metadata.tokenUsage.input}/${metadata.tokenUsage.output}`)}`);
          console.log(`Date: ${chalk.gray(new Date(metadata.timestamp).toLocaleString())}`);

          if (metadata.tags.length > 0) {
            console.log(`Tags: ${chalk.blue(metadata.tags.join(', '))}`);
          }

          if (metadata.severity) {
            console.log(`Severity: ${chalk.red(metadata.severity)}`);
          }
          if (metadata.issueCount) {
            console.log(`Issues Found: ${chalk.red(metadata.issueCount)}`);
          }

          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.blue('📝 Review Content:'));

          const reviewData = review.review.data;
          if ('issues' in reviewData && reviewData.issues) {
            console.log(`\n${chalk.yellow('Issues:')}`);
            reviewData.issues.forEach((issue: any, index: number) => {
              console.log(`  ${index + 1}. ${chalk.red(issue.title || issue.description)}`);
              if (issue.severity) {
                console.log(`     Severity: ${chalk.red(issue.severity)}`);
              }
            });
          }

          if ('recommendations' in reviewData && reviewData.recommendations) {
            console.log(`\n${chalk.green('Recommendations:')}`);
            reviewData.recommendations.forEach((rec: string, index: number) => {
              console.log(`  ${index + 1}. ${chalk.green(rec)}`);
            });
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ Failed to show review:'), error);
        process.exit(1);
      }
    });

  reviewsCmd
    .command('delete <id>')
    .description('Delete a stored review')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id, options) => {
      try {
        const { yes } = options;

        if (!yes) {
          console.log(chalk.yellow(`⚠️  Are you sure you want to delete review ${id}? (y/N)`));
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.once('data', async (key) => {
            process.stdin.setRawMode(false);
            process.stdin.pause();

            if (key.toString().toLowerCase() === 'y') {
              await performDelete(id);
            } else {
              console.log(chalk.gray('Cancelled'));
            }
          });
        } else {
          await performDelete(id);
        }

        async function performDelete(reviewId: string) {
          try {
            const storage = new ReviewStorageService();
            await storage.initialize();

            const success = await storage.deleteReview(reviewId);
            if (success) {
              console.log(chalk.green(`✅ Review ${reviewId} deleted successfully`));
            } else {
              console.error(chalk.red(`❌ Failed to delete review ${reviewId}`));
              process.exit(1);
            }
          } catch (error) {
            console.error(chalk.red('❌ Failed to delete review:'), error);
            process.exit(1);
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ Failed to delete review:'), error);
        process.exit(1);
      }
    });

  reviewsCmd
    .command('export <output>')
    .description('Export reviews to a file')
    .option('-s, --source <source>', 'Filter by source (file, commit, repository)')
    .option('-m, --model <model>', 'Filter by model')
    .option('-t, --type <type>', 'Filter by review type (code, commit)')
    .option('--severity <severity>', 'Filter by severity (low, medium, high, critical)')
    .option('--tags <tags>', 'Filter by tags (comma-separated)')
    .action(async (output, options) => {
      try {
        const { source, model, type, severity, tags } = options;

        const storage = new ReviewStorageService();
        await storage.initialize();

        const searchOptions: ReviewSearchOptions = {
          source: source as 'file' | 'commit' | 'repository',
          model,
          reviewType: type as 'code' | 'commit',
          severity: severity as 'low' | 'medium' | 'high' | 'critical',
          tags: tags ? tags.split(',').map((t: string) => t.trim()) : undefined,
        };

        const exportPath = await storage.exportReviews(output, searchOptions);
        console.log(chalk.green(`✅ Reviews exported to: ${exportPath}`));
      } catch (error) {
        console.error(chalk.red('❌ Failed to export reviews:'), error);
        process.exit(1);
      }
    });

  reviewsCmd
    .command('stats')
    .description('Show review storage statistics')
    .action(async () => {
      try {
        const storage = new ReviewStorageService();
        await storage.initialize();

        const stats = await storage.getStats();

        console.log(chalk.blue('📊 Review Storage Statistics:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`Total Reviews: ${chalk.cyan(stats.totalReviews)}`);
        console.log(`Total Size: ${chalk.cyan((stats.totalSize / 1024 / 1024).toFixed(2))} MB`);
        console.log(`Average Processing Time: ${chalk.cyan(stats.averageProcessingTime.toFixed(0))} ms`);
        console.log(`Average Token Usage: ${chalk.cyan(stats.averageTokenUsage.toFixed(0))}`);

        if (stats.dateRange.oldest) {
          console.log(`Date Range: ${chalk.gray(new Date(stats.dateRange.oldest).toLocaleDateString())} - ${chalk.gray(new Date(stats.dateRange.newest!).toLocaleDateString())}`);
        }

        console.log(chalk.gray('─'.repeat(50)));
        console.log(chalk.blue('By Type:'));
        Object.entries(stats.reviewsByType).forEach(([type, count]) => {
          console.log(`  ${chalk.yellow(type)}: ${chalk.cyan(count)}`);
        });

        console.log(chalk.blue('By Model:'));
        Object.entries(stats.reviewsByModel).forEach(([model, count]) => {
          console.log(`  ${chalk.magenta(model)}: ${chalk.cyan(count)}`);
        });

        console.log(chalk.blue('By Severity:'));
        Object.entries(stats.reviewsBySeverity).forEach(([severity, count]) => {
          console.log(`  ${chalk.red(severity)}: ${chalk.cyan(count)}`);
        });
      } catch (error) {
        console.error(chalk.red('❌ Failed to get statistics:'), error);
        process.exit(1);
      }
    });

  reviewsCmd
    .command('search <query>')
    .description('Search reviews using semantic similarity')
    .option('-v, --vector', 'Use vector search mode')
    .option('-s, --source <source>', 'Filter by source (file, commit, repository)')
    .option('-m, --model <model>', 'Filter by model')
    .option('-t, --type <type>', 'Filter by review type (code, commit)')
    .option('--limit <limit>', 'Limit number of results', parseInt, 10)
    .action(async (query, options) => {
      try {
        const { vector, source, model, type, limit } = options;

        const qdrantStorage = new QdrantReviewStorageService();
        await qdrantStorage.initialize();

        if (vector) {
          
          console.log(chalk.yellow('🚧 Vector search mode - embedding query...'));
          console.log(chalk.gray('Note: This would require an embedding service to convert the text query to a vector'));
          return;
        }

        const searchOptions = {
          query,
          source: source as 'file' | 'commit' | 'repository',
          model,
          reviewType: type as 'code' | 'commit',
          limit,
        };

        const results = await qdrantStorage.searchReviews(searchOptions);

        if (results.length === 0) {
          console.log(chalk.yellow('📭 No reviews found matching the search criteria'));
          return;
        }

        console.log(chalk.blue(`🔍 Found ${results.length} reviews:`));
        results.forEach((result, index) => {
          console.log(`\n${chalk.cyan(`${index + 1}. ${result.payload.title}`)}`);
          console.log(`   ID: ${chalk.gray(result.id)}`);
          console.log(`   Type: ${chalk.yellow(result.payload.reviewType)}`);
          console.log(`   Model: ${chalk.magenta(result.payload.model)}`);
          console.log(`   Date: ${chalk.gray(new Date(result.payload.timestamp).toLocaleDateString())}`);
          if (result.payload.summary) {
            console.log(`   Summary: ${chalk.gray(result.payload.summary.substring(0, 100))}...`);
          }
        });
      } catch (error) {
        console.error(chalk.red('❌ Failed to search reviews:'), error);
        process.exit(1);
      }
    });
}
