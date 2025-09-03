import * as fs from 'fs';
import { ConfigManager } from '../config';
import { FileWalkerService, FileInfo, WalkResult } from './file-walker.service';
import { ChunkingService } from './chunking/chunking-service';
import { EmbeddingService } from './embedding.service';
import { QdrantManager } from './qdrant';
import logger from '../utils/logger';

export interface IndexOptions {
  force?: boolean; 
  incremental?: boolean; 
  maxFiles?: number; 
  batchSize?: number; 
  skipEmbeddings?: boolean; 
  skipStorage?: boolean; 
  skipErrors?: boolean; 
  dryRun?: boolean; 
}

export interface IndexResult {
  success: boolean;
  filesProcessed: number;
  chunksGenerated: number;
  embeddingsGenerated: number;
  storedInQdrant: number;
  skippedFiles: number;
  errors: Array<{ file?: string; error: string }>;
  processingTime: number;
  repositoryStats: {
    totalFiles: number;
    totalSize: number;
    languageBreakdown: Record<string, number>;
  };
}

export interface IndexStatus {
  isIndexing: boolean;
  lastIndexTime?: Date;
  totalFiles: number;
  indexedFiles: number;
  lastError?: string;
  repositoryPath: string;
}

export class RepositoryIndexer {
  private configManager: ConfigManager;
  private fileWalker: FileWalkerService;
  private chunkingService: ChunkingService;
  private embeddingService: EmbeddingService;
  private qdrantManager: QdrantManager;
  private isInitialized: boolean = false;
  private currentIndexingOperation: {
    promise: Promise<IndexResult>;
    abortController: AbortController;
  } | null = null;

  constructor() {
    this.configManager = new ConfigManager();
    this.fileWalker = new FileWalkerService();
    this.chunkingService = new ChunkingService();
    this.embeddingService = new EmbeddingService();
    this.qdrantManager = new QdrantManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();
      await this.fileWalker.initialize();
      await this.chunkingService.initialize();
      await this.embeddingService.initialize();
      await this.qdrantManager.connect();

      this.isInitialized = true;
      logger.info('RepositoryIndexer: Initialized successfully');
    } catch (error) {
      logger.error('RepositoryIndexer: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async indexRepository(
    repositoryPath: string,
    options: IndexOptions = {}
  ): Promise<IndexResult> {
    await this.initialize();

    const startTime = Date.now();
    const abortController = new AbortController();
    this.currentIndexingOperation = {
      promise: this.performIndexing(repositoryPath, options, abortController.signal),
      abortController,
    };

    try {
      const result = await this.currentIndexingOperation.promise;
      this.currentIndexingOperation = null;

      const processingTime = Date.now() - startTime;
      logger.info('RepositoryIndexer: Indexing completed', {
        repositoryPath,
        success: result.success,
        filesProcessed: result.filesProcessed,
        chunksGenerated: result.chunksGenerated,
        processingTime,
      });

      return result;
    } catch (error) {
      this.currentIndexingOperation = null;
      throw error;
    }
  }

  private async performIndexing(
    repositoryPath: string,
    options: IndexOptions,
    abortSignal: AbortSignal
  ): Promise<IndexResult> {
    const config = this.configManager.get('indexing');

    if (!config?.enabled) {
      throw new Error('Indexing is disabled in configuration');
    }

    logger.info('RepositoryIndexer: Starting repository indexing', {
      repositoryPath,
      options,
      includePatterns: config.include_patterns?.length,
      excludePatterns: config.exclude_patterns?.length,
    });

    if (abortSignal.aborted) {
      throw new Error('Indexing operation was aborted');
    }

    logger.debug('RepositoryIndexer: Walking repository files');
    const walkResult = await this.walkRepositoryFiles(repositoryPath, config, options);

    if (walkResult.files.length === 0) {
      logger.warn('RepositoryIndexer: No files found to index', { repositoryPath });
      return this.createEmptyResult(repositoryPath, walkResult);
    }

    const processingResult = await this.processFilesInBatches(
      walkResult.files,
      config,
      options,
      abortSignal
    );

    const repositoryStats = await this.generateRepositoryStats(repositoryPath);

    const processingTime = 0; 
    const result: IndexResult = {
      success: processingResult.errors.length === 0,
      filesProcessed: processingResult.filesProcessed,
      chunksGenerated: processingResult.chunksGenerated,
      embeddingsGenerated: processingResult.embeddingsGenerated,
      storedInQdrant: processingResult.storedInQdrant,
      skippedFiles: walkResult.files.length - processingResult.filesProcessed,
      errors: processingResult.errors,
      processingTime,
      repositoryStats,
    };

    logger.info('RepositoryIndexer: Repository indexing completed', {
      repositoryPath,
      result,
    });

    return result;
  }

  private async walkRepositoryFiles(
    repositoryPath: string,
    config: any,
    options: IndexOptions
  ): Promise<WalkResult> {
    const walkOptions = {
      maxDepth: config.max_depth || 10,
      followSymlinks: config.follow_symlinks || false,
      includeHidden: false,
      maxFiles: options.maxFiles || config.max_files_per_index,
      includePatterns: config.include_patterns,
      excludePatterns: config.exclude_patterns,
    };

    const walkResult = await this.fileWalker.walkDirectory(repositoryPath, walkOptions);

    const maxFileSizeBytes = (config.max_file_size_mb || 10) * 1024 * 1024;
    const filteredFiles = walkResult.files.filter(file => {
      if (file.isBinary) {
        logger.debug('RepositoryIndexer: Skipping binary file', { file: file.path });
        return false;
      }
      if (file.size > maxFileSizeBytes) {
        logger.debug('RepositoryIndexer: Skipping large file', {
          file: file.path,
          size: file.size,
          maxSize: maxFileSizeBytes,
        });
        return false;
      }
      return true;
    });

    logger.debug('RepositoryIndexer: File walking completed', {
      totalFiles: walkResult.files.length,
      filteredFiles: filteredFiles.length,
      binaryFilesSkipped: walkResult.files.length - filteredFiles.length,
    });

    return {
      ...walkResult,
      files: filteredFiles,
      totalFiles: filteredFiles.length,
    };
  }

  private async processFilesInBatches(
    files: FileInfo[],
    config: any,
    options: IndexOptions,
    abortSignal: AbortSignal
  ): Promise<{
    filesProcessed: number;
    chunksGenerated: number;
    embeddingsGenerated: number;
    storedInQdrant: number;
    errors: Array<{ file?: string; error: string }>;
  }> {
    const batchSize = options.batchSize || config.batch_size || 10;
    let totalFilesProcessed = 0;
    let totalChunksGenerated = 0;
    let totalEmbeddingsGenerated = 0;
    let totalStoredInQdrant = 0;
    const errors: Array<{ file?: string; error: string }> = [];

    logger.debug('RepositoryIndexer: Processing files in batches', {
      totalFiles: files.length,
      batchSize,
    });

    for (let i = 0; i < files.length; i += batchSize) {
      
      if (abortSignal.aborted) {
        throw new Error('Indexing operation was aborted');
      }

      const batch = files.slice(i, i + batchSize);

      logger.info('RepositoryIndexer: Processing batch', {
        batchIndex: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(files.length / batchSize),
        batchSize: batch.length,
        progress: `${Math.round(((i + batch.length) / files.length) * 100)}%`,
      });

      try {
        const batchResult = await this.processBatch(batch, config, options, abortSignal);

        totalFilesProcessed += batchResult.filesProcessed;
        totalChunksGenerated += batchResult.chunksGenerated;
        totalEmbeddingsGenerated += batchResult.embeddingsGenerated;
        totalStoredInQdrant += batchResult.storedInQdrant;
        errors.push(...batchResult.errors);

      } catch (error) {
        const errorMessage = `Batch processing failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('RepositoryIndexer: Batch processing error', {
          batchStart: i,
          batchSize: batch.length,
          error: errorMessage,
        });

        if (!options.skipErrors) {
          throw error;
        }

        errors.push({ error: errorMessage });
      }
    }

    return {
      filesProcessed: totalFilesProcessed,
      chunksGenerated: totalChunksGenerated,
      embeddingsGenerated: totalEmbeddingsGenerated,
      storedInQdrant: totalStoredInQdrant,
      errors,
    };
  }

  private async processBatch(
    files: FileInfo[],
    _config: any,
    options: IndexOptions,
    _abortSignal: AbortSignal
  ): Promise<{
    filesProcessed: number;
    chunksGenerated: number;
    embeddingsGenerated: number;
    storedInQdrant: number;
    errors: Array<{ file?: string; error: string }>;
  }> {
    const fileContents: Array<{ path: string; content: string }> = [];
    const errors: Array<{ file?: string; error: string }> = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file.path, 'utf-8');
        fileContents.push({ path: file.path, content });
      } catch (error) {
        const errorMessage = `Failed to read file: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn('RepositoryIndexer: File read error', {
          file: file.path,
          error: errorMessage,
        });
        errors.push({ file: file.path, error: errorMessage });
      }
    }

    let chunksGenerated = 0;
    let embeddingsGenerated = 0;
    let storedInQdrant = 0;

    if (fileContents.length > 0) {
      
      const chunkingResult = await this.chunkingService.chunkFilesBatch({
        files: fileContents.map(({ path, content }) => ({
          path,
          content,
        })),
        globalOptions: {
          generateEmbeddings: !options.skipEmbeddings,
          storeInQdrant: !options.skipStorage && !options.dryRun,
        },
      });

      chunksGenerated = chunkingResult.totalChunks;
      embeddingsGenerated = chunkingResult.embeddingsGenerated || 0;
      storedInQdrant = chunkingResult.storedInQdrant || 0;

      chunkingResult.errors.forEach(error => {
        errors.push({ file: error.file || undefined, error: error.error || error.message } as { file?: string; error: string });
      });

      logger.debug('RepositoryIndexer: Batch processing completed', {
        filesInBatch: files.length,
        filesProcessed: fileContents.length,
        chunksGenerated,
        embeddingsGenerated,
        storedInQdrant,
        errors: errors.length,
      });
    }

    return {
      filesProcessed: fileContents.length,
      chunksGenerated,
      embeddingsGenerated,
      storedInQdrant,
      errors,
    };
  }

  private async generateRepositoryStats(repositoryPath: string): Promise<{
    totalFiles: number;
    totalSize: number;
    languageBreakdown: Record<string, number>;
  }> {
    try {
      const stats = await this.fileWalker.getRepositoryStats(repositoryPath);
      return {
        totalFiles: stats.totalFiles,
        totalSize: stats.totalSize,
        languageBreakdown: stats.languageBreakdown,
      };
    } catch (error) {
      logger.warn('RepositoryIndexer: Failed to generate repository stats', {
        repositoryPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalFiles: 0,
        totalSize: 0,
        languageBreakdown: {},
      };
    }
  }

  private async createEmptyResult(
    repositoryPath: string,
    _walkResult: WalkResult
  ): Promise<IndexResult> {
    const repositoryStats = await this.generateRepositoryStats(repositoryPath);

    return {
      success: true,
      filesProcessed: 0,
      chunksGenerated: 0,
      embeddingsGenerated: 0,
      storedInQdrant: 0,
      skippedFiles: 0,
      errors: [],
      processingTime: 0,
      repositoryStats,
    };
  }

  getIndexingStatus(): IndexStatus {
    return {
      isIndexing: this.currentIndexingOperation !== null,
      totalFiles: 0, 
      indexedFiles: 0, 
      repositoryPath: process.cwd(),
    };
  }

  abortIndexing(): boolean {
    if (this.currentIndexingOperation) {
      this.currentIndexingOperation.abortController.abort();
      this.currentIndexingOperation = null;
      logger.info('RepositoryIndexer: Indexing operation aborted');
      return true;
    }
    return false;
  }

  isIndexing(): boolean {
    return this.currentIndexingOperation !== null;
  }

  async shutdown(): Promise<void> {
    if (this.embeddingService) {
      await this.embeddingService.shutdown();
    }

    if (this.qdrantManager) {
      await this.qdrantManager.disconnect();
    }

    if (this.currentIndexingOperation) {
      this.abortIndexing();
    }

    this.isInitialized = false;
    logger.info('RepositoryIndexer: Shutdown completed');
  }
}
