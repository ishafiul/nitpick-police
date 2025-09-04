import { QdrantManager, SearchRequest, Point } from './qdrant/QdrantManager';
import { ConfigManager } from '../config';
import { QdrantConfig } from '../config';
import {
  CodeChunkDocument,
  ReviewInsightDocument,
  PromptDocument,
  CloudResponseDocument,
  QdrantCollectionConfig,
  CodeChunksCollectionConfig,
  ReviewInsightsCollectionConfig,
  PromptsCollectionConfig,
  CloudResponsesCollectionConfig,
} from '../types/qdrant';
import logger from '../utils/logger';

export interface QdrantSearchOptions {
  collection?: string;
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, any>;
  withPayload?: boolean;
  withVector?: boolean;
}

export interface QdrantUpsertOptions {
  collection?: string;
  wait?: boolean;
  ordering?: 'weak' | 'strong';
}

export interface QdrantServiceConfig {
  maxRetries: number;
  retryDelay: number;
  batchSize: number;
  connectionTimeout: number;
}

export class QdrantService {
  private qdrantManager: QdrantManager;
  private configManager: ConfigManager;
  private config: QdrantConfig | null = null;

  private isInitialized: boolean = false;

  constructor() {
    this.qdrantManager = new QdrantManager();
    this.configManager = new ConfigManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();
      this.config = this.configManager.get('qdrant') || null;

      if (!this.config) {
        throw new Error('Qdrant configuration not found');
      }

      await this.qdrantManager.connect();
      this.isInitialized = true;

      logger.info('QdrantService: Initialized successfully', {
        url: this.config.url,
        collections: Object.keys(this.config.collections || {}),
      });
    } catch (error) {
      logger.error('QdrantService: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('QdrantService not initialized. Call initialize() first.');
    }
  }

  getCollectionConfigs(): Record<string, QdrantCollectionConfig> {
    return {
      code_chunks: CodeChunksCollectionConfig,
      review_insights: ReviewInsightsCollectionConfig,
      prompts: PromptsCollectionConfig,
      cloud_responses: CloudResponsesCollectionConfig,
    };
  }

  async ensureCollection(name: string): Promise<void> {
    this.ensureInitialized();

    try {
      const exists = await this.qdrantManager.collectionExists(name);
      if (!exists) {
        const config = this.getCollectionConfigs()[name];
        if (!config) {
          throw new Error(`No configuration found for collection: ${name}`);
        }

        // Create collection with basic configuration first
        const collectionSchema = {
          name: config.name,
          vectors: config.vectorConfig || { size: 768, distance: 'cosine' as const },
          // Skip optimizers_config for now to avoid compatibility issues
        };

        logger.debug('QdrantService: Creating collection', {
          collection: name,
          schema: collectionSchema,
        });

        await this.qdrantManager.createCollection(collectionSchema);

        logger.info('QdrantService: Created collection', { collection: name });
      }
    } catch (error) {
      logger.error('QdrantService: Failed to ensure collection exists', {
        collection: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async searchCodeChunks(
    vector: number[],
    options: QdrantSearchOptions = {}
  ): Promise<CodeChunkDocument[]> {
    this.ensureInitialized();

    const collection = options.collection || this.config?.collections?.code_chunks || 'code_chunks';
    await this.ensureCollection(collection);

    try {
      const searchRequest = {
        vector,
        limit: options.limit || 10,
        score_threshold: options.scoreThreshold || 0.0,
        filter: options.filter || undefined,
        with_payload: options.withPayload !== false,
      } as SearchRequest;

      const results = await this.qdrantManager.search(collection, searchRequest);

      const documents: CodeChunkDocument[] = results.map(result => ({
        id: result.id,
        vector, 
        payload: result.payload as any, 
      }));

      logger.debug('QdrantService: Searched code chunks', {
        collection,
        vectorSize: vector.length,
        limit: options.limit || 10,
        resultsFound: documents.length,
      });

      return documents;

    } catch (error) {
      logger.error('QdrantService: Failed to search code chunks', {
        collection,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async upsertCodeChunks(
    documents: CodeChunkDocument[],
    options: QdrantUpsertOptions = {}
  ): Promise<void> {
    this.ensureInitialized();

    const collection = options.collection || this.config?.collections?.code_chunks || 'code_chunks';
    await this.ensureCollection(collection);

    try {
      const points: Point[] = documents.map(doc => ({
        id: doc.id,
        vector: doc.vector,
        payload: doc.payload,
      }));

      await this.qdrantManager.batchUpsertPoints(collection, points);

      logger.info('QdrantService: Upserted code chunks', {
        collection,
        count: documents.length,
      });

    } catch (error) {
      logger.error('QdrantService: Failed to upsert code chunks', {
        collection,
        count: documents.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async searchReviewInsights(
    vector: number[],
    options: QdrantSearchOptions = {}
  ): Promise<ReviewInsightDocument[]> {
    this.ensureInitialized();

    const collection = options.collection || this.config?.collections?.review_insights || 'review_insights';
    await this.ensureCollection(collection);

    try {
      const searchRequest = {
        vector,
        limit: options.limit || 10,
        score_threshold: options.scoreThreshold || 0.0,
        filter: options.filter || undefined,
        with_payload: options.withPayload !== false,
      } as SearchRequest;

      const results = await this.qdrantManager.search(collection, searchRequest);

      const documents: ReviewInsightDocument[] = results.map(result => ({
        id: result.id,
        vector, 
        payload: result.payload as any,
      }));

      logger.debug('QdrantService: Searched review insights', {
        collection,
        resultsFound: documents.length,
      });

      return documents;

    } catch (error) {
      logger.error('QdrantService: Failed to search review insights', {
        collection,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async upsertReviewInsights(
    documents: ReviewInsightDocument[],
    options: QdrantUpsertOptions = {}
  ): Promise<void> {
    this.ensureInitialized();

    const collection = options.collection || this.config?.collections?.review_insights || 'review_insights';
    await this.ensureCollection(collection);

    try {
      const points: Point[] = documents.map(doc => ({
        id: doc.id,
        vector: doc.vector || [], 
        payload: doc.payload,
      }));

      await this.qdrantManager.batchUpsertPoints(collection, points);

      logger.info('QdrantService: Upserted review insights', {
        collection,
        count: documents.length,
      });

    } catch (error) {
      logger.error('QdrantService: Failed to upsert review insights', {
        collection,
        count: documents.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async upsertPrompts(
    documents: PromptDocument[],
    options: QdrantUpsertOptions = {}
  ): Promise<void> {
    this.ensureInitialized();

    const collection = options.collection || this.config?.collections?.prompts || 'prompts';
    await this.ensureCollection(collection);

    try {
      
      const points: Point[] = documents.map(doc => ({
        id: doc.id,
        vector: [], 
        payload: doc.payload,
      }));

      await this.qdrantManager.batchUpsertPoints(collection, points);

      logger.info('QdrantService: Upserted prompts', {
        collection,
        count: documents.length,
      });

    } catch (error) {
      logger.error('QdrantService: Failed to upsert prompts', {
        collection,
        count: documents.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async upsertCloudResponses(
    documents: CloudResponseDocument[],
    options: QdrantUpsertOptions = {}
  ): Promise<void> {
    this.ensureInitialized();

    const collection = options.collection || this.config?.collections?.cloud_responses || 'cloud_responses';
    await this.ensureCollection(collection);

    try {
      const points: Point[] = documents.map(doc => ({
        id: doc.id,
        vector: [], 
        payload: doc.payload,
      }));

      await this.qdrantManager.batchUpsertPoints(collection, points);

      logger.info('QdrantService: Upserted cloud responses', {
        collection,
        count: documents.length,
      });

    } catch (error) {
      logger.error('QdrantService: Failed to upsert cloud responses', {
        collection,
        count: documents.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getCollectionStats(collection: string): Promise<{
    count: number;
    status: string;
    config: any;
  }> {
    this.ensureInitialized();

    try {
      const info = await this.qdrantManager.getCollectionInfo(collection);

      return {
        count: info.points_count || 0,
        status: info.status || 'unknown',
        config: info.config || {},
      };

    } catch (error) {
      logger.error('QdrantService: Failed to get collection stats', {
        collection,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteDocuments(
    collection: string,
    documentIds: string[]
  ): Promise<void> {
    this.ensureInitialized();

    try {
      await this.qdrantManager.deletePoints(collection, documentIds);

      logger.info('QdrantService: Deleted documents', {
        collection,
        count: documentIds.length,
      });

    } catch (error) {
      logger.error('QdrantService: Failed to delete documents', {
        collection,
        count: documentIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getChunksByFile(
    filePath: string,
    collection: string = 'code_chunks'
  ): Promise<CodeChunkDocument[]> {
    this.ensureInitialized();

    try {
      const results = await this.qdrantManager.getChunksByFile({
        filePath,
        collectionName: collection,
        withPayload: true,
      });

      const documents: CodeChunkDocument[] = results.map(result => ({
        id: result.id,
        vector: [], 
        payload: result.payload as any,
      }));

      logger.debug('QdrantService: Retrieved chunks by file', {
        filePath,
        collection,
        chunksFound: documents.length,
      });

      return documents;

    } catch (error) {
      logger.error('QdrantService: Failed to get chunks by file', {
        filePath,
        collection,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteChunksByFile(
    filePath: string,
    collection: string = 'code_chunks'
  ): Promise<number> {
    this.ensureInitialized();

    try {
      const deletedCount = await this.qdrantManager.deleteChunksByFile(filePath, collection);

      logger.info('QdrantService: Deleted chunks by file', {
        filePath,
        collection,
        chunksDeleted: deletedCount,
      });

      return deletedCount;

    } catch (error) {
      logger.error('QdrantService: Failed to delete chunks by file', {
        filePath,
        collection,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.qdrantManager.healthCheck();
      return true;
    } catch (error) {
      logger.warn('QdrantService: Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.qdrantManager.disconnect();
      this.isInitialized = false;
      logger.info('QdrantService: Shutdown completed');
    } catch (error) {
      logger.error('QdrantService: Shutdown failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  getConfig(): QdrantConfig | null {
    return this.config;
  }

  getQdrantManager(): QdrantManager {
    return this.qdrantManager;
  }
}
