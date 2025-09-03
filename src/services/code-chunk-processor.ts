import { CodeChunker } from './code-chunker';
import { EmbeddingService, EmbeddingResult } from './embedding.service';
import { QdrantManager } from './qdrant';
import { ConfigManager } from '../config';
import logger from '../utils/logger';
import crypto from 'crypto';

export interface ProcessedCodeChunk {
  id: string;
  filePath: string;
  content: string;
  language: string;
  startLine: number;
  endLine: number;
  chunkType: 'function' | 'class' | 'method' | 'block' | 'file' | 'module';
  complexityScore?: number | undefined;
  dependencies?: string[] | undefined;
  embedding?: EmbeddingResult | undefined;
  sha256: string;
  metadata?: Record<string, any> | undefined;
  processedAt: string;
}

export interface ChunkProcessingOptions {
  generateEmbeddings?: boolean;
  batchSize?: number;
  skipErrors?: boolean;
  storeInQdrant?: boolean;
  collectionName?: string;
}

export interface ChunkProcessingResult {
  chunks: ProcessedCodeChunk[];
  totalProcessed: number;
  embeddingsGenerated: number;
  storedInQdrant: number;
  errors: Array<{ file: string; error: string }>;
  duration: number;
}

export class CodeChunkProcessor {
  private chunker: CodeChunker;
  private embeddingService?: EmbeddingService;
  private qdrantManager?: QdrantManager;
  private configManager: ConfigManager;
  private isInitialized: boolean = false;

  constructor() {
    this.chunker = new CodeChunker();
    this.configManager = new ConfigManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();
      const config = this.configManager.get('embeddings');

      if (config?.enabled !== false) {
        this.embeddingService = new EmbeddingService();
        await this.embeddingService.initialize();
      }

      this.qdrantManager = new QdrantManager();
      await this.qdrantManager.connect();

      this.isInitialized = true;
      logger.info('CodeChunkProcessor: Initialized successfully');

    } catch (error) {
      logger.error('CodeChunkProcessor: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async processFiles(
    files: Array<{ path: string; content: string; commitSha?: string }>,
    options: ChunkProcessingOptions = {}
  ): Promise<ChunkProcessingResult> {
    await this.initialize();

    const startTime = Date.now();
    const {
      generateEmbeddings = true,
      batchSize = 10,
      skipErrors = false,
      storeInQdrant = true,
      collectionName = 'code_chunks',
    } = options;

    logger.info('CodeChunkProcessor: Starting file processing', {
      fileCount: files.length,
      generateEmbeddings,
      storeInQdrant,
      batchSize,
    });

    const allChunks: ProcessedCodeChunk[] = [];
    const errors: Array<{ file: string; error: string }> = [];
    let totalEmbeddingsGenerated = 0;
    let totalStoredInQdrant = 0;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      try {
        const batchResult = await this.processBatch(batch, {
          generateEmbeddings,
          storeInQdrant,
          collectionName,
          skipErrors,
        });

        allChunks.push(...batchResult.chunks);
        errors.push(...batchResult.errors);
        totalEmbeddingsGenerated += batchResult.embeddingsGenerated;
        totalStoredInQdrant += batchResult.storedInQdrant;

        logger.debug('CodeChunkProcessor: Processed batch', {
          batchIndex: Math.floor(i / batchSize),
          batchSize: batch.length,
          chunksGenerated: batchResult.chunks.length,
          embeddingsGenerated: batchResult.embeddingsGenerated,
          storedInQdrant: batchResult.storedInQdrant,
        });

      } catch (error) {
        const errorMessage = `Batch processing failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('CodeChunkProcessor: Batch processing error', {
          batchStart: i,
          batchSize: batch.length,
          error: errorMessage,
        });

        if (!skipErrors) {
          throw error;
        }

        for (const file of batch) {
          errors.push({ file: file.path, error: errorMessage });
        }
      }
    }

    const duration = Date.now() - startTime;

    logger.info('CodeChunkProcessor: File processing completed', {
      totalFiles: files.length,
      totalChunks: allChunks.length,
      embeddingsGenerated: totalEmbeddingsGenerated,
      storedInQdrant: totalStoredInQdrant,
      errors: errors.length,
      duration,
    });

    return {
      chunks: allChunks,
      totalProcessed: files.length,
      embeddingsGenerated: totalEmbeddingsGenerated,
      storedInQdrant: totalStoredInQdrant,
      errors,
      duration,
    };
  }

  private async processBatch(
    files: Array<{ path: string; content: string; commitSha?: string }>,
    options: {
      generateEmbeddings: boolean;
      storeInQdrant: boolean;
      collectionName: string;
      skipErrors: boolean;
    }
  ): Promise<{
    chunks: ProcessedCodeChunk[];
    embeddingsGenerated: number;
    storedInQdrant: number;
    errors: Array<{ file: string; error: string }>;
  }> {
    const chunks: ProcessedCodeChunk[] = [];
    const errors: Array<{ file: string; error: string }> = [];
    let embeddingsGenerated = 0;
    let storedInQdrant = 0;

    for (const file of files) {
      try {
        const fileChunks = await this.processSingleFile(file);

        if (fileChunks.length > 0) {
          
          let chunksWithEmbeddings = fileChunks;
          if (options.generateEmbeddings && this.embeddingService) {
            const embeddingResult = await this.generateEmbeddingsForChunks(fileChunks);
            chunksWithEmbeddings = this.mergeEmbeddingsWithChunks(fileChunks, embeddingResult);
            embeddingsGenerated += embeddingResult.results.length;
          }

          chunks.push(...chunksWithEmbeddings);

          if (options.storeInQdrant && this.qdrantManager) {
            const stored = await this.storeChunksInQdrant(chunksWithEmbeddings, options.collectionName);
            storedInQdrant += stored;
          }
        }

      } catch (error) {
        const errorMessage = `File processing failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn('CodeChunkProcessor: File processing failed', {
          file: file.path,
          error: errorMessage,
        });

        if (!options.skipErrors) {
          throw error;
        }

        errors.push({ file: file.path, error: errorMessage });
      }
    }

    return {
      chunks,
      embeddingsGenerated,
      storedInQdrant,
      errors,
    };
  }

  private async processSingleFile(
    file: { path: string; content: string; commitSha?: string }
  ): Promise<ProcessedCodeChunk[]> {
    try {
      const rawChunks = await this.chunker.chunkCode(file.content, file.path);

      const processedChunks: ProcessedCodeChunk[] = rawChunks.map(chunk => ({
        id: this.generateChunkId(file.path, chunk.startLine, chunk.endLine),
        filePath: file.path,
        content: chunk.content,
        language: chunk.language,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        chunkType: chunk.chunkType,
        complexityScore: chunk.complexityScore,
        dependencies: chunk.dependencies,
        sha256: this.generateSha256(chunk.content),
        metadata: {
          ...chunk.metadata,
          commitSha: file.commitSha,
          processedAt: new Date().toISOString(),
        },
        processedAt: new Date().toISOString(),
      }));

      logger.debug('CodeChunkProcessor: Processed file', {
        file: file.path,
        chunksGenerated: processedChunks.length,
        totalLines: file.content.split('\n').length,
      });

      return processedChunks;

    } catch (error) {
      logger.error('CodeChunkProcessor: Failed to process file', {
        file: file.path,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async generateEmbeddingsForChunks(chunks: ProcessedCodeChunk[]): Promise<{
    results: EmbeddingResult[];
    errors: Array<{ id: string; error: string }>;
  }> {
    if (!this.embeddingService) {
      return { results: [], errors: [] };
    }

    try {
      
      const embeddingChunks = chunks.map(chunk => ({
        id: chunk.id,
        payload: {
          file: chunk.filePath,
          language: chunk.language,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          dependencies: chunk.dependencies,
          chunkType: chunk.chunkType,
        },
      }));

      const result = await this.embeddingService.generateEmbeddingsForChunks(embeddingChunks, {
        useCache: true,
        skipErrors: true,
      });

      return {
        results: result.results,
        errors: result.errors,
      };

    } catch (error) {
      logger.error('CodeChunkProcessor: Embedding generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { results: [], errors: [{ id: 'batch', error: String(error) }] };
    }
  }

  private mergeEmbeddingsWithChunks(
    chunks: ProcessedCodeChunk[],
    embeddingResult: { results: EmbeddingResult[]; errors: Array<{ id: string; error: string }> }
  ): ProcessedCodeChunk[] {
    const embeddingMap = new Map<string, EmbeddingResult>();
    embeddingResult.results.forEach(result => {
      embeddingMap.set(result.id, result);
    });

    return chunks.map(chunk => ({
      ...chunk,
      embedding: embeddingMap.get(chunk.id),
    }));
  }

  private async storeChunksInQdrant(
    chunks: ProcessedCodeChunk[],
    collectionName: string
  ): Promise<number> {
    if (!this.qdrantManager) {
      return 0;
    }

    let stored = 0;

    try {
      
      const points = chunks
        .filter(chunk => chunk.embedding) 
        .map(chunk => ({
          id: chunk.id,
          vector: chunk.embedding!.vector,
          payload: {
            file_path: chunk.filePath,
            chunk_id: chunk.id,
            content: chunk.content,
            language: chunk.language,
            start_line: chunk.startLine,
            end_line: chunk.endLine,
            chunk_type: chunk.chunkType,
            complexity_score: chunk.complexityScore,
            dependencies: chunk.dependencies,
            sha256: chunk.sha256,
            commit_sha: chunk.metadata?.['commitSha'],
            processed_at: chunk.processedAt,
            embedding_model: chunk.embedding?.model,
            embedding_generated_at: chunk.embedding?.generatedAt,
          },
        }));

      if (points.length > 0) {
        await this.qdrantManager.upsertPoints(collectionName, points);
        stored = points.length;

        logger.debug('CodeChunkProcessor: Stored chunks in Qdrant', {
          collection: collectionName,
          pointsStored: stored,
        });
      }

    } catch (error) {
      logger.error('CodeChunkProcessor: Failed to store chunks in Qdrant', {
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return stored;
  }

  private generateChunkId(filePath: string, startLine: number, endLine: number): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return `${normalizedPath}:${startLine}-${endLine}`;
  }

  private generateSha256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async shutdown(): Promise<void> {
    if (this.embeddingService) {
      await this.embeddingService.shutdown();
    }

    if (this.qdrantManager) {
      await this.qdrantManager.disconnect();
    }

    this.isInitialized = false;
    logger.info('CodeChunkProcessor: Shutdown completed');
  }
}
