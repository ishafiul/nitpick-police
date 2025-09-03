import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { ConfigManager } from '../config';
import { CloudReviewResult } from './cloud-review.service';
import logger from '../utils/logger';

export const ReviewMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  timestamp: z.string().datetime(),
  source: z.enum(['file', 'commit', 'repository']),
  sourcePath: z.string().optional(),
  sourceCommit: z.string().optional(),
  model: z.string(),
  processingTime: z.number(),
  tokenUsage: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  reviewType: z.enum(['code', 'commit']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  issueCount: z.number().optional(),
  tags: z.array(z.string()).default([]),
  version: z.string().default('1.0'),
});

export type ReviewMetadata = z.infer<typeof ReviewMetadataSchema>;

export const StoredReviewSchema = z.object({
  metadata: ReviewMetadataSchema,
  review: z.union([
    z.object({
      type: z.literal('code'),
      data: z.any(), 
    }),
    z.object({
      type: z.literal('commit'),
      data: z.any(), 
    }),
  ]),
  rawResponse: z.string(),
  storage: z.object({
    path: z.string(),
    size: z.number(),
    checksum: z.string(),
    created: z.string().datetime(),
    modified: z.string().datetime(),
  }),
});

export type StoredReview = z.infer<typeof StoredReviewSchema>;

export interface ReviewSearchOptions {
  source?: 'file' | 'commit' | 'repository';
  sourcePath?: string;
  sourceCommit?: string;
  model?: string;
  reviewType?: 'code' | 'commit';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'processingTime' | 'issueCount';
  sortOrder?: 'asc' | 'desc';
}

export interface ReviewStorageStats {
  totalReviews: number;
  totalSize: number;
  reviewsByType: Record<string, number>;
  reviewsByModel: Record<string, number>;
  reviewsBySeverity: Record<string, number>;
  dateRange: {
    oldest: string | null;
    newest: string | null;
  };
  averageProcessingTime: number;
  averageTokenUsage: number;
}

export class ReviewStorageService {
  private configManager: ConfigManager;
  private storagePath: string;
  private indexPath: string;
  private isInitialized: boolean = false;

  constructor() {
    this.configManager = new ConfigManager();
    this.storagePath = '';
    this.indexPath = '';
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();

      const projectRoot = process.cwd();
      const reviewStorageDir = path.join(projectRoot, '.commit-pr', 'reviews');

      if (!fs.existsSync(reviewStorageDir)) {
        fs.mkdirSync(reviewStorageDir, { recursive: true });
      }

      this.storagePath = reviewStorageDir;
      this.indexPath = path.join(reviewStorageDir, 'index.json');

      if (!fs.existsSync(this.indexPath)) {
        this.writeIndexFile({
          version: '1.0',
          lastUpdated: new Date().toISOString(),
          reviews: {},
        });
      }

      this.isInitialized = true;
      logger.info('ReviewStorageService initialized successfully', {
        storagePath: this.storagePath,
      });
    } catch (error) {
      logger.error('Failed to initialize ReviewStorageService', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async storeReview(reviewResult: CloudReviewResult, sourceInfo: {
    title?: string;
    description?: string;
    source: 'file' | 'commit' | 'repository';
    sourcePath?: string;
    sourceCommit?: string;
    tags?: string[];
  }): Promise<StoredReview> {
    await this.initialize();

    try {
      
      const reviewId = this.generateReviewId();

      const metadata: ReviewMetadata = {
        id: reviewId,
        title: sourceInfo.title || this.generateDefaultTitle(reviewResult, sourceInfo),
        description: sourceInfo.description,
        timestamp: new Date().toISOString(),
        source: sourceInfo.source,
        sourcePath: sourceInfo.sourcePath,
        sourceCommit: sourceInfo.sourceCommit,
        model: reviewResult.model,
        processingTime: reviewResult.processingTime,
        tokenUsage: {
          input: reviewResult.usage.inputTokens,
          output: reviewResult.usage.outputTokens,
          total: reviewResult.usage.totalTokens,
        },
        reviewType: 'issues' in reviewResult.review ? 'code' : 'commit',
        severity: 'severity' in reviewResult.review ? reviewResult.review.severity : undefined,
        issueCount: 'issues' in reviewResult.review ? reviewResult.review.issues.length : undefined,
        tags: sourceInfo.tags || [],
        version: '1.0',
      };

      const storedReview: StoredReview = {
        metadata,
        review: {
          type: metadata.reviewType,
          data: reviewResult.review,
        },
        rawResponse: reviewResult.rawResponse,
        storage: {
          path: '',
          size: 0,
          checksum: '',
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
        },
      };

      StoredReviewSchema.parse(storedReview);

      const filePath = path.join(this.storagePath, `${reviewId}.json`);
      const content = JSON.stringify(storedReview, null, 2);

      fs.writeFileSync(filePath, content, 'utf8');

      storedReview.storage.path = filePath;
      storedReview.storage.size = Buffer.byteLength(content, 'utf8');
      storedReview.storage.checksum = this.calculateChecksum(content);

      fs.writeFileSync(filePath, JSON.stringify(storedReview, null, 2), 'utf8');

      await this.updateIndex(reviewId, metadata);

      logger.info('Review stored successfully', {
        reviewId,
        title: metadata.title,
        source: metadata.source,
        model: metadata.model,
      });

      return storedReview;
    } catch (error) {
      logger.error('Failed to store review', {
        error: error instanceof Error ? error.message : String(error),
        source: sourceInfo.source,
      });
      throw error;
    }
  }

  async getReview(reviewId: string): Promise<StoredReview | null> {
    await this.initialize();

    try {
      const filePath = path.join(this.storagePath, `${reviewId}.json`);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const storedReview = JSON.parse(content);

      return StoredReviewSchema.parse(storedReview);
    } catch (error) {
      logger.error('Failed to retrieve review', {
        reviewId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async searchReviews(options: ReviewSearchOptions = {}): Promise<StoredReview[]> {
    await this.initialize();

    try {
      const index = this.readIndexFile();
      const results: StoredReview[] = [];

      for (const reviewId of Object.keys(index.reviews)) {
        const metadata = index.reviews[reviewId];

        if (!this.matchesFilters(metadata, options)) {
          continue;
        }

        const review = await this.getReview(reviewId);
        if (review) {
          results.push(review);
        }
      }

      results.sort((a, b) => this.compareReviews(a, b, options));

      const offset = options.offset || 0;
      const limit = options.limit || results.length;
      return results.slice(offset, offset + limit);
    } catch (error) {
      logger.error('Failed to search reviews', {
        error: error instanceof Error ? error.message : String(error),
        options,
      });
      return [];
    }
  }

  async getStats(): Promise<ReviewStorageStats> {
    await this.initialize();

    try {
      const index = this.readIndexFile();
      const reviews = Object.values(index.reviews) as ReviewMetadata[];

      const stats: ReviewStorageStats = {
        totalReviews: reviews.length,
        totalSize: 0,
        reviewsByType: {},
        reviewsByModel: {},
        reviewsBySeverity: {},
        dateRange: {
          oldest: null,
          newest: null,
        },
        averageProcessingTime: 0,
        averageTokenUsage: 0,
      };

      let totalProcessingTime = 0;
      let totalTokenUsage = 0;

      for (const review of reviews) {
        
        stats.reviewsByType[review.reviewType] = (stats.reviewsByType[review.reviewType] || 0) + 1;

        stats.reviewsByModel[review.model] = (stats.reviewsByModel[review.model] || 0) + 1;

        if (review.severity) {
          stats.reviewsBySeverity[review.severity] = (stats.reviewsBySeverity[review.severity] || 0) + 1;
        }

        if (!stats.dateRange.oldest || review.timestamp < stats.dateRange.oldest) {
          stats.dateRange.oldest = review.timestamp;
        }
        if (!stats.dateRange.newest || review.timestamp > stats.dateRange.newest) {
          stats.dateRange.newest = review.timestamp;
        }

        totalProcessingTime += review.processingTime;
        totalTokenUsage += review.tokenUsage.total;

        const filePath = path.join(this.storagePath, `${review.id}.json`);
        if (fs.existsSync(filePath)) {
          stats.totalSize += fs.statSync(filePath).size;
        }
      }

      if (reviews.length > 0) {
        stats.averageProcessingTime = totalProcessingTime / reviews.length;
        stats.averageTokenUsage = totalTokenUsage / reviews.length;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get storage statistics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteReview(reviewId: string): Promise<boolean> {
    await this.initialize();

    try {
      const filePath = path.join(this.storagePath, `${reviewId}.json`);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      const index = this.readIndexFile();
      delete index.reviews[reviewId];
      index.lastUpdated = new Date().toISOString();
      this.writeIndexFile(index);

      logger.info('Review deleted successfully', { reviewId });
      return true;
    } catch (error) {
      logger.error('Failed to delete review', {
        reviewId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async exportReviews(targetDir: string, options: ReviewSearchOptions = {}): Promise<string> {
    await this.initialize();

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const searchOptions = { ...options };
      delete searchOptions.limit; 
      const reviews = await this.searchReviews(searchOptions);
      const exportData = {
        exportInfo: {
          timestamp: new Date().toISOString(),
          totalReviews: reviews.length,
          filters: options,
        },
        reviews: reviews.map(review => ({
          ...review,
          storage: undefined, 
        })),
      };

      const exportPath = path.join(targetDir, `review-export-${Date.now()}.json`);
      fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2), 'utf8');

      logger.info('Reviews exported successfully', {
        exportPath,
        reviewCount: reviews.length,
      });

      return exportPath;
    } catch (error) {
      logger.error('Failed to export reviews', {
        targetDir,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private generateReviewId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `review_${timestamp}_${random}`;
  }

  private generateDefaultTitle(reviewResult: CloudReviewResult, sourceInfo: any): string {
    const reviewType = 'issues' in reviewResult.review ? 'Code' : 'Commit';
    const source = sourceInfo.source;

    switch (source) {
      case 'file':
        return `${reviewType} Review: ${sourceInfo.sourcePath || 'Unknown File'}`;
      case 'commit':
        return `${reviewType} Review: ${sourceInfo.sourceCommit?.substring(0, 8) || 'Unknown Commit'}`;
      case 'repository':
        return `${reviewType} Review: Repository Analysis`;
      default:
        return `${reviewType} Review`;
    }
  }

  private calculateChecksum(content: string): string {
    
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; 
    }
    return Math.abs(hash).toString(16);
  }

  private readIndexFile(): any {
    try {
      const content = fs.readFileSync(this.indexPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Failed to read index file, creating new one', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        reviews: {},
      };
    }
  }

  private writeIndexFile(index: any): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf8');
  }

  private async updateIndex(reviewId: string, metadata: ReviewMetadata): Promise<void> {
    const index = this.readIndexFile();
    index.reviews[reviewId] = metadata;
    index.lastUpdated = new Date().toISOString();
    this.writeIndexFile(index);
  }

  private matchesFilters(metadata: ReviewMetadata, options: ReviewSearchOptions): boolean {
    if (options.source && metadata.source !== options.source) {
      return false;
    }

    if (options.sourcePath && metadata.sourcePath !== options.sourcePath) {
      return false;
    }

    if (options.sourceCommit && metadata.sourceCommit !== options.sourceCommit) {
      return false;
    }

    if (options.model && metadata.model !== options.model) {
      return false;
    }

    if (options.reviewType && metadata.reviewType !== options.reviewType) {
      return false;
    }

    if (options.severity && metadata.severity !== options.severity) {
      return false;
    }

    if (options.tags && options.tags.length > 0) {
      const hasMatchingTag = options.tags.some(tag =>
        metadata.tags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    if (options.dateFrom && new Date(metadata.timestamp) < options.dateFrom) {
      return false;
    }

    if (options.dateTo && new Date(metadata.timestamp) > options.dateTo) {
      return false;
    }

    return true;
  }

  private compareReviews(a: StoredReview, b: StoredReview, options: ReviewSearchOptions): number {
    const sortBy = options.sortBy || 'timestamp';
    const sortOrder = options.sortOrder || 'desc';

    let comparison = 0;

    switch (sortBy) {
      case 'timestamp':
        comparison = new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime();
        break;
      case 'processingTime':
        comparison = a.metadata.processingTime - b.metadata.processingTime;
        break;
      case 'issueCount':
        const aCount = a.metadata.issueCount || 0;
        const bCount = b.metadata.issueCount || 0;
        comparison = aCount - bCount;
        break;
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  }
}
