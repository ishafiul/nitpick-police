import { QdrantClient } from '@qdrant/js-client-rest';
import { z } from 'zod';
import { ConfigManager } from '../config';
import { CloudReviewResult } from './cloud-review.service';
import { ReviewMetadata } from './review-storage.service';
import logger from '../utils/logger';

export const ReviewPointSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  payload: z.object({
    reviewId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    timestamp: z.string(),
    source: z.enum(['file', 'commit', 'repository']),
    sourcePath: z.string().optional(),
    sourceCommit: z.string().optional(),
    model: z.string(),
    processingTime: z.number(),
    reviewType: z.enum(['code', 'commit']),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    issueCount: z.number().optional(),
    tags: z.array(z.string()),
    version: z.string(),
    
    summary: z.string().optional(),
    issues: z.array(z.any()).optional(),
    recommendations: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    impact: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  }),
});

export type ReviewPoint = z.infer<typeof ReviewPointSchema>;

export const InsightPointSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  payload: z.object({
    insightId: z.string(),
    reviewId: z.string(),
    type: z.enum(['issue', 'recommendation', 'pattern', 'improvement']),
    content: z.string(),
    category: z.string().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    tags: z.array(z.string()),
    timestamp: z.string(),
    source: z.enum(['file', 'commit', 'repository']),
    sourcePath: z.string().optional(),
    confidence: z.number().min(0).max(1),
  }),
});

export type InsightPoint = z.infer<typeof InsightPointSchema>;

export const PromptPointSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  payload: z.object({
    promptId: z.string(),
    reviewId: z.string(),
    content: z.string(),
    type: z.enum(['system', 'user', 'context', 'instructions']),
    tokenCount: z.number(),
    model: z.string(),
    timestamp: z.string(),
    tags: z.array(z.string()),
  }),
});

export type PromptPoint = z.infer<typeof PromptPointSchema>;

export const CloudResponsePointSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  payload: z.object({
    responseId: z.string(),
    reviewId: z.string(),
    content: z.string(),
    model: z.string(),
    usage: z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalTokens: z.number(),
    }),
    processingTime: z.number(),
    timestamp: z.string(),
    tags: z.array(z.string()),
  }),
});

export type CloudResponsePoint = z.infer<typeof CloudResponsePointSchema>;

export const QdrantReviewConfigSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().optional(),
  collections: z.object({
    reviews: z.string().default('review_results'),
    insights: z.string().default('review_insights'),
    prompts: z.string().default('review_prompts'),
    responses: z.string().default('cloud_responses'),
  }),
  vectorSize: z.number().int().positive().default(768), 
});

export type QdrantReviewConfig = z.infer<typeof QdrantReviewConfigSchema>;

export interface ReviewSearchOptions {
  query?: string;
  vector?: number[];
  source?: 'file' | 'commit' | 'repository';
  sourcePath?: string;
  model?: string;
  reviewType?: 'code' | 'commit';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  scoreThreshold?: number;
}

export interface InsightSearchOptions {
  query?: string;
  vector?: number[];
  type?: 'issue' | 'recommendation' | 'pattern' | 'improvement';
  category?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  confidence?: number;
  limit?: number;
  scoreThreshold?: number;
}

export class QdrantReviewStorageService {
  private client!: QdrantClient;
  private config: QdrantReviewConfig;
  private configManager: ConfigManager;
  private isInitialized: boolean = false;

  constructor() {
    this.configManager = new ConfigManager();
    this.config = {
      url: 'http://localhost:6333',
      collections: {
        reviews: 'review_results',
        insights: 'review_insights',
        prompts: 'review_prompts',
        responses: 'cloud_responses',
      },
      vectorSize: 768,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();

      const qdrantConfig = this.configManager.get('qdrant');
      if (qdrantConfig) {
        this.config = QdrantReviewConfigSchema.parse(qdrantConfig);
      }

      this.client = new QdrantClient({
        url: this.config.url,
        ...(this.config.apiKey && { apiKey: this.config.apiKey }),
      });

      await this.client.getCollections();

      await this.ensureCollections();

      this.isInitialized = true;
      logger.info('QdrantReviewStorageService initialized successfully', {
        url: this.config.url,
        collections: this.config.collections,
      });
    } catch (error) {
      logger.error('Failed to initialize QdrantReviewStorageService', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async storeReview(reviewResult: CloudReviewResult, metadata: ReviewMetadata, embedding: number[]): Promise<void> {
    await this.initialize();

    try {
      const reviewId = metadata.id;

      await this.storeReviewResult(reviewResult, metadata, embedding);

      await this.extractAndStoreInsights(reviewResult, metadata);

      await this.storePrompts(reviewResult, metadata);

      await this.storeCloudResponse(reviewResult, metadata);

      logger.info('Review stored in Qdrant successfully', {
        reviewId,
        title: metadata.title,
        model: metadata.model,
      });
    } catch (error) {
      logger.error('Failed to store review in Qdrant', {
        reviewId: metadata.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async searchReviews(options: ReviewSearchOptions): Promise<ReviewPoint[]> {
    await this.initialize();

    try {
      let filter: any = {};

      if (options.source) {
        filter.source = { eq: options.source };
      }
      if (options.sourcePath) {
        filter.sourcePath = { eq: options.sourcePath };
      }
      if (options.model) {
        filter.model = { eq: options.model };
      }
      if (options.reviewType) {
        filter.reviewType = { eq: options.reviewType };
      }
      if (options.severity) {
        filter.severity = { eq: options.severity };
      }
      if (options.tags && options.tags.length > 0) {
        filter.tags = { any: options.tags };
      }
      if (options.dateFrom || options.dateTo) {
        filter.timestamp = {};
        if (options.dateFrom) {
          filter.timestamp.gte = options.dateFrom.toISOString();
        }
        if (options.dateTo) {
          filter.timestamp.lte = options.dateTo.toISOString();
        }
      }

      const searchRequest: any = {
        limit: options.limit || 10,
        score_threshold: options.scoreThreshold || 0.5,
        with_payload: true,
        with_vectors: false,
      };

      if (options.vector) {
        searchRequest.vector = options.vector;
        searchRequest.filter = Object.keys(filter).length > 0 ? filter : undefined;
      } else if (options.query) {

        throw new Error('Vector search requires pre-computed embeddings. Use semantic search through RetrievalService.');
      } else {
        searchRequest.filter = filter;
        searchRequest.score_threshold = undefined; 
      }

      const response = await this.client.search(this.config.collections.reviews, searchRequest);

      return response.map((point: any) => ({
        id: point.id as string,
        vector: point.vector || [],
        payload: point.payload as ReviewPoint['payload'],
      }));
    } catch (error) {
      logger.error('Failed to search reviews', {
        error: error instanceof Error ? error.message : String(error),
        options,
      });
      return [];
    }
  }

  async searchInsights(options: InsightSearchOptions): Promise<InsightPoint[]> {
    await this.initialize();

    try {
      let filter: any = {};

      if (options.type) {
        filter.type = { eq: options.type };
      }
      if (options.category) {
        filter.category = { eq: options.category };
      }
      if (options.severity) {
        filter.severity = { eq: options.severity };
      }
      if (options.tags && options.tags.length > 0) {
        filter.tags = { any: options.tags };
      }
      if (options.confidence) {
        filter.confidence = { gte: options.confidence };
      }

      const searchRequest: any = {
        limit: options.limit || 10,
        score_threshold: options.scoreThreshold || 0.5,
        with_payload: true,
        with_vectors: false,
      };

      if (options.vector) {
        searchRequest.vector = options.vector;
        searchRequest.filter = Object.keys(filter).length > 0 ? filter : undefined;
      } else if (options.query) {
        throw new Error('Vector search requires pre-computed embeddings. Use semantic search through RetrievalService.');
      } else {
        searchRequest.filter = filter;
        searchRequest.score_threshold = undefined;
      }

      const response = await this.client.search(this.config.collections.insights, searchRequest);

      return response.map((point: any) => ({
        id: point.id as string,
        vector: point.vector || [],
        payload: point.payload as InsightPoint['payload'],
      }));
    } catch (error) {
      logger.error('Failed to search insights', {
        error: error instanceof Error ? error.message : String(error),
        options,
      });
      return [];
    }
  }

  async deleteReview(reviewId: string): Promise<void> {
    await this.initialize();

    try {
      
      const collections = [
        this.config.collections.reviews,
        this.config.collections.insights,
        this.config.collections.prompts,
        this.config.collections.responses,
      ];

      for (const collection of collections) {
        try {
          await this.client.delete(collection, {
            points: [reviewId],
          });
        } catch (error) {
          logger.warn(`Failed to delete from collection ${collection}`, {
            reviewId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Review deleted from Qdrant', { reviewId });
    } catch (error) {
      logger.error('Failed to delete review from Qdrant', {
        reviewId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getStats(): Promise<{
    reviews: { count: number; size: number };
    insights: { count: number; size: number };
    prompts: { count: number; size: number };
    responses: { count: number; size: number };
  }> {
    await this.initialize();

    try {
      const collections = [
        this.config.collections.reviews,
        this.config.collections.insights,
        this.config.collections.prompts,
        this.config.collections.responses,
      ];

      const stats: any = {};

      for (const collection of collections) {
        try {
          const info = await this.client.getCollection(collection);
          stats[collection] = {
            count: info.points_count || 0,
            size: info.vectors_count || 0,
          };
        } catch (error) {
          logger.warn(`Failed to get stats for collection ${collection}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          stats[collection] = { count: 0, size: 0 };
        }
      }

      return {
        reviews: stats[this.config.collections.reviews],
        insights: stats[this.config.collections.insights],
        prompts: stats[this.config.collections.prompts],
        responses: stats[this.config.collections.responses],
      };
    } catch (error) {
      logger.error('Failed to get Qdrant stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async ensureCollections(): Promise<void> {
    const collections = [
      {
        name: this.config.collections.reviews,
        schema: ReviewPointSchema,
        description: 'Stores complete review results with metadata',
      },
      {
        name: this.config.collections.insights,
        schema: InsightPointSchema,
        description: 'Stores extracted insights from reviews',
      },
      {
        name: this.config.collections.prompts,
        schema: PromptPointSchema,
        description: 'Stores prompts used for reviews',
      },
      {
        name: this.config.collections.responses,
        schema: CloudResponsePointSchema,
        description: 'Stores raw cloud LLM responses',
      },
    ];

    for (const collection of collections) {
      try {
        
        await this.client.getCollection(collection.name);
        logger.debug(`Collection ${collection.name} already exists`);
      } catch (error) {
        
        await this.client.createCollection(collection.name, {
          vectors: {
            size: this.config.vectorSize,
            distance: 'Cosine',
          },
        });

        logger.info(`Created collection ${collection.name}`, {
          description: collection.description,
        });
      }
    }
  }

  private async storeReviewResult(reviewResult: CloudReviewResult, metadata: ReviewMetadata, embedding: number[]): Promise<void> {
    const reviewPayload = {
      reviewId: metadata.id,
      title: metadata.title,
      description: metadata.description,
      timestamp: metadata.timestamp,
      source: metadata.source,
      sourcePath: metadata.sourcePath,
      sourceCommit: metadata.sourceCommit,
      model: metadata.model,
      processingTime: metadata.processingTime,
      reviewType: metadata.reviewType,
      severity: metadata.severity,
      issueCount: metadata.issueCount,
      tags: metadata.tags,
      version: metadata.version,
      summary: this.extractSummary(reviewResult),
      issues: 'issues' in reviewResult.review ? reviewResult.review.issues : undefined,
      recommendations: this.extractRecommendations(reviewResult),
      categories: 'categories' in reviewResult.review ? reviewResult.review.categories : undefined,
      impact: 'impact' in reviewResult.review ? reviewResult.review.impact : undefined,
    };

    await this.client.upsert(this.config.collections.reviews, {
      points: [{
        id: metadata.id,
        vector: embedding,
        payload: reviewPayload,
      }],
    });
  }

  private async extractAndStoreInsights(reviewResult: CloudReviewResult, metadata: ReviewMetadata): Promise<void> {
    const insights: InsightPoint[] = [];

    if ('issues' in reviewResult.review && reviewResult.review.issues) {
      for (const issue of reviewResult.review.issues) {
        insights.push({
          id: `${metadata.id}_issue_${insights.length}`,
          vector: [], 
          payload: {
            insightId: `${metadata.id}_issue_${insights.length}`,
            reviewId: metadata.id,
            type: 'issue',
            content: issue.description || issue.title || 'No description',
            category: issue.category,
            severity: issue.severity,
            tags: metadata.tags,
            timestamp: metadata.timestamp,
            source: metadata.source,
            sourcePath: metadata.sourcePath,
            confidence: 0.8, 
          },
        });
      }
    }

    if ('recommendations' in reviewResult.review && reviewResult.review.recommendations) {
      for (const recommendation of reviewResult.review.recommendations) {
        insights.push({
          id: `${metadata.id}_rec_${insights.length}`,
          vector: [], 
          payload: {
            insightId: `${metadata.id}_rec_${insights.length}`,
            reviewId: metadata.id,
            type: 'recommendation',
            content: recommendation,
            tags: metadata.tags,
            timestamp: metadata.timestamp,
            source: metadata.source,
            sourcePath: metadata.sourcePath,
            confidence: 0.7,
          },
        });
      }
    }

    if (insights.length > 0) {
      await this.client.upsert(this.config.collections.insights, {
        points: insights.map(insight => ({
          id: insight.id,
          vector: new Array(this.config.vectorSize).fill(0), 
          payload: insight.payload,
        })),
      });
    }
  }

  private async storePrompts(_reviewResult: CloudReviewResult, metadata: ReviewMetadata): Promise<void> {

    logger.debug('Prompt storage skipped - requires prompt composition integration', {
      reviewId: metadata.id,
    });
  }

  private async storeCloudResponse(reviewResult: CloudReviewResult, metadata: ReviewMetadata): Promise<void> {
    const responsePayload = {
      responseId: `${metadata.id}_response`,
      reviewId: metadata.id,
      content: reviewResult.rawResponse,
      model: reviewResult.model,
      usage: reviewResult.usage,
      processingTime: reviewResult.processingTime,
      timestamp: metadata.timestamp,
      tags: metadata.tags,
    };

    await this.client.upsert(this.config.collections.responses, {
      points: [{
        id: `${metadata.id}_response`,
        vector: new Array(this.config.vectorSize).fill(0), 
        payload: responsePayload,
      }],
    });
  }

  private extractSummary(reviewResult: CloudReviewResult): string | undefined {
    if ('issues' in reviewResult.review) {
      const issueCount = reviewResult.review.issues.length;
      return `Code review found ${issueCount} issue${issueCount !== 1 ? 's' : ''}`;
    } else if ('categories' in reviewResult.review) {
      return `Commit review covering ${reviewResult.review.categories.join(', ')}`;
    }
    return undefined;
  }

  private extractRecommendations(reviewResult: CloudReviewResult): string[] | undefined {
    if ('recommendations' in reviewResult.review) {
      return reviewResult.review.recommendations;
    }
    return undefined;
  }
}
