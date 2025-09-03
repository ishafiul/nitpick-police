import { QdrantClient } from '@qdrant/js-client-rest';
import { ConfigManager, QdrantConfig } from '../../config';
import logger from '../../utils/logger';

export interface CollectionSchema {
  name: string;
  vectors: {
    size: number;
    distance: 'cosine' | 'euclidean' | 'dot';
  };
  optimizers_config?: {
    default_segment_number?: number;
    indexing_threshold?: number;
  };
}

export interface Point {
  id: string;
  vector: number[];
  payload?: Record<string, any>;
}

export interface QdrantSearchResult {
  id: string;
  score: number;
  payload?: Record<string, any>;
}

export interface SearchRequest {
  vector: number[];
  limit?: number;
  filter?: Record<string, any>;
  with_payload?: boolean;
  score_threshold?: number;
}

export interface FileBasedQuery {
  filePath: string;
  collectionName?: string | undefined;
  withPayload?: boolean;
  limit?: number;
}

export interface ChunkUpdateRequest {
  id: string;
  vector?: number[];
  payload?: Record<string, any>;
}

export interface FileBatchUpdateRequest {
  filePath: string;
  updates: ChunkUpdateRequest[];
}

export class QdrantManager {
  private client: QdrantClient | null = null;
  private configManager: ConfigManager;
  private config: QdrantConfig | null = null;
  private isConnectedFlag: boolean = false;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async connect(): Promise<void> {
    try {
      
      await this.configManager.loadConfig();
      this.config = this.configManager.get('qdrant') as QdrantConfig;

      if (!this.config) {
        throw new Error('Qdrant configuration not found. Please check your config file.');
      }

      this.client = new QdrantClient({
        url: this.config.url,
        ...(this.config.api_key && { apiKey: this.config.api_key }),
        timeout: this.config.timeout,
      });

      await this.healthCheck();

      this.isConnectedFlag = true;
      logger.info('QdrantManager: Successfully connected to Qdrant', {
        url: this.config.url,
        collections: Object.keys(this.config.collections),
      });

    } catch (error) {
      this.isConnectedFlag = false;
      logger.error('QdrantManager: Failed to connect to Qdrant', {
        error: error instanceof Error ? error.message : String(error),
        url: this.config?.url,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {

      this.client = null;
      this.isConnectedFlag = false;
      logger.info('QdrantManager: Disconnected from Qdrant');
    }
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }

  async healthCheck(): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    try {
      
      await this.client.getCollections();
    } catch (error) {
      logger.error('QdrantManager: Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Qdrant health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async createCollection(schema: CollectionSchema): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    try {
      await this.client.createCollection(schema.name, {
        vectors: {
          size: schema.vectors.size,
          distance: schema.vectors.distance as any, 
        },
        ...(schema.optimizers_config && { optimizers_config: schema.optimizers_config as any }),
      });

      logger.info('QdrantManager: Collection created successfully', {
        collection: schema.name,
        vectorSize: schema.vectors.size,
        distance: schema.vectors.distance,
      });

    } catch (error) {
      logger.error('QdrantManager: Failed to create collection', {
        collection: schema.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    try {
      await this.client.deleteCollection(collectionName);
      logger.info('QdrantManager: Collection deleted successfully', {
        collection: collectionName,
      });

    } catch (error) {
      logger.error('QdrantManager: Failed to delete collection', {
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    try {
      const collections = await this.client.getCollections();
      return collections.collections.some(col => col.name === collectionName);
    } catch (error) {
      logger.error('QdrantManager: Failed to check collection existence', {
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async upsertPoints(collectionName: string, points: Point[]): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    const maxRetries = this.config?.retries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.upsert(collectionName, {
          points: points.map(point => ({
            id: point.id,
            vector: point.vector,
            payload: point.payload || {},
          })),
        });

        logger.info('QdrantManager: Points upserted successfully', {
          collection: collectionName,
          pointsCount: points.length,
          attempt,
        });

        return;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; 
          logger.warn('QdrantManager: Upsert failed, retrying', {
            collection: collectionName,
            attempt,
            maxRetries,
            delay,
            error: lastError.message,
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error('QdrantManager: All upsert attempts failed', {
      collection: collectionName,
      maxRetries,
      error: lastError?.message,
    });
    throw lastError;
  }

  async search(collectionName: string, request: SearchRequest): Promise<QdrantSearchResult[]> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    try {
      const response = await this.client.search(collectionName, {
        vector: request.vector,
        limit: request.limit || 10,
        ...(request.filter && { filter: request.filter as any }),
        with_payload: request.with_payload !== false,
        ...(request.score_threshold !== undefined && { score_threshold: request.score_threshold }),
      });

      const results: QdrantSearchResult[] = response.map(hit => ({
        id: hit.id as string,
        score: hit.score,
        payload: hit.payload as Record<string, any>,
      }));

      logger.debug('QdrantManager: Search completed', {
        collection: collectionName,
        queryVectorSize: request.vector.length,
        limit: request.limit || 10,
        resultsCount: results.length,
      });

      return results;

    } catch (error) {
      logger.error('QdrantManager: Search failed', {
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deletePoints(collectionName: string, pointIds: string[]): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    try {
      await this.client.delete(collectionName, {
        points: pointIds,
      });

      logger.info('QdrantManager: Points deleted successfully', {
        collection: collectionName,
        pointsCount: pointIds.length,
      });

    } catch (error) {
      logger.error('QdrantManager: Failed to delete points', {
        collection: collectionName,
        pointsCount: pointIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getCollectionInfo(collectionName: string): Promise<any> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    try {
      return await this.client.getCollection(collectionName);
    } catch (error) {
      logger.error('QdrantManager: Failed to get collection info', {
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async batchUpsertPoints(collectionName: string, points: Point[]): Promise<void> {
    const batchSize = this.config?.batch_size || 100;

    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.upsertPoints(collectionName, batch);

      logger.debug('QdrantManager: Processed batch', {
        collection: collectionName,
        batchIndex: Math.floor(i / batchSize),
        batchSize: batch.length,
        totalProcessed: Math.min(i + batchSize, points.length),
        totalPoints: points.length,
      });
    }
  }

  async getChunksByFile(query: FileBasedQuery): Promise<QdrantSearchResult[]> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    const collectionName = query.collectionName || this.config?.collections?.code_chunks || 'code_chunks';

    try {
      
      const scrollResponse = await this.client.scroll(collectionName, {
        filter: {
          must: [
            {
              key: 'file',
              match: { value: query.filePath },
            },
          ],
        },
        with_payload: query.withPayload !== false,
        limit: query.limit || 10000, 
      });

      const results: QdrantSearchResult[] = scrollResponse.points.map(point => ({
        id: point.id as string,
        score: 1.0, 
        payload: point.payload as Record<string, any>,
      }));

      logger.debug('QdrantManager: Retrieved chunks by file', {
        filePath: query.filePath,
        collection: collectionName,
        chunksFound: results.length,
      });

      return results;

    } catch (error) {
      logger.error('QdrantManager: Failed to get chunks by file', {
        filePath: query.filePath,
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteChunksByFile(filePath: string, collectionName?: string): Promise<number> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    const collection = collectionName || this.config?.collections?.code_chunks || 'code_chunks';

    try {
      
      const chunks = await this.getChunksByFile({
        filePath,
        collectionName: collection,
        withPayload: false,
      });

      if (chunks.length === 0) {
        logger.debug('QdrantManager: No chunks found for file', {
          filePath,
          collection,
        });
        return 0;
      }

      const chunkIds = chunks.map(chunk => chunk.id);

      await this.deletePoints(collection, chunkIds);

      logger.info('QdrantManager: Deleted chunks by file', {
        filePath,
        collection,
        chunksDeleted: chunkIds.length,
      });

      return chunkIds.length;

    } catch (error) {
      logger.error('QdrantManager: Failed to delete chunks by file', {
        filePath,
        collection,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updateChunksBatch(request: FileBatchUpdateRequest, collectionName?: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Qdrant. Call connect() first.');
    }

    const collection = collectionName || this.config?.collections?.code_chunks || 'code_chunks';

    try {
      if (request.updates.length === 0) {
        logger.debug('QdrantManager: No updates to process', {
          filePath: request.filePath,
          collection,
        });
        return;
      }

      const points: Point[] = request.updates.map(update => ({
        id: update.id,
        vector: update.vector || [], 
        payload: update.payload || {},
      }));

      await this.batchUpsertPoints(collection, points);

      logger.info('QdrantManager: Updated chunks batch', {
        filePath: request.filePath,
        collection,
        updatesProcessed: request.updates.length,
      });

    } catch (error) {
      logger.error('QdrantManager: Failed to update chunks batch', {
        filePath: request.filePath,
        collection,
        updatesCount: request.updates.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getFileStats(filePath: string, collectionName?: string): Promise<{
    totalChunks: number;
    totalSize: number;
    language?: string | undefined;
    lastModified?: string | undefined;
  }> {
    try {
      const chunks = await this.getChunksByFile({
        filePath,
        collectionName: collectionName || undefined,
        withPayload: true,
      });

      if (chunks.length === 0) {
        return {
          totalChunks: 0,
          totalSize: 0,
        };
      }

      let totalSize = 0;
      let language: string | undefined;
      let lastModified: string | undefined;

      for (const chunk of chunks) {
        const payload = chunk.payload;
        if (payload) {
          if (payload['language'] && !language) {
            language = payload['language'];
          }
          if (payload['processed_at'] && (!lastModified || payload['processed_at'] > lastModified)) {
            lastModified = payload['processed_at'];
          }
          
          if (payload['content']) {
            totalSize += payload['content'].length;
          }
        }
      }

      return {
        totalChunks: chunks.length,
        totalSize,
        language,
        lastModified,
      };

    } catch (error) {
      logger.warn('QdrantManager: Failed to get file stats', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalChunks: 0,
        totalSize: 0,
      };
    }
  }

  async fileExistsInQdrant(filePath: string, collectionName?: string): Promise<boolean> {
    try {
      const chunks = await this.getChunksByFile({
        filePath,
        collectionName: collectionName || undefined,
        withPayload: false,
        limit: 1,
      });

      return chunks.length > 0;

    } catch (error) {
      logger.warn('QdrantManager: Failed to check file existence', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  getConfig(): QdrantConfig | null {
    return this.config;
  }
}
