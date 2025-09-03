import path from 'path';
import { OllamaService } from './ollama-service';
import { ConfigManager } from '../config';

import { EmbeddingCache } from './embedding-cache';
import logger from '../utils/logger';
import crypto from 'crypto';

export interface EmbeddingResult {
  id: string;
  vector: number[];
  sha256: string;
  model: string;
  generatedAt: string;
  error?: string;
}

export interface ChunkForEmbedding {
  id: string;
  payload: Record<string, any>;
}

export interface EmbeddingBatchResult {
  results: EmbeddingResult[];
  totalProcessed: number;
  errors: Array<{ id: string; error: string }>;
  duration: number;
}

export interface EmbeddingCacheEntry {
  sha256: string;
  vector: number[];
  model: string;
  generatedAt: string;
  accessCount: number;
  lastAccessed: string;
}

export class EmbeddingService {
  private ollamaService: OllamaService;
  private configManager: ConfigManager;
  private cache: EmbeddingCache;
  private isInitialized: boolean = false;

  constructor() {
    this.ollamaService = new OllamaService();
    this.configManager = new ConfigManager();
    this.cache = new EmbeddingCache({
      persistencePath: undefined, 
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();

      const projectRoot = process.cwd();
      const cachePath = path.join(projectRoot, '.code_review', 'cache', 'embeddings.json');

      this.cache = new EmbeddingCache({
        persistencePath: cachePath,
        maxSize: 10000,
        maxSizeBytes: 100 * 1024 * 1024, 
        ttlMs: 7 * 24 * 60 * 60 * 1000, 
      });

      await this.cache.initialize();

      this.isInitialized = true;
      logger.info('EmbeddingService: Initialized successfully', {
        cachePath,
      });
    } catch (error) {
      logger.error('EmbeddingService: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async generateEmbeddingsForChunks(
    chunks: ChunkForEmbedding[],
    options: {
      useCache?: boolean;
      batchSize?: number;
      skipErrors?: boolean;
    } = {}
  ): Promise<EmbeddingBatchResult> {
    await this.initialize();

    const startTime = Date.now();
    const { useCache = true, batchSize = 10, skipErrors = false } = options;

    logger.info('EmbeddingService: Starting embedding generation', {
      chunkCount: chunks.length,
      batchSize,
      useCache,
    });

    const results: EmbeddingResult[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    const uncachedChunks = useCache ? await this.filterCachedChunks(chunks) : chunks;

    logger.debug('EmbeddingService: Processing chunks', {
      totalChunks: chunks.length,
      cachedChunks: chunks.length - uncachedChunks.length,
      uncachedChunks: uncachedChunks.length,
    });

    if (uncachedChunks.length > 0) {
      
      for (let i = 0; i < uncachedChunks.length; i += batchSize) {
        const batch = uncachedChunks.slice(i, i + batchSize);

        try {
          const batchResult = await this.processBatch(batch, skipErrors);

          if (useCache) {
            for (const result of batchResult.results) {
              await this.updateCache(result.sha256, {
                vector: result.vector,
                model: result.model,
                generatedAt: result.generatedAt,
              });
            }
          }

          results.push(...batchResult.results);
          errors.push(...batchResult.errors);

          logger.debug('EmbeddingService: Processed batch', {
            batchIndex: Math.floor(i / batchSize),
            batchSize: batch.length,
            successful: batchResult.results.length,
            failed: batchResult.errors.length,
          });

        } catch (error) {
          const errorMessage = `Batch processing failed: ${error instanceof Error ? error.message : String(error)}`;
          logger.error('EmbeddingService: Batch processing error', {
            batchStart: i,
            batchSize: batch.length,
            error: errorMessage,
          });

          if (!skipErrors) {
            throw error;
          }

          for (const chunk of batch) {
            errors.push({ id: chunk.id, error: errorMessage });
          }
        }
      }
    }

    if (useCache) {
      const cachedResults = await this.getCachedEmbeddings(
        chunks.filter(chunk => !uncachedChunks.find(uc => uc.id === chunk.id))
      );
      results.push(...cachedResults);
    }

    const duration = Date.now() - startTime;

    logger.info('EmbeddingService: Embedding generation completed', {
      totalProcessed: chunks.length,
      successful: results.length,
      failed: errors.length,
      duration,
      avgTimePerChunk: chunks.length > 0 ? duration / chunks.length : 0,
    });

    return {
      results,
      totalProcessed: chunks.length,
      errors,
      duration,
    };
  }

  private async processBatch(
    chunks: ChunkForEmbedding[],
    skipErrors: boolean = false
  ): Promise<EmbeddingBatchResult> {
    const config = this.configManager.get('qdrant');
    const model = config?.embedding_model || 'nomic-embed-text:v1.5';

    const results: EmbeddingResult[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    const embeddingPromises = chunks.map(async (chunk) => {
      try {
        const sha256 = this.generateSha256(
          chunk.payload['file'] +
          chunk.payload['startLine'] +
          chunk.payload['endLine']
        );

        const request = {
          model,
          prompt: this.prepareChunkText(chunk),
        };

        const response = await this.ollamaService.generateEmbedding(request);

        const result: EmbeddingResult = {
          id: chunk.id,
          vector: response.embedding,
          sha256,
          model,
          generatedAt: new Date().toISOString(),
        };

        results.push(result);
        return result;

      } catch (error) {
        const errorMessage = `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn('EmbeddingService: Chunk embedding failed', {
          chunkId: chunk.id,
          error: errorMessage,
        });

        if (!skipErrors) {
          throw error;
        }

        errors.push({ id: chunk.id, error: errorMessage });
        return null;
      }
    });

    await Promise.all(embeddingPromises);

    return {
      results,
      totalProcessed: chunks.length,
      errors,
      duration: 0, 
    };
  }

  private async filterCachedChunks(chunks: ChunkForEmbedding[]): Promise<ChunkForEmbedding[]> {
    const uncached: ChunkForEmbedding[] = [];

    for (const chunk of chunks) {
      const sha256 = this.generateSha256(
        (chunk.payload['file'] || '') +
        (chunk.payload['startLine'] || '') +
        (chunk.payload['endLine'] || '')
      );

      if (!(await this.cache.has(sha256))) {
        uncached.push(chunk);
      }
    }

    return uncached;
  }

  private async getCachedEmbeddings(chunks: ChunkForEmbedding[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (const chunk of chunks) {
      const sha256 = this.generateSha256(
        (chunk.payload['file'] || '') +
        (chunk.payload['startLine'] || '') +
        (chunk.payload['endLine'] || '')
      );
      const cached = await this.cache.get(sha256);

      if (cached) {
        results.push({
          id: chunk.id,
          vector: cached.vector,
          sha256: cached.sha256,
          model: cached.model,
          generatedAt: cached.generatedAt,
        });
      }
    }

    return results;
  }

  private async updateCache(sha256: string, entry: Omit<EmbeddingCacheEntry, 'sha256' | 'accessCount' | 'lastAccessed'>): Promise<void> {
    await this.cache.set(sha256, entry);
  }

  private prepareChunkText(chunk: ChunkForEmbedding): string {

    const { payload } = chunk;

    let text = `File: ${payload['file'] || 'unknown'}\n`;
    text += `Language: ${payload['language'] || 'unknown'}\n`;
    text += `Lines: ${payload['startLine'] || 0}-${payload['endLine'] || 0}\n`;

    if (payload['dependencies'] && payload['dependencies'].length > 0) {
      text += `Dependencies: ${payload['dependencies'].join(', ')}\n`;
    }

    if (payload['imports'] && payload['imports'].length > 0) {
      text += `Imports: ${payload['imports'].join(', ')}\n`;
    }

    if (payload['chunkType']) {
      text += `Type: ${payload['chunkType']}\n`;
    }

    return text;
  }

  private generateSha256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
    logger.info('EmbeddingService: Cache cleared');
  }

  async shutdown(): Promise<void> {
    if (this.cache) {
      await this.cache.shutdown();
    }
    this.isInitialized = false;
    logger.info('EmbeddingService: Shutdown completed');
  }

  async getModelInfo(): Promise<{
    model: string;
    dimension: number;
    available: boolean;
  } | null> {
    try {
      const config = this.configManager.get('qdrant');
      const model = config?.embedding_model || 'nomic-embed-text:v1.5';

      return {
        model,
        dimension: 768, 
        available: true,
      };
    } catch (error) {
      logger.error('EmbeddingService: Failed to get model info', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
