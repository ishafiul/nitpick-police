import { QdrantManager } from './QdrantManager';
import {
  QdrantCollectionConfig,
  CodeChunksCollectionConfig,
  ReviewInsightsCollectionConfig,
  PromptsCollectionConfig,
  CloudResponsesCollectionConfig,
  validateCodeChunkPayload,
  validateReviewInsightPayload,
  validatePromptPayload,
  validateCloudResponsePayload,
} from '../../types';
import logger from '../../utils/logger';

export interface CollectionInfo {
  name: string;
  vectorCount: number;
  indexedVectorCount: number;
  pointsCount: number;
  status: 'green' | 'yellow' | 'red';
  config?: any;
}

export interface IndexConfig {
  fieldName: string;
  fieldType: 'keyword' | 'integer' | 'float' | 'bool' | 'datetime';
  isMulti?: boolean;
}

export class QdrantCollectionManager {
  private qdrantManager: QdrantManager;
  private collectionConfigs: Map<string, QdrantCollectionConfig>;

  constructor(qdrantManager: QdrantManager) {
    this.qdrantManager = qdrantManager;
    this.collectionConfigs = new Map();

    this.registerCollectionConfig(CodeChunksCollectionConfig);
    this.registerCollectionConfig(ReviewInsightsCollectionConfig);
    this.registerCollectionConfig(PromptsCollectionConfig);
    this.registerCollectionConfig(CloudResponsesCollectionConfig);
  }

  registerCollectionConfig(config: QdrantCollectionConfig): void {
    this.collectionConfigs.set(config.name, config);
    logger.debug('QdrantCollectionManager: Registered collection config', {
      collection: config.name,
      hasVector: !!config.vectorConfig,
    });
  }

  getCollectionConfig(name: string): QdrantCollectionConfig | undefined {
    return this.collectionConfigs.get(name);
  }

  async initializeCollections(): Promise<void> {
    const collectionNames = Array.from(this.collectionConfigs.keys());
    logger.info('QdrantCollectionManager: Initializing collections', {
      collections: collectionNames,
    });

    for (const collectionName of collectionNames) {
      await this.initializeCollection(collectionName);
    }

    logger.info('QdrantCollectionManager: All collections initialized successfully');
  }

  async initializeCollection(collectionName: string): Promise<void> {
    const config = this.collectionConfigs.get(collectionName);
    if (!config) {
      throw new Error(`Collection configuration not found: ${collectionName}`);
    }

    try {
      
      const exists = await this.qdrantManager.collectionExists(collectionName);

      if (exists) {
        logger.info('QdrantCollectionManager: Collection already exists, validating schema', {
          collection: collectionName,
        });

        await this.validateCollection(collectionName);
        return;
      }

      logger.info('QdrantCollectionManager: Creating collection', {
        collection: collectionName,
        vectorConfig: config.vectorConfig,
      });

      const collectionSchema = this.convertToCollectionSchema(config);
      await this.qdrantManager.createCollection(collectionSchema);

      await this.setupCollectionIndices(collectionName);

      logger.info('QdrantCollectionManager: Collection created successfully', {
        collection: collectionName,
      });

    } catch (error) {
      logger.error('QdrantCollectionManager: Failed to initialize collection', {
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async setupCollectionIndices(collectionName: string): Promise<void> {
    const indices: IndexConfig[] = this.getIndicesForCollection(collectionName);

    logger.debug('QdrantCollectionManager: Collection indices configured', {
      collection: collectionName,
      indices: indices.map(idx => idx.fieldName),
    });
  }

  private getIndicesForCollection(collectionName: string): IndexConfig[] {
    switch (collectionName) {
      case 'code_chunks':
        return [
          { fieldName: 'file', fieldType: 'keyword' },
          { fieldName: 'language', fieldType: 'keyword' },
          { fieldName: 'startLine', fieldType: 'integer' },
          { fieldName: 'endLine', fieldType: 'integer' },
          { fieldName: 'commit', fieldType: 'keyword' },
          { fieldName: 'createdAt', fieldType: 'datetime' },
        ];

      case 'review_insights':
        return [
          { fieldName: 'file', fieldType: 'keyword' },
          { fieldName: 'line', fieldType: 'integer' },
          { fieldName: 'category', fieldType: 'keyword' },
          { fieldName: 'severity', fieldType: 'keyword' },
          { fieldName: 'source', fieldType: 'keyword' },
          { fieldName: 'reviewId', fieldType: 'keyword' },
          { fieldName: 'createdAt', fieldType: 'datetime' },
        ];

      case 'prompts':
        return [
          { fieldName: 'scope.type', fieldType: 'keyword' },
          { fieldName: 'createdAt', fieldType: 'datetime' },
          { fieldName: 'topK', fieldType: 'integer' },
          { fieldName: 'tokenBudget', fieldType: 'integer' },
        ];

      case 'cloud_responses':
        return [
          { fieldName: 'promptId', fieldType: 'keyword' },
          { fieldName: 'model', fieldType: 'keyword' },
          { fieldName: 'status', fieldType: 'keyword' },
          { fieldName: 'issuesCount', fieldType: 'integer' },
          { fieldName: 'suggestionsCount', fieldType: 'integer' },
          { fieldName: 'createdAt', fieldType: 'datetime' },
        ];

      default:
        return [];
    }
  }

  private async validateCollection(collectionName: string): Promise<void> {
    try {
      const collectionInfo = await this.qdrantManager.getCollectionInfo(collectionName);

      if (!collectionInfo) {
        throw new Error(`Collection ${collectionName} exists but cannot retrieve info`);
      }

      logger.debug('QdrantCollectionManager: Collection validation passed', {
        collection: collectionName,
        vectorsCount: collectionInfo.vectors_count || 0,
        pointsCount: collectionInfo.points_count || 0,
      });

    } catch (error) {
      logger.warn('QdrantCollectionManager: Collection validation failed', {
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });

    }
  }

  async getAllCollectionsInfo(): Promise<CollectionInfo[]> {
    const collectionInfos: CollectionInfo[] = [];

    for (const collectionName of this.collectionConfigs.keys()) {
      try {
        const info = await this.getCollectionInfo(collectionName);
        if (info) {
          collectionInfos.push(info);
        }
      } catch (error) {
        logger.warn('QdrantCollectionManager: Failed to get info for collection', {
          collection: collectionName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return collectionInfos;
  }

  async getCollectionInfo(collectionName: string): Promise<CollectionInfo | null> {
    try {
      const collectionInfo = await this.qdrantManager.getCollectionInfo(collectionName);

      return {
        name: collectionName,
        vectorCount: collectionInfo.vectors_count || 0,
        indexedVectorCount: collectionInfo.indexed_vectors_count || 0,
        pointsCount: collectionInfo.points_count || 0,
        status: this.determineCollectionStatus(collectionInfo),
        config: collectionInfo.config,
      };
    } catch (error) {
      logger.debug('QdrantCollectionManager: Collection does not exist or cannot get info', {
        collection: collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private determineCollectionStatus(collectionInfo: any): 'green' | 'yellow' | 'red' {
    
    const pointsCount = collectionInfo.points_count || 0;
    const vectorsCount = collectionInfo.vectors_count || 0;

    if (pointsCount > 0 && vectorsCount > 0) {
      return 'green';
    } else if (pointsCount > 0 || vectorsCount > 0) {
      return 'yellow';
    } else {
      return 'red';
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    if (!this.collectionConfigs.has(collectionName)) {
      throw new Error(`Collection ${collectionName} is not managed by this collection manager`);
    }

    await this.qdrantManager.deleteCollection(collectionName);
    logger.info('QdrantCollectionManager: Collection deleted', {
      collection: collectionName,
    });
  }

  async insertCodeChunk(id: string, vector: number[], payload: any): Promise<void> {
    const validatedPayload = validateCodeChunkPayload(payload);
    await this.qdrantManager.upsertPoints('code_chunks', [{
      id,
      vector,
      payload: validatedPayload,
    }]);
  }

  async insertReviewInsight(id: string, payload: any, vector?: number[]): Promise<void> {
    const validatedPayload = validateReviewInsightPayload(payload);
    await this.qdrantManager.upsertPoints('review_insights', [{
      id,
      vector: vector || [],
      payload: validatedPayload,
    }]);
  }

  async insertPrompt(id: string, payload: any): Promise<void> {
    const validatedPayload = validatePromptPayload(payload);
    await this.qdrantManager.upsertPoints('prompts', [{
      id,
      vector: [], 
      payload: validatedPayload,
    }]);
  }

  async insertCloudResponse(id: string, payload: any): Promise<void> {
    const validatedPayload = validateCloudResponsePayload(payload);
    await this.qdrantManager.upsertPoints('cloud_responses', [{
      id,
      vector: [], 
      payload: validatedPayload,
    }]);
  }

  async batchInsertCodeChunks(chunks: Array<{id: string, vector: number[], payload: any}>): Promise<void> {
    const validatedChunks = chunks.map(chunk => ({
      id: chunk.id,
      vector: chunk.vector,
      payload: validateCodeChunkPayload(chunk.payload),
    }));

    await this.qdrantManager.batchUpsertPoints('code_chunks', validatedChunks);
  }

  async batchInsertReviewInsights(insights: Array<{id: string, vector?: number[], payload: any}>): Promise<void> {
    const validatedInsights = insights.map(insight => ({
      id: insight.id,
      vector: insight.vector || [],
      payload: validateReviewInsightPayload(insight.payload),
    }));

    await this.qdrantManager.batchUpsertPoints('review_insights', validatedInsights);
  }

  private convertToCollectionSchema(config: QdrantCollectionConfig): import('./QdrantManager').CollectionSchema {
    return {
      name: config.name,
      vectors: config.vectorConfig || {
        size: 768, 
        distance: 'cosine',
      },
      optimizers_config: config.optimizersConfig ? (() => {
        const opts: any = {};
        if (config.optimizersConfig.defaultSegmentNumber !== undefined) {
          opts.default_segment_number = config.optimizersConfig.defaultSegmentNumber;
        }
        if (config.optimizersConfig.indexingThreshold !== undefined) {
          opts.indexing_threshold = config.optimizersConfig.indexingThreshold;
        }
        if (config.optimizersConfig.memmapThreshold !== undefined) {
          opts.memmap_threshold = config.optimizersConfig.memmapThreshold;
        }
        return Object.keys(opts).length > 0 ? opts : undefined;
      })() : undefined,
    };
  }

  getRegisteredCollections(): string[] {
    return Array.from(this.collectionConfigs.keys());
  }

  async isCollectionReady(collectionName: string): Promise<boolean> {
    try {
      const exists = await this.qdrantManager.collectionExists(collectionName);
      if (!exists) {
        return false;
      }

      const info = await this.getCollectionInfo(collectionName);
      return info?.status === 'green';
    } catch (error) {
      return false;
    }
  }
}
