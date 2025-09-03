import { QdrantManager } from '../../services/qdrant';

export interface QdrantMigrationContext {
  qdrantManager: QdrantManager;
  collectionNames: {
    code_chunks: string;
    review_insights: string;
    prompts: string;
    cloud_responses: string;
  };
  config: {
    vectorDimension: number;
    distanceMetric: 'cosine' | 'euclidean' | 'dot';
    embeddingModel: string;
  };
}

export interface QdrantMigration {
  readonly version: string;
  readonly description: string;

  up(context: QdrantMigrationContext): Promise<void>;

  down(context: QdrantMigrationContext): Promise<void>;

  canApply(context: QdrantMigrationContext): Promise<boolean>;

  canRollback(context: QdrantMigrationContext): Promise<boolean>;
}

export abstract class BaseQdrantMigration implements QdrantMigration {
  abstract readonly version: string;
  abstract readonly description: string;

  abstract up(context: QdrantMigrationContext): Promise<void>;
  abstract down(context: QdrantMigrationContext): Promise<void>;

  async canApply(_context: QdrantMigrationContext): Promise<boolean> {
    return true; 
  }

  async canRollback(_context: QdrantMigrationContext): Promise<boolean> {
    return true; 
  }

  protected async ensureCollectionExists(
    context: QdrantMigrationContext,
    collectionName: string,
    schema: any
  ): Promise<void> {
    const exists = await context.qdrantManager.collectionExists(collectionName);
    if (!exists) {
      await context.qdrantManager.createCollection(schema);
    }
  }

  protected async ensureCollectionDeleted(
    context: QdrantMigrationContext,
    collectionName: string
  ): Promise<void> {
    const exists = await context.qdrantManager.collectionExists(collectionName);
    if (exists) {
      await context.qdrantManager.deleteCollection(collectionName);
    }
  }

  protected async validateCollectionSchema(
    context: QdrantMigrationContext,
    collectionName: string,
    _expectedSchema: any
  ): Promise<boolean> {
    try {
      const info = await context.qdrantManager.getCollectionInfo(collectionName);
      
      return info !== null;
    } catch {
      return false;
    }
  }
}
