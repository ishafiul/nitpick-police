import { Command } from 'commander';
import { RepositoryIndexer, DeltaIndexingService } from '../../services';
import { DeltaIndexingOptions } from '../../services/indexing/delta-indexing.service';
import { IndexOptions } from '../../types';
import { ConfigManager } from '../../config';
import logger from '../../utils/logger';
import * as path from 'path';

export const indexCommand = new Command('index')
  .description('Index repository files for code review and analysis')
  .argument('[repository-path]', 'Path to repository to index', '.')
  .option('-f, --force', 'Force re-indexing of all files', false)
  .option('--no-incremental', 'Disable incremental indexing', false)
  .option('--max-files <number>', 'Maximum number of files to process', parseInt)
  .option('--batch-size <number>', 'Batch size for processing', parseInt)
  .option('--skip-embeddings', 'Skip embedding generation', false)
  .option('--skip-storage', 'Skip Qdrant storage', false)
  .option('--dry-run', 'Don\'t actually store anything', false)
  .option('--verbose', 'Enable verbose logging', false)
  .action(async (repositoryPath: string, options) => {
    try {
      
      if (options.verbose) {
        logger.level = 'debug';
      }

      const resolvedPath = path.resolve(repositoryPath);

      logger.info('Starting repository indexing', {
        repositoryPath: resolvedPath,
        options,
      });

      const configManager = new ConfigManager();
      await configManager.loadConfig();

      const indexer = new RepositoryIndexer();
      await indexer.initialize();

      if (indexer.isIndexing()) {
        console.log('❌ Another indexing operation is already running. Use --force to abort and restart.');
        process.exit(1);
      }

      const indexOptions: IndexOptions = {
        force: options.force,
        incremental: options.incremental !== false,
        maxFiles: options.maxFiles,
        batchSize: options.batchSize,
        skipEmbeddings: options.skipEmbeddings,
        skipStorage: options.skipStorage,
        dryRun: options.dryRun,
      };

      console.log(`📁 Indexing repository: ${resolvedPath}`);
      console.log(`⚙️  Options: ${JSON.stringify(indexOptions, null, 2)}\n`);

      const result = await indexRepositoryWithProgress(indexer, resolvedPath, indexOptions);

      displayIndexResults(result, resolvedPath);

    } catch (error) {
      logger.error('Repository indexing failed', {
        repositoryPath,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('❌ Repository indexing failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

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

export const indexStatusCommand = new Command('status')
  .description('Show repository indexing status')
  .argument('[repository-path]', 'Path to repository', '.')
  .option('--verbose', 'Show detailed status information', false)
  .action(async (repositoryPath: string, options) => {
    try {
      const resolvedPath = path.resolve(repositoryPath);

      const configManager = new ConfigManager();
      await configManager.loadConfig();

      const indexer = new RepositoryIndexer();
      await indexer.initialize();

      const status = indexer.getIndexingStatus();

      console.log(`📁 Repository: ${resolvedPath}`);
      console.log('📊 Indexing Status');
      console.log('='.repeat(50));

      if (status.isIndexing) {
        console.log('🔄 Status: Currently indexing');
        console.log(`📂 Repository: ${status.repositoryPath}`);
      } else {
        console.log('⏸️  Status: Not indexing');
        if (status.lastIndexTime) {
          console.log(`🕒 Last indexed: ${status.lastIndexTime.toISOString()}`);
        }
        if (status.lastError) {
          console.log(`❌ Last error: ${status.lastError}`);
        }
      }

      console.log(`📄 Total files: ${status.totalFiles}`);
      console.log(`✅ Indexed files: ${status.indexedFiles}`);

      if (options.verbose) {
        
        console.log('\n🔧 Configuration:');
        const indexingConfig = configManager.get('indexing');
        if (indexingConfig) {
          console.log(`  Max files per index: ${indexingConfig.max_files_per_index}`);
          console.log(`  Batch size: ${indexingConfig.batch_size}`);
          console.log(`  Incremental enabled: ${indexingConfig.enable_incremental}`);
          console.log(`  Include patterns: ${indexingConfig.include_patterns?.length || 0}`);
          console.log(`  Exclude patterns: ${indexingConfig.exclude_patterns?.length || 0}`);
        }
      }

    } catch (error) {
      logger.error('Failed to get indexing status', {
        repositoryPath,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('❌ Failed to get indexing status:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function indexRepositoryWithProgress(
  indexer: RepositoryIndexer,
  repositoryPath: string,
  options: IndexOptions
): Promise<any> {
  console.log('🚀 Starting repository indexing...\n');

  const startTime = Date.now();

  try {
    const result = await indexer.indexRepository(repositoryPath, options);

    const duration = Date.now() - startTime;
    console.log(`\n✅ Repository indexing completed in ${duration}ms`);

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`\n❌ Repository indexing failed after ${duration}ms`);
    throw error;
  }
}

function displayIndexResults(result: any, repositoryPath: string): void {
  console.log('\n📊 Indexing Results');
  console.log('='.repeat(50));

  const status = result.success ? '✅ Success' : '❌ Completed with errors';
  console.log(`Status: ${status}`);
  console.log(`Repository: ${repositoryPath}`);
  console.log(`Files processed: ${result.filesProcessed}`);
  console.log(`Chunks generated: ${result.chunksGenerated}`);
  console.log(`Embeddings generated: ${result.embeddingsGenerated}`);
  console.log(`Stored in Qdrant: ${result.storedInQdrant}`);
  console.log(`Skipped files: ${result.skippedFiles}`);
  console.log(`Processing time: ${result.processingTime}ms`);

  if (result.repositoryStats) {
    console.log('\n📈 Repository Statistics:');
    console.log(`  Total files: ${result.repositoryStats.totalFiles}`);
    console.log(`  Total size: ${(result.repositoryStats.totalSize / 1024 / 1024).toFixed(2)} MB`);

    if (Object.keys(result.repositoryStats.languageBreakdown).length > 0) {
      console.log('  Language breakdown:');
      Object.entries(result.repositoryStats.languageBreakdown)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .forEach(([language, count]) => {
          console.log(`    ${language}: ${count} files`);
        });
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

  if (result.filesProcessed > 0) {
    const avgTimePerFile = result.processingTime / result.filesProcessed;
    const avgChunksPerFile = result.chunksGenerated / result.filesProcessed;
    const avgEmbeddingsPerFile = result.embeddingsGenerated / result.filesProcessed;

    console.log('\n⚡ Performance Metrics:');
    console.log(`  Avg time per file: ${avgTimePerFile.toFixed(1)}ms`);
    console.log(`  Avg chunks per file: ${avgChunksPerFile.toFixed(1)}`);
    console.log(`  Avg embeddings per file: ${avgEmbeddingsPerFile.toFixed(1)}`);
  }

  console.log('\n🎉 Indexing operation completed!');
}

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
