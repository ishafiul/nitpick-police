import { BaseQdrantMigration, QdrantMigrationContext } from './base-migration';

export class V1_0_0_QdrantCollectionsInitMigration extends BaseQdrantMigration {
  readonly version = '1.0.0';
  readonly description = 'Initialize Qdrant collections for indexing-first workflow';

  async up(context: QdrantMigrationContext): Promise<void> {
    console.log('🔄 Applying Qdrant collections initialization migration...');

    const codeChunksSchema = {
      name: context.collectionNames.code_chunks,
      vectors: {
        size: context.config.vectorDimension,
        distance: context.config.distanceMetric,
      },
      optimizers_config: {
        default_segment_number: 4,
        indexing_threshold: 10000,
        memmap_threshold: 1000000,
      },
    };

    await this.ensureCollectionExists(context, context.collectionNames.code_chunks, codeChunksSchema);
    console.log(`✅ Created collection: ${context.collectionNames.code_chunks}`);

    const reviewInsightsSchema = {
      name: context.collectionNames.review_insights,
      vectors: {
        size: context.config.vectorDimension,
        distance: context.config.distanceMetric,
      },
      optimizers_config: {
        default_segment_number: 2,
        indexing_threshold: 5000,
      },
    };

    await this.ensureCollectionExists(context, context.collectionNames.review_insights, reviewInsightsSchema);
    console.log(`✅ Created collection: ${context.collectionNames.review_insights}`);

    const promptsSchema = {
      name: context.collectionNames.prompts,
      optimizers_config: {
        default_segment_number: 1,
        indexing_threshold: 1000,
      },
    };

    await this.ensureCollectionExists(context, context.collectionNames.prompts, promptsSchema);
    console.log(`✅ Created collection: ${context.collectionNames.prompts}`);

    const cloudResponsesSchema = {
      name: context.collectionNames.cloud_responses,
      optimizers_config: {
        default_segment_number: 1,
        indexing_threshold: 1000,
      },
    };

    await this.ensureCollectionExists(context, context.collectionNames.cloud_responses, cloudResponsesSchema);
    console.log(`✅ Created collection: ${context.collectionNames.cloud_responses}`);

    console.log('🎉 Qdrant collections initialization completed successfully!');
  }

  async down(context: QdrantMigrationContext): Promise<void> {
    console.log('🔄 Rolling back Qdrant collections initialization migration...');

    await this.ensureCollectionDeleted(context, context.collectionNames.cloud_responses);
    console.log(`🗑️ Deleted collection: ${context.collectionNames.cloud_responses}`);

    await this.ensureCollectionDeleted(context, context.collectionNames.prompts);
    console.log(`🗑️ Deleted collection: ${context.collectionNames.prompts}`);

    await this.ensureCollectionDeleted(context, context.collectionNames.review_insights);
    console.log(`🗑️ Deleted collection: ${context.collectionNames.review_insights}`);

    await this.ensureCollectionDeleted(context, context.collectionNames.code_chunks);
    console.log(`🗑️ Deleted collection: ${context.collectionNames.code_chunks}`);

    console.log('🎉 Qdrant collections rollback completed successfully!');
  }

  override async canApply(context: QdrantMigrationContext): Promise<boolean> {
    
    const collections = [
      context.collectionNames.code_chunks,
      context.collectionNames.review_insights,
      context.collectionNames.prompts,
      context.collectionNames.cloud_responses,
    ];

    for (const collectionName of collections) {
      const exists = await context.qdrantManager.collectionExists(collectionName);
      if (exists) {
        return false; 
      }
    }

    return true;
  }

  override async canRollback(context: QdrantMigrationContext): Promise<boolean> {
    
    const collections = [
      context.collectionNames.code_chunks,
      context.collectionNames.review_insights,
      context.collectionNames.prompts,
      context.collectionNames.cloud_responses,
    ];

    for (const collectionName of collections) {
      const exists = await context.qdrantManager.collectionExists(collectionName);
      if (!exists) {
        return false; 
      }
    }

    return true;
  }
}
