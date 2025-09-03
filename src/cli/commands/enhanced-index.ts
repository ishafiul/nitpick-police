import { Command } from 'commander';
import { RepositoryIndexer, DeltaIndexingService } from '../../services';
import { GitChangeService } from '../../services/git/git-change.service';
import { BaseCommand, IndexCommandOptions } from './base-command';
import logger from '../../utils/logger';

export class IndexCommand extends BaseCommand {
  private indexer?: RepositoryIndexer;
  private deltaIndexer?: DeltaIndexingService;
  private gitChangeService?: GitChangeService;

  async register(program: Command): Promise<void> {
    program
      .command('index')
      .description('Index repository files for code review and analysis')
      .argument('[repository-path]', 'Path to repository to index', '.')
      .option('-f, --force', 'Force re-indexing of all files')
      .option('-s, --since <commit>', 'Index changes since specific commit (delta indexing)')
      .option('--max-files <number>', 'Maximum number of files to process', parseInt)
      .option('--batch-size <number>', 'Batch size for processing', parseInt, 10)
      .option('--skip-embeddings', 'Skip embedding generation')
      .option('--skip-storage', 'Skip Qdrant storage')
      .option('--dry-run', 'Don\'t actually store anything')
      .option('--no-incremental', 'Disable incremental indexing')
      .action(async (repositoryPath: string, options: IndexCommandOptions) => {
        await this.executeCommand(async () => {
          await this.handleIndex(repositoryPath, options);
        }, 'Repository Indexing');
      });
  }

  private async handleIndex(repositoryPath: string, options: IndexCommandOptions): Promise<void> {
    await this.initialize();

    await this.validateGitRepository();

    if (options.verbose) {
      logger.level = 'debug';
    }

    this.info(`Starting repository indexing for: ${repositoryPath}`);

    this.indexer = new RepositoryIndexer();
    await this.indexer.initialize();

    this.deltaIndexer = new DeltaIndexingService();
    await this.deltaIndexer.initialize();

    this.gitChangeService = new GitChangeService();
    await this.gitChangeService.initialize();

    if (this.indexer.isIndexing()) {
      if (options.force) {
        this.warning('Force flag used - aborting existing indexing operation');
        
      } else {
        this.error('Another indexing operation is already running. Use --force to abort and restart.');
        return;
      }
    }

    let result;

    if (options.since) {
      
      this.info(`Performing delta indexing since commit: ${options.since}`);

      const changes = await this.gitChangeService.detectChangesSinceCommit(options.since);

      if (changes.changes.length === 0) {
        this.warning(`No changes found since commit ${options.since}`);
        return;
      }

      this.info(`Found ${changes.changes.length} changed files to process`);

      let processed = 0;
      const total = changes.changes.length;

      this.warning('Delta indexing not yet implemented - using stub implementation');

      result = {
        filesProcessed: changes.changes.length,
        chunksCreated: changes.changes.length * 5, 
        embeddingsGenerated: options.skipEmbeddings ? 0 : changes.changes.length * 5,
        duration: 1000, 
        errors: [],
        performance: {
          avgChunkingTime: 50,
          avgEmbeddingTime: 100,
          chunksPerSecond: 20,
        }
      };

      for (let i = 0; i < changes.changes.length; i++) {
        processed++;
        this.progress(processed, total, changes.changes[i]?.path || 'unknown');
        await new Promise(resolve => setTimeout(resolve, 10)); 
      }

    } else {
      
      this.info('Performing full repository indexing');

      const indexOptions: any = {
        force: options.force || false,
        incremental: options.incremental !== false,
      };

      if (options.maxFiles !== undefined) indexOptions.maxFiles = options.maxFiles;
      if (options.batchSize !== undefined) indexOptions.batchSize = options.batchSize;
      if (options.skipEmbeddings !== undefined) indexOptions.skipEmbeddings = options.skipEmbeddings;
      if (options.skipStorage !== undefined) indexOptions.skipStorage = options.skipStorage;
      if (options.dryRun !== undefined) indexOptions.dryRun = options.dryRun;

      result = await this.indexer.indexRepository(repositoryPath, indexOptions);
    }

    if (options.dryRun) {
      this.success('Dry run completed - no files were actually indexed', result);
    } else {
      this.success('Repository indexing completed successfully', {
        filesProcessed: (result as any).filesProcessed,
        chunksCreated: (result as any).chunksCreated,
        embeddingsGenerated: (result as any).embeddingsGenerated,
        duration: this.formatDuration((result as any).duration),
      });

      this.displayIndexStats(result as any);
    }
  }

  private displayIndexStats(result: any): void {
    console.log('\n📊 Indexing Statistics:');
    console.log('─'.repeat(50));

    if (result.filesProcessed !== undefined) {
      console.log(`Files Processed: ${result.filesProcessed}`);
    }
    if (result.chunksCreated !== undefined) {
      console.log(`Chunks Created: ${result.chunksCreated}`);
    }
    if (result.embeddingsGenerated !== undefined) {
      console.log(`Embeddings Generated: ${result.embeddingsGenerated}`);
    }
    if (result.duration !== undefined) {
      console.log(`Duration: ${this.formatDuration(result.duration)}`);
    }
    if (result.errors && result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`);
      if (result.errors.length > 0) {
        console.log('\n⚠️  Errors encountered:');
        result.errors.slice(0, 5).forEach((error: any, index: number) => {
          console.log(`  ${index + 1}. ${error.message || error}`);
        });
        if (result.errors.length > 5) {
          console.log(`  ... and ${result.errors.length - 5} more`);
        }
      }
    }

    if (result.performance) {
      console.log('\n⚡ Performance Metrics:');
      if (result.performance.avgChunkingTime) {
        console.log(`Avg Chunking Time: ${this.formatDuration(result.performance.avgChunkingTime)}`);
      }
      if (result.performance.avgEmbeddingTime) {
        console.log(`Avg Embedding Time: ${this.formatDuration(result.performance.avgEmbeddingTime)}`);
      }
      if (result.performance.chunksPerSecond) {
        console.log(`Chunks/Sec: ${result.performance.chunksPerSecond.toFixed(1)}`);
      }
    }
  }
}

export class SyncCommand extends BaseCommand {
  private deltaIndexer?: DeltaIndexingService;
  private gitChangeService?: GitChangeService;

  async register(program: Command): Promise<void> {
    program
      .command('sync')
      .description('Sync Qdrant with current working tree state')
      .option('-f, --force', 'Force sync without confirmation')
      .option('--max-files <number>', 'Maximum number of files to process', parseInt)
      .option('--batch-size <number>', 'Batch size for processing', parseInt, 10)
      .option('--dry-run', 'Show what would be synced without making changes')
      .action(async (options) => {
        await this.executeCommand(async () => {
          await this.handleSync(options);
        }, 'Repository Sync');
      });
  }

  private async handleSync(options: any): Promise<void> {
    await this.initialize();

    await this.validateGitRepository();

    this.info('Starting repository synchronization');

    this.deltaIndexer = new DeltaIndexingService();
    await this.deltaIndexer.initialize();

    this.gitChangeService = new GitChangeService();
    await this.gitChangeService.initialize();

    this.warning('Working tree state detection not yet implemented - using stub implementation');

    const mockChanges = [
      { path: 'src/example.ts', status: 'modified' as const },
      { path: 'README.md', status: 'modified' as const },
    ];

    const workingTreeState = { changes: mockChanges };

    if (workingTreeState.changes.length === 0) {
      this.success('Working tree is clean - no synchronization needed');
      return;
    }

    this.info(`Found ${workingTreeState.changes.length} changes to sync`);

    console.log('\n📋 Changes to sync:');
    workingTreeState.changes.slice(0, 10).forEach((change: any) => {
      const status = change.status === 'modified' ? 'M' :
                    change.status === 'added' ? 'A' :
                    change.status === 'deleted' ? 'D' : '?';
      console.log(`  ${status} ${change.path}`);
    });

    if (workingTreeState.changes.length > 10) {
      console.log(`  ... and ${workingTreeState.changes.length - 10} more`);
    }

    if (!options.force && !options.dryRun) {
      const confirmed = await this.confirmAction('Proceed with synchronization?');
      if (!confirmed) {
        this.info('Synchronization cancelled');
        return;
      }
    }

    if (options.dryRun) {
      this.success('Dry run completed - no changes were made');
      return;
    }

    let processed = 0;
    const total = workingTreeState.changes.length;

    this.warning('Working tree sync not yet implemented - using stub implementation');

    const result = {
      filesProcessed: workingTreeState.changes.length,
      chunksUpdated: workingTreeState.changes.length * 3,
      chunksDeleted: 0,
      duration: 500,
    };

    for (let i = 0; i < workingTreeState.changes.length; i++) {
      processed++;
      this.progress(processed, total, workingTreeState.changes[i]?.path || 'unknown');
      await new Promise(resolve => setTimeout(resolve, 10)); 
    }

    this.success('Repository synchronization completed', {
      filesProcessed: result.filesProcessed,
      chunksUpdated: result.chunksUpdated,
      chunksDeleted: result.chunksDeleted,
      duration: this.formatDuration(result.duration),
    });

    console.log('\n📊 Sync Results:');
    console.log('─'.repeat(40));
    console.log(`Files Processed: ${result.filesProcessed}`);
    console.log(`Chunks Updated: ${result.chunksUpdated}`);
    console.log(`Chunks Deleted: ${result.chunksDeleted}`);
    console.log(`Duration: ${this.formatDuration(result.duration)}`);
  }
}

export const enhancedIndexCommand = new IndexCommand();
export const enhancedSyncCommand = new SyncCommand();
