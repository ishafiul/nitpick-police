import { Command } from 'commander';
import { DeltaIndexingService } from '../../services';
import { DeltaIndexingOptions } from '../../services/indexing/delta-indexing.service';
import { ConfigManager } from '../../config';
import logger from '../../utils/logger';
import * as path from 'path';

export const syncCommand = new Command('sync')
  .description('Synchronize repository index with latest changes using delta indexing')
  .argument('[repository-path]', 'Path to repository to sync', '.')
  .option('-c, --commit <commit>', 'Sync since specific commit hash', '')
  .option('--working-tree', 'Sync working tree changes only', false)
  .option('--staged-only', 'Sync only staged changes', false)
  .option('--max-files <number>', 'Maximum number of files to process', parseInt)
  .option('--max-concurrent <number>', 'Maximum concurrent files to process', parseInt)
  .option('--batch-size <number>', 'Batch size for processing', parseInt)
  .option('--force-recheck', 'Force re-comparison of all chunks', false)
  .option('--skip-embeddings', 'Skip embedding regeneration for modified chunks', false)
  .option('--dry-run', 'Show what would be done without making changes', false)
  .option('--verbose', 'Enable verbose logging', false)
  .action(async (repositoryPath: string, options) => {
    try {
      
      if (options.verbose) {
        logger.level = 'debug';
      }

      const resolvedPath = path.resolve(repositoryPath);

      logger.info('Starting repository sync', {
        repositoryPath: resolvedPath,
        options,
      });

      const configManager = new ConfigManager();
      await configManager.loadConfig();

      const deltaIndexer = new DeltaIndexingService(resolvedPath);
      await deltaIndexer.initialize();

      const syncOptions = buildSyncOptions(options, configManager);

      console.log(`🔄 Syncing repository: ${resolvedPath}`);
      if (options.commit) {
        console.log(`📋 Since commit: ${options.commit}`);
      } else if (options.workingTree) {
        console.log(`📝 Working tree changes only`);
      } else if (options.stagedOnly) {
        console.log(`📦 Staged changes only`);
      } else {
        console.log(`📊 Full sync (working tree + staged)`);
      }

      if (options.dryRun) {
        console.log(`👀 Dry run mode - no changes will be made`);
      }

      console.log(`⚙️  Options: ${JSON.stringify(syncOptions, null, 2)}\n`);

      const result = await performSync(deltaIndexer, resolvedPath, options, syncOptions);

      displaySyncResults(result, resolvedPath);

    } catch (error) {
      logger.error('Repository sync failed', {
        repositoryPath,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('❌ Repository sync failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function buildSyncOptions(options: any, configManager: ConfigManager): DeltaIndexingOptions {
  const deltaConfig = configManager.get('deltaIndexing');

  return {
    forceRecheck: options.forceRecheck || deltaConfig?.forceRecheck || false,
    skipEmbeddingRegeneration: options.skipEmbeddings || deltaConfig?.skipEmbeddingRegeneration || false,
    maxConcurrentFiles: options.maxConcurrent || deltaConfig?.maxConcurrentFiles || 5,
    batchSize: options.batchSize || deltaConfig?.batchSize || 10,
    dryRun: options.dryRun || false,
  };
}

async function performSync(
  deltaIndexer: DeltaIndexingService,
  _repositoryPath: string,
  cliOptions: any,
  syncOptions: DeltaIndexingOptions
): Promise<any> {
  console.log('🚀 Starting delta indexing...\n');

  const startTime = Date.now();

  try {
    let result;

    if (cliOptions.commit) {
      
      console.log(`🔍 Detecting changes since commit ${cliOptions.commit}...`);
      result = await deltaIndexer.indexChangesSinceCommit(cliOptions.commit, syncOptions);
    } else {
      
      if (cliOptions.stagedOnly) {
        console.log(`🔍 Detecting staged changes...`);
      } else if (cliOptions.workingTree) {
        console.log(`🔍 Detecting working tree changes...`);
      } else {
        console.log(`🔍 Detecting all changes (working tree + staged)...`);
      }

      result = await deltaIndexer.indexWorkingDirectoryChanges(syncOptions);
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ Repository sync completed in ${duration}ms`);

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`\n❌ Repository sync failed after ${duration}ms`);
    throw error;
  }
}

function displaySyncResults(result: any, repositoryPath: string): void {
  console.log('\n📊 Sync Results');
  console.log('='.repeat(50));

  const status = result.success ? '✅ Success' : '❌ Completed with errors';
  console.log(`Status: ${status}`);
  console.log(`Repository: ${repositoryPath}`);
  console.log(`Files processed: ${result.filesProcessed}`);
  console.log(`Files skipped: ${result.filesSkipped}`);
  console.log(`Chunks added: ${result.chunksAdded}`);
  console.log(`Chunks updated: ${result.chunksUpdated}`);
  console.log(`Chunks deleted: ${result.chunksDeleted}`);
  console.log(`Processing time: ${result.processingTime}ms`);

  if (result.summary) {
    console.log('\n📈 Change Summary:');
    console.log(`  Files added: ${result.summary.added}`);
    console.log(`  Files modified: ${result.summary.modified}`);
    console.log(`  Files deleted: ${result.summary.deleted}`);
    console.log(`  Files unchanged: ${result.summary.unchanged}`);
  }

  if (result.filesProcessed > 0) {
    const avgTimePerFile = result.processingTime / result.filesProcessed;
    const totalChunksChanged = result.chunksAdded + result.chunksUpdated + result.chunksDeleted;

    console.log('\n⚡ Performance Metrics:');
    console.log(`  Avg time per file: ${avgTimePerFile.toFixed(1)}ms`);
    console.log(`  Total chunks changed: ${totalChunksChanged}`);

    if (totalChunksChanged > 0) {
      const avgChunksPerFile = totalChunksChanged / result.filesProcessed;
      console.log(`  Avg chunks changed per file: ${avgChunksPerFile.toFixed(1)}`);
    }
  }

  if (result.errors && result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.slice(0, 10).forEach((error: any, index: number) => {
      console.log(`  ${index + 1}. ${error.file ? `${error.file}: ` : ''}${error.error}`);
    });

    if (result.errors.length > 10) {
      console.log(`  ... and ${result.errors.length - 10} more errors`);
    }
  }

  console.log('\n💡 Recommendations:');
  if (result.chunksAdded > result.chunksUpdated * 2) {
    console.log('  📈 Many new chunks added - consider full re-indexing for optimization');
  }
  if (result.errors.length > result.filesProcessed * 0.1) {
    console.log('  ⚠️  High error rate - check file permissions and repository state');
  }
  if (result.filesSkipped > result.filesProcessed) {
    console.log('  🚫 Many files skipped - review include/exclude patterns');
  }

  console.log('\n🎉 Sync operation completed!');
}
