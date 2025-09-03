import { GitChangeService, FileChangeInfo, ChangeDetectionResult } from '../git/git-change.service';
import { QdrantManager } from '../qdrant/QdrantManager';
import { ChunkingService } from '../chunking/chunking-service';
import { EmbeddingService } from '../embedding.service';
import { ConfigManager } from '../../config';
import { CodeChunk } from '../../types/chunking';
import logger from '../../utils/logger';
import * as fs from 'fs';

import * as crypto from 'crypto';

export interface DeltaIndexingOptions {
  forceRecheck?: boolean; 
  skipEmbeddingRegeneration?: boolean; 
  maxConcurrentFiles?: number; 
  batchSize?: number; 
  dryRun?: boolean; 
}

export interface DeltaIndexingResult {
  success: boolean;
  filesProcessed: number;
  chunksAdded: number;
  chunksUpdated: number;
  chunksDeleted: number;
  filesSkipped: number;
  processingTime: number;
  errors: Array<{ file?: string; error: string }>;
  summary: {
    added: number;
    modified: number;
    deleted: number;
    unchanged: number;
  };
}

export interface ChunkComparisonResult {
  filePath: string;
  existingChunks: Array<{ id: string; hash: string; content: string }>;
  newChunks: CodeChunk[];
  toAdd: CodeChunk[];
  toUpdate: Array<{ existingId: string; newChunk: CodeChunk }>;
  toDelete: string[];
  unchanged: number;
}

export class DeltaIndexingService {
  private gitChangeService: GitChangeService;
  private qdrantManager: QdrantManager;
  private chunkingService: ChunkingService;
  private embeddingService: EmbeddingService;
  private configManager: ConfigManager;
  private deltaInitialized: boolean = false;

  constructor(repositoryPath?: string) {
    this.gitChangeService = new GitChangeService(repositoryPath);
    this.qdrantManager = new QdrantManager();
    this.chunkingService = new ChunkingService();
    this.embeddingService = new EmbeddingService();
    this.configManager = new ConfigManager();
  }

  async initialize(): Promise<void> {
    if (this.deltaInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();
      await this.gitChangeService.initialize();
      await this.qdrantManager.connect();
      await this.chunkingService.initialize();
      await this.embeddingService.initialize();

      this.deltaInitialized = true;
      logger.info('DeltaIndexingService: Initialized successfully');
    } catch (error) {
      logger.error('DeltaIndexingService: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async indexChangesSinceCommit(
    commitHash: string,
    options: DeltaIndexingOptions = {}
  ): Promise<DeltaIndexingResult> {
    await this.initialize();

    logger.info('DeltaIndexingService: Starting delta indexing since commit', {
      commitHash,
      options,
    });

    const startTime = Date.now();

    try {
      
      const changeResult = await this.gitChangeService.detectChangesSinceCommit(commitHash);

      const result = await this.processChanges(changeResult, options);

      const processingTime = Date.now() - startTime;
      logger.info('DeltaIndexingService: Delta indexing completed', {
        commitHash,
        filesProcessed: result.filesProcessed,
        chunksAdded: result.chunksAdded,
        chunksUpdated: result.chunksUpdated,
        chunksDeleted: result.chunksDeleted,
        processingTime,
      });

      return {
        ...result,
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('DeltaIndexingService: Delta indexing failed', {
        commitHash,
        processingTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async indexWorkingDirectoryChanges(
    options: DeltaIndexingOptions = {}
  ): Promise<DeltaIndexingResult> {
    await this.initialize();

    logger.info('DeltaIndexingService: Starting working directory delta indexing', { options });

    const startTime = Date.now();

    try {
      
      const changeResult = await this.gitChangeService.detectWorkingDirectoryChanges();

      const result = await this.processChanges(changeResult, options);

      const processingTime = Date.now() - startTime;
      logger.info('DeltaIndexingService: Working directory delta indexing completed', {
        filesProcessed: result.filesProcessed,
        chunksAdded: result.chunksAdded,
        chunksUpdated: result.chunksUpdated,
        chunksDeleted: result.chunksDeleted,
        processingTime,
      });

      return {
        ...result,
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('DeltaIndexingService: Working directory delta indexing failed', {
        processingTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async processChanges(
    changeResult: ChangeDetectionResult,
    options: DeltaIndexingOptions
  ): Promise<Omit<DeltaIndexingResult, 'processingTime'>> {
    const {
      maxConcurrentFiles = 5,
      dryRun = false,
    } = options;

    let chunksAdded = 0;
    let chunksUpdated = 0;
    let chunksDeleted = 0;
    let filesSkipped = 0;
    const errors: Array<{ file?: string; error: string }> = [];

    logger.debug('DeltaIndexingService: Processing changes', {
      totalChanges: changeResult.changes.length,
      summary: changeResult.summary,
    });

    const changesByType = this.groupChangesByType(changeResult.changes);

    if (changesByType.deleted.length > 0) {
      logger.info('DeltaIndexingService: Processing deleted files', {
        count: changesByType.deleted.length,
      });

      for (const change of changesByType.deleted) {
        try {
          if (!dryRun) {
            const deletedCount = await this.qdrantManager.deleteChunksByFile(change.path);
            chunksDeleted += deletedCount;
          }

          logger.debug('DeltaIndexingService: Deleted chunks for file', {
            file: change.path,
            chunksDeleted: dryRun ? 0 : await this.qdrantManager.deleteChunksByFile(change.path),
          });
        } catch (error) {
          const errorMessage = `Failed to delete chunks for ${change.path}: ${error instanceof Error ? error.message : String(error)}`;
          logger.warn('DeltaIndexingService: Delete operation failed', {
            file: change.path,
            error: errorMessage,
          });
          errors.push({ file: change.path, error: errorMessage });
        }
      }
    }

    const filesToProcess = [...changesByType.added, ...changesByType.modified];

    if (filesToProcess.length > 0) {
      logger.info('DeltaIndexingService: Processing added/modified files', {
        count: filesToProcess.length,
        maxConcurrent: maxConcurrentFiles,
      });

      for (let i = 0; i < filesToProcess.length; i += maxConcurrentFiles) {
        const batch = filesToProcess.slice(i, i + maxConcurrentFiles);

        const batchPromises = batch.map(async (change) => {
          try {
            const result = await this.processFileChange(change, options);
            return result;
          } catch (error) {
            const errorMessage = `Failed to process ${change.path}: ${error instanceof Error ? error.message : String(error)}`;
            logger.warn('DeltaIndexingService: File processing failed', {
              file: change.path,
              error: errorMessage,
            });
            errors.push({ file: change.path, error: errorMessage });
            return {
              chunksAdded: 0,
              chunksUpdated: 0,
              chunksDeleted: 0,
              filesSkipped: 1,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
          chunksAdded += result.chunksAdded;
          chunksUpdated += result.chunksUpdated;
          chunksDeleted += result.chunksDeleted;
          filesSkipped += result.filesSkipped;
        }

        logger.debug('DeltaIndexingService: Processed batch', {
          batchIndex: Math.floor(i / maxConcurrentFiles) + 1,
          filesInBatch: batch.length,
          progress: `${Math.min(i + maxConcurrentFiles, filesToProcess.length)}/${filesToProcess.length}`,
        });
      }
    }

    const summary = {
      added: changesByType.added.length,
      modified: changesByType.modified.length,
      deleted: changesByType.deleted.length,
      unchanged: changeResult.changes.length - changesByType.added.length - changesByType.modified.length - changesByType.deleted.length,
    };

    return {
      success: errors.length === 0,
      filesProcessed: filesToProcess.length,
      chunksAdded,
      chunksUpdated,
      chunksDeleted,
      filesSkipped,
      errors,
      summary,
    };
  }

  private async processFileChange(
    change: FileChangeInfo,
    options: DeltaIndexingOptions
  ): Promise<{
    chunksAdded: number;
    chunksUpdated: number;
    chunksDeleted: number;
    filesSkipped: number;
  }> {
    const { dryRun = false } = options;

    if (!fs.existsSync(change.path)) {
      logger.warn('DeltaIndexingService: File does not exist', {
        file: change.path,
      });
      return { chunksAdded: 0, chunksUpdated: 0, chunksDeleted: 0, filesSkipped: 1 };
    }

    try {
      
      const content = fs.readFileSync(change.path, 'utf-8');

      const newChunks = await this.chunkingService.chunkFile(change.path, content);

      if (newChunks.length === 0) {
        logger.debug('DeltaIndexingService: No chunks generated for file', {
          file: change.path,
        });
        return { chunksAdded: 0, chunksUpdated: 0, chunksDeleted: 0, filesSkipped: 0 };
      }

      const comparison = await this.compareChunks(change.path, newChunks);

      let chunksAdded = 0;
      let chunksUpdated = 0;
      let chunksDeleted = 0;

      if (comparison.toDelete.length > 0 && !dryRun) {
        try {
          await this.qdrantManager.deletePoints(
            this.configManager.get('qdrant')?.collections?.code_chunks || 'code_chunks',
            comparison.toDelete
          );
          chunksDeleted += comparison.toDelete.length;
        } catch (error) {
          logger.warn('DeltaIndexingService: Failed to delete chunks', {
            file: change.path,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const updatesToProcess = [...comparison.toAdd, ...comparison.toUpdate.map(u => u.newChunk)];

      if (updatesToProcess.length > 0) {
        if (!dryRun) {
          
          const chunksWithEmbeddings = options.skipEmbeddingRegeneration
            ? updatesToProcess
            : await this.generateEmbeddingsForChunks(updatesToProcess);

          const qdrantPoints = chunksWithEmbeddings.map(chunk => ({
            id: chunk.id,
            vector: chunk.embedding?.vector || [],
            payload: {
              file: chunk.filePath,
              language: chunk.language,
              start_line: chunk.startLine,
              end_line: chunk.endLine,
              chunk_type: chunk.chunkType,
              content: chunk.content,
              hash: this.generateContentHash(chunk.content),
              processed_at: new Date().toISOString(),
            },
          }));

          await this.qdrantManager.batchUpsertPoints(
            this.configManager.get('qdrant')?.collections?.code_chunks || 'code_chunks',
            qdrantPoints
          );
        }

        chunksAdded += comparison.toAdd.length;
        chunksUpdated += comparison.toUpdate.length;
      }

      logger.debug('DeltaIndexingService: Processed file change', {
        file: change.path,
        status: change.status,
        newChunks: newChunks.length,
        toAdd: comparison.toAdd.length,
        toUpdate: comparison.toUpdate.length,
        toDelete: comparison.toDelete.length,
        chunksAdded,
        chunksUpdated,
        chunksDeleted,
      });

      return {
        chunksAdded,
        chunksUpdated,
        chunksDeleted,
        filesSkipped: 0,
      };

    } catch (error) {
      logger.error('DeltaIndexingService: Failed to process file change', {
        file: change.path,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async compareChunks(
    filePath: string,
    newChunks: CodeChunk[]
  ): Promise<ChunkComparisonResult> {
    try {
      
      const existingChunksResponse = await this.qdrantManager.getChunksByFile({
        filePath,
        withPayload: true,
      });

      const existingChunks = existingChunksResponse.map(chunk => ({
        id: chunk.id,
        hash: chunk.payload?.['hash'] || '',
        content: chunk.payload?.['content'] || '',
      }));

      const toAdd: CodeChunk[] = [];
      const toUpdate: Array<{ existingId: string; newChunk: CodeChunk }> = [];
      const toDelete: string[] = [];
      let unchanged = 0;

      const existingByHash = new Map<string, { id: string; index: number }>();
      existingChunks.forEach((chunk, index) => {
        existingByHash.set(chunk.hash, { id: chunk.id, index });
      });

      const matchedExisting = new Set<string>();

      for (const newChunk of newChunks) {
        const newHash = this.generateContentHash(newChunk.content);
        const existing = existingByHash.get(newHash);

        if (existing) {
          
          matchedExisting.add(existing.id);
          unchanged++;
        } else {
          
          const existingAtPosition = existingChunks.find(chunk =>
            chunk.content === newChunk.content
          );

          if (existingAtPosition) {
            
            toUpdate.push({
              existingId: existingAtPosition.id,
              newChunk,
            });
            matchedExisting.add(existingAtPosition.id);
          } else {
            
            toAdd.push(newChunk);
          }
        }
      }

      for (const existing of existingChunks) {
        if (!matchedExisting.has(existing.id)) {
          toDelete.push(existing.id);
        }
      }

      return {
        filePath,
        existingChunks,
        newChunks,
        toAdd,
        toUpdate,
        toDelete,
        unchanged,
      };

    } catch (error) {
      logger.error('DeltaIndexingService: Failed to compare chunks', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        filePath,
        existingChunks: [],
        newChunks,
        toAdd: newChunks,
        toUpdate: [],
        toDelete: [],
        unchanged: 0,
      };
    }
  }

  private async generateEmbeddingsForChunks(chunks: CodeChunk[]): Promise<CodeChunk[]> {
    try {
      
      const chunksForEmbedding = chunks.map(chunk => ({
        id: chunk.id,
        payload: {
          file: chunk.filePath,
          language: chunk.language,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          chunkType: chunk.chunkType,
          content: chunk.content,
        },
      }));

      const embeddingResult = await this.embeddingService.generateEmbeddingsForChunks(chunksForEmbedding);

      return chunks.map(chunk => {
        const embedding = embeddingResult.results.find(e => e.id === chunk.id);
        return {
          ...chunk,
          embedding,
        };
      });

    } catch (error) {
      logger.warn('DeltaIndexingService: Failed to generate embeddings', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return chunks;
    }
  }

  private groupChangesByType(changes: FileChangeInfo[]): {
    added: FileChangeInfo[];
    modified: FileChangeInfo[];
    deleted: FileChangeInfo[];
    renamed: FileChangeInfo[];
  } {
    const added: FileChangeInfo[] = [];
    const modified: FileChangeInfo[] = [];
    const deleted: FileChangeInfo[] = [];
    const renamed: FileChangeInfo[] = [];

    for (const change of changes) {
      switch (change.status) {
        case 'added':
          added.push(change);
          break;
        case 'modified':
          modified.push(change);
          break;
        case 'deleted':
          deleted.push(change);
          break;
        case 'renamed':
          renamed.push(change);
          break;
      }
    }

    return { added, modified, deleted, renamed };
  }

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  getRepositoryRoot(): string {
    return this.gitChangeService.getRepositoryRoot();
  }

  isInitialized(): boolean {
    return this.deltaInitialized;
  }
}
