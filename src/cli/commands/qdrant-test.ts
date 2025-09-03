import { Command } from 'commander';
import chalk from 'chalk';
import { validateQdrantEnvironment, printValidationResults, testQdrantConnection } from '../../utils';
import { ConfigManager } from '../../config';

export function qdrantTestCommand(program: Command): void {
  program
    .command('qdrant-test')
    .description('Test Qdrant vector database connectivity and configuration')
    .option('--url <url>', 'Override Qdrant URL for testing')
    .option('--timeout <ms>', 'Connection timeout in milliseconds', '5000')
    .option('--detailed', 'Show detailed connection information')
    .action(async (options) => {
      const { url: overrideUrl, timeout, detailed } = options;

      try {
        console.log(chalk.blue('🔍 Testing Qdrant Vector Database Setup'));
        console.log(chalk.gray('=' .repeat(50)));

        if (overrideUrl) {
          console.log(chalk.yellow(`📍 Testing custom URL: ${overrideUrl}`));

          const connectionTest = await testQdrantConnection(overrideUrl, parseInt(timeout));
          if (connectionTest.success) {
            console.log(chalk.green('✅ Connection successful'));
            if (detailed) {
              console.log(chalk.gray(`   Response time: ${connectionTest.responseTime}ms`));
              if (connectionTest.version) {
                console.log(chalk.gray(`   Server version: ${connectionTest.version}`));
              }
            }
          } else {
            console.log(chalk.red('❌ Connection failed'));
            console.log(chalk.red(`   Error: ${connectionTest.error}`));
            console.log(chalk.gray(`   Response time: ${connectionTest.responseTime}ms`));
          }
          return;
        }

        console.log(chalk.blue('🔧 Validating Qdrant environment...'));
        const validationResult = await validateQdrantEnvironment();

        printValidationResults(validationResult);

        if (validationResult.isValid && detailed && validationResult.serverInfo) {
          console.log(chalk.blue('\n📊 Detailed Server Information:'));
          console.log(chalk.gray(`   Status: ${validationResult.serverInfo.status}`));
          console.log(chalk.gray(`   Collections: ${validationResult.serverInfo.collections}`));

          try {
            const configManager = new ConfigManager();
            await configManager.loadConfig();
            const config = configManager.get('qdrant');

            if (config?.url) {
              console.log(chalk.blue('\n📚 Collection Status:'));
              const collections = await testQdrantConnection(config.url, parseInt(timeout));
              if (collections.success) {
                console.log(chalk.green('   ✓ Collections endpoint accessible'));
              } else {
                console.log(chalk.yellow('   ⚠️  Collections endpoint not accessible'));
              }
            }
          } catch (error) {
            console.log(chalk.yellow('   ⚠️  Could not check collection details'));
          }
        }

        if (validationResult.isValid) {
          console.log(chalk.blue('\n🎉 Qdrant is ready for indexing operations!'));
          console.log(chalk.gray('You can now run:'));
          console.log(chalk.gray('  code-review index'));
          console.log(chalk.gray('  code-review prepare --file <path>'));
          console.log(chalk.gray('  code-review review --cloud --file <path>'));
        } else {
          console.log(chalk.blue('\n🔧 To fix the issues:'));
          console.log(chalk.gray('1. Start Qdrant: docker run -p 6333:6333 qdrant/qdrant'));
          console.log(chalk.gray('2. Update config: code-review config set-key qdrant.url http://localhost:6333'));
          console.log(chalk.gray('3. Run this test again: code-review qdrant-test'));
        }

      } catch (error) {
        console.error(chalk.red('❌ Qdrant test failed:'), error);
        console.log(chalk.blue('\n🔧 Troubleshooting:'));
        console.log(chalk.gray('1. Ensure Qdrant is running: docker ps | grep qdrant'));
        console.log(chalk.gray('2. Check Qdrant URL: curl http://localhost:6333/health'));
        console.log(chalk.gray('3. Verify config: code-review config show'));
        process.exit(1);
      }
    });
}

