import { GitManager } from '../core/git-manager';
import { GitCommitInfo, GitOptions } from '../models/git';
import { CodeVectorStore } from './code-vector-store';
import { OllamaService } from './ollama-service';
import { CommitIndexType } from '../models/state';
import logger from '../utils/logger';

// Indexing options and configuration
export interface CommitIndexingOptions {
  batchSize?: number;
  maxCommits?: number;
  since?: string | Date;
  until?: string | Date;
  author?: string;
  includeBinary?: boolean;
  contextLines?: number;
  progressCallback?: (progress: IndexingProgress) => void;
  forceReindex?: boolean;
}

// Progress tracking interface
export interface IndexingProgress {
  totalCommits: number;
  processedCommits: number;
  currentCommit: string;
  status: 'indexing' | 'completed' | 'error';
  error?: string;
  startTime: Date;
  estimatedTimeRemaining?: number | undefined;
}

// Index statistics interface
export interface IndexStatistics {
  totalCommits: number;
  indexedCommits: number;
  skippedCommits: number;
  failedCommits: number;
  lastIndexedCommit?: string;
  lastIndexedDate?: Date;
  totalProcessingTime: number;
  averageProcessingTime: number;
}

// Commit processing result
export interface CommitProcessingResult {
  commit: GitCommitInfo;
  indexed: boolean;
  summary?: string;
  embedding?: number[];
  error?: string;
  processingTime: number;
}

export class CommitIndexer {
  private gitManager: GitManager;
  private codeVectorStore: CodeVectorStore;
  private ollamaService: OllamaService;
  private isInitialized = false;

  constructor(
    gitManager: GitManager,
    codeVectorStore: CodeVectorStore,
    ollamaService: OllamaService
  ) {
    this.gitManager = gitManager;
    this.codeVectorStore = codeVectorStore;
    this.ollamaService = ollamaService;
  }

  /**
   * Initialize the commit indexer
   */
  async initialize(): Promise<void> {
    try {
      await this.gitManager.initialize();
      this.isInitialized = true;
      logger.info('Commit indexer initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize commit indexer', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Index commits with the specified options
   */
  async indexCommits(options: CommitIndexingOptions = {}): Promise<IndexStatistics> {
    this.ensureInitialized();

    const {
      batchSize = 50,
      maxCommits = 1000,
      since,
      until,
      author,
      includeBinary = false,
      contextLines = 3,
      progressCallback,
      forceReindex = false
    } = options;

    const startTime = new Date();
    const statistics: IndexStatistics = {
      totalCommits: 0,
      indexedCommits: 0,
      skippedCommits: 0,
      failedCommits: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0
    };

    try {
      // Get commits using available methods
      let commits: GitCommitInfo[] = [];
      
      if (since && until) {
        // Use commit range if both dates are provided
        const gitOptions: GitOptions = {};
        if (maxCommits) gitOptions.maxCount = maxCommits;
        if (author) gitOptions.author = author;
        if (includeBinary !== undefined) gitOptions.includeBinary = includeBinary;
        if (contextLines) gitOptions.contextLines = contextLines;
        
        commits = await this.gitManager.getCommitsInRange(
          since.toString(),
          until.toString(),
          gitOptions
        );
      } else {
        // For now, use a simple approach - get commits from HEAD to a reasonable depth
        // In a real implementation, you might want to add a method to get recent commits
        commits = await this.getRecentCommits(maxCommits, {
          since,
          author,
          includeBinary,
          contextLines
        });
      }
      statistics.totalCommits = commits.length;

      if (commits.length === 0) {
        logger.info('No commits found for indexing');
        return statistics;
      }

      logger.info('Starting commit indexing', {
        totalCommits: commits.length,
        batchSize,
        since: since?.toString(),
        until: until?.toString()
      });

      // Process commits in batches
      for (let i = 0; i < commits.length; i += batchSize) {
        const batch = commits.slice(i, i + batchSize);
        const batchStartTime = new Date();

        // Process batch
        const batchResults = await this.processCommitBatch(batch, forceReindex);
        
        // Update statistics
        batchResults.forEach(result => {
          if (result.indexed) {
            statistics.indexedCommits++;
          } else if (result.error) {
            statistics.failedCommits++;
          } else {
            statistics.skippedCommits++;
          }
          statistics.totalProcessingTime += result.processingTime;
        });

        // Update progress
        const processedCommits = Math.min(i + batchSize, commits.length);
        if (progressCallback) {
          const progress: IndexingProgress = {
            totalCommits: commits.length,
            processedCommits,
            currentCommit: batch[batch.length - 1]?.hash || '',
            status: 'indexing',
            startTime,
            estimatedTimeRemaining: this.calculateEstimatedTime(
              processedCommits,
              commits.length,
              startTime
            )
          };
          progressCallback(progress);
        }

        // Log batch progress
        const batchTime = Date.now() - batchStartTime.getTime();
        logger.info('Processed commit batch', {
          batchNumber: Math.floor(i / batchSize) + 1,
          totalBatches: Math.ceil(commits.length / batchSize),
          batchSize: batch.length,
          batchTime,
          totalProcessed: processedCommits,
          totalRemaining: commits.length - processedCommits
        });
      }

      // Update final statistics
      if (statistics.indexedCommits > 0) {
        const lastCommit = commits[commits.length - 1];
        if (lastCommit) {
          statistics.lastIndexedCommit = lastCommit.hash;
        }
        statistics.lastIndexedDate = new Date();
        statistics.averageProcessingTime = statistics.totalProcessingTime / statistics.indexedCommits;
      }

      // Final progress update
      if (progressCallback) {
        const progress: IndexingProgress = {
          totalCommits: commits.length,
          processedCommits: commits.length,
          currentCommit: commits[commits.length - 1]?.hash || '',
          status: 'completed',
          startTime
        };
        progressCallback(progress);
      }

      logger.info('Commit indexing completed', statistics);
      return statistics;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Commit indexing failed', { error: errorMessage });
      
      if (progressCallback) {
        const progress: IndexingProgress = {
          totalCommits: statistics.totalCommits,
          processedCommits: statistics.indexedCommits,
          currentCommit: '',
          status: 'error',
          error: errorMessage,
          startTime
        };
        progressCallback(progress);
      }

      throw new Error(`Commit indexing failed: ${errorMessage}`);
    }
  }

  /**
   * Process a batch of commits
   */
  private async processCommitBatch(
    commits: GitCommitInfo[],
    forceReindex: boolean
  ): Promise<CommitProcessingResult[]> {
    const results: CommitProcessingResult[] = [];

    for (const commit of commits) {
      const startTime = Date.now();
      
      try {
        // Check if commit is already indexed (unless force reindex)
        if (!forceReindex && await this.isCommitIndexed(commit.hash)) {
          results.push({
            commit,
            indexed: false,
            processingTime: Date.now() - startTime
          });
          continue;
        }

        // Generate commit summary using LLM
        const summary = await this.generateCommitSummary(commit);
        
        // Generate embedding for the summary
        const embedding = await this.ollamaService.generateEmbedding({ 
          model: 'llama2', // Default model
          prompt: summary 
        });

        // Create commit index
        const commitIndex: CommitIndexType = {
          id: crypto.randomUUID(),
          sha: commit.hash,
          summary,
          embeddings: embedding.embedding,
          indexed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        };

        // Index in vector store
        await this.codeVectorStore.indexCommitSummary(commitIndex, embedding.embedding);

        results.push({
          commit,
          indexed: true,
          summary,
          embedding: embedding.embedding,
          processingTime: Date.now() - startTime
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to process commit', {
          commit: commit.hash,
          error: errorMessage
        });

        results.push({
          commit,
          indexed: false,
          error: errorMessage,
          processingTime: Date.now() - startTime
        });
      }
    }

    return results;
  }

  /**
   * Generate a commit summary using LLM
   */
  private async generateCommitSummary(commit: GitCommitInfo): Promise<string> {
    const prompt = this.buildCommitSummaryPrompt(commit);
    
    try {
      const summary = await this.ollamaService.generate({
        model: 'llama2', // Default model
        prompt
      });
      return summary.response.trim();
    } catch (error) {
      logger.warn('LLM summary generation failed, using fallback', {
        commit: commit.hash,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback to a simple summary
      return this.generateFallbackSummary(commit);
    }
  }

  /**
   * Build prompt for commit summary generation
   */
  private buildCommitSummaryPrompt(commit: GitCommitInfo): string {
    const filesChanged = commit.files.length > 0 
      ? `Files changed: ${commit.files.join(', ')}`
      : 'No files changed';

    const changes = commit.linesAdded > 0 || commit.linesDeleted > 0
      ? `Changes: +${commit.linesAdded} -${commit.linesDeleted} lines`
      : 'No line changes';

    return `Please provide a concise, technical summary of this Git commit in 1-2 sentences.

Commit Details:
- Message: ${commit.message}
- Author: ${commit.author} (${commit.authorEmail})
- Date: ${commit.date.toISOString()}
- ${filesChanged}
- ${changes}
- Is merge commit: ${commit.isMerge ? 'Yes' : 'No'}
- Parent commits: ${commit.parentHashes.join(', ') || 'None'}
- Tags: ${commit.tags.join(', ') || 'None'}

Focus on the technical changes and their impact. Be specific about what was modified and why it matters.`;
  }

  /**
   * Generate fallback summary when LLM fails
   */
  private generateFallbackSummary(commit: GitCommitInfo): string {
    const changes = [];
    
    if (commit.linesAdded > 0 || commit.linesDeleted > 0) {
      changes.push(`${commit.linesAdded > 0 ? '+' + commit.linesAdded : ''}${commit.linesDeleted > 0 ? '-' + commit.linesDeleted : ''} lines`);
    }
    
    if (commit.files.length > 0) {
      changes.push(`${commit.files.length} file(s) modified`);
    }
    
    if (commit.isMerge) {
      changes.push('merge commit');
    }
    
    return `${commit.message} - ${changes.join(', ')}`;
  }

  /**
   * Check if a commit is already indexed
   */
  private async isCommitIndexed(commitSha: string): Promise<boolean> {
    try {
      // Try to find the commit in the vector store
      const results = await this.codeVectorStore.search(
        'commit_summaries',
        [0, 0, 0], // Dummy vector for exact match
        1,
        1.0, // Exact match threshold
        false,
        false
      );
      
      return results.some(result => 
        result.payload['commit_sha'] === commitSha
      );
    } catch (error) {
      // If search fails, assume not indexed
      logger.debug('Failed to check if commit is indexed', {
        commit: commitSha,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateEstimatedTime(
    processed: number,
    total: number,
    startTime: Date
  ): number | undefined {
    if (processed === 0) return undefined;
    
    const elapsed = Date.now() - startTime.getTime();
    const rate = processed / elapsed;
    const remaining = total - processed;
    
    return remaining / rate;
  }

  /**
   * Get index statistics
   */
  async getIndexStatistics(): Promise<IndexStatistics> {
    this.ensureInitialized();

    try {
      // Get total commits in repository using simple-git
      const git = this.gitManager.getSimpleGit();
      const log = await git.log({ maxCount: 100000 }); // Large limit to get all
      const totalCommits = log.total;
      
      // Get indexed commits count from vector store
      const indexedCount = await this.getIndexedCommitCount();
      
      const statistics: IndexStatistics = {
        totalCommits,
        indexedCommits: indexedCount,
        skippedCommits: totalCommits - indexedCount,
        failedCommits: 0, // Would need to track this separately
        totalProcessingTime: 0, // Would need to track this separately
        averageProcessingTime: 0
      };

      return statistics;
    } catch (error) {
      logger.error('Failed to get index statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get recent commits from the repository
   */
  private async getRecentCommits(maxCount: number, options: {
    since?: string | Date | undefined;
    author?: string | undefined;
    includeBinary?: boolean;
    contextLines?: number;
  }): Promise<GitCommitInfo[]> {
    try {
      // Use simple-git to get recent commits
      const git = this.gitManager.getSimpleGit();
      const logOptions: any = { maxCount };
      
      // Apply filters if provided
      if (options.since) {
        logOptions.from = options.since;
      }
      if (options.author) {
        logOptions.author = options.author;
      }
      
      const log = await git.log(logOptions);
      
      const commits: GitCommitInfo[] = [];
      for (const commit of log.all) {
        // Get detailed commit info
        const commitInfo = await this.gitManager.getCommitInfo(commit.hash);
        commits.push(commitInfo);
      }
      
      return commits;
    } catch (error) {
      logger.warn('Failed to get recent commits, falling back to empty list', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Get count of indexed commits
   */
  private async getIndexedCommitCount(): Promise<number> {
    try {
      // This is a simplified approach - in a real implementation,
      // you might want to store this count separately for performance
      const results = await this.codeVectorStore.search(
        'commit_summaries',
        [0, 0, 0], // Dummy vector
        10000, // Large limit to get all
        0.0, // Very low threshold to get all
        false,
        false
      );
      
      return results.length;
    } catch (error) {
      logger.warn('Failed to get indexed commit count', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Clean up old or invalid index entries
   */
  async cleanupIndex(options: {
    olderThan?: Date;
    maxAge?: number; // in days
    dryRun?: boolean;
  } = {}): Promise<{
    entriesToRemove: number;
    entriesRemoved: number;
    errors: string[];
  }> {
    this.ensureInitialized();

    const { olderThan, maxAge = 365, dryRun = true } = options;
    const cutoffDate = olderThan || new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);
    
    const result = {
      entriesToRemove: 0,
      entriesRemoved: 0,
      errors: [] as string[]
    };

    try {
      logger.info('Starting index cleanup', {
        cutoffDate: cutoffDate.toISOString(),
        dryRun
      });

      // Get old entries
      const oldEntries = await this.getOldIndexEntries(cutoffDate);
      result.entriesToRemove = oldEntries.length;

      if (dryRun) {
        logger.info('Cleanup dry run completed', {
          entriesToRemove: result.entriesToRemove,
          cutoffDate: cutoffDate.toISOString()
        });
        return result;
      }

      // Remove old entries
      for (const entry of oldEntries) {
        try {
          await this.codeVectorStore.deleteDocuments(
            'commit_summaries',
            [entry.id]
          );
          result.entriesRemoved++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to remove ${entry.id}: ${errorMessage}`);
        }
      }

      logger.info('Index cleanup completed', result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Index cleanup failed', { error: errorMessage });
      throw new Error(`Index cleanup failed: ${errorMessage}`);
    }
  }

  /**
   * Get old index entries for cleanup
   */
  private async getOldIndexEntries(cutoffDate: Date): Promise<Array<{ id: string; date: Date }>> {
    try {
      const results = await this.codeVectorStore.search(
        'commit_summaries',
        [0, 0, 0], // Dummy vector
        10000, // Large limit
        0.0, // Very low threshold
        false,
        false
      );

      return results
        .map(result => ({
          id: result.id,
          date: new Date(result.payload['commit_date'])
        }))
        .filter(entry => entry.date < cutoffDate)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error) {
      logger.warn('Failed to get old index entries', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Ensure the indexer is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Commit indexer not initialized. Call initialize() first.');
    }
  }
}
