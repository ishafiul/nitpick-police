import { z } from 'zod';
import { ConfigManager } from '../config';
import { CloudReviewResult } from './cloud-review.service';
import { CodeReview, CommitReview } from '../utils/json-extraction';
import { OllamaService } from './ollama-service';
import logger from '../utils/logger';

export const ExtractedInsightSchema = z.object({
  type: z.enum(['issue', 'recommendation', 'pattern', 'improvement', 'security', 'performance', 'maintainability']),
  title: z.string(),
  description: z.string(),
  category: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  lineNumbers: z.array(z.number()).optional(),
  filePath: z.string().optional(),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional(),
});

export type ExtractedInsight = z.infer<typeof ExtractedInsightSchema>;

export const InsightExtractionResultSchema = z.object({
  reviewId: z.string(),
  insights: z.array(ExtractedInsightSchema),
  summary: z.object({
    totalInsights: z.number(),
    byType: z.record(z.number()),
    bySeverity: z.record(z.number()),
    averageConfidence: z.number(),
  }),
  processingTime: z.number(),
  model: z.string(),
});

export type InsightExtractionResult = z.infer<typeof InsightExtractionResultSchema>;

export const InsightExtractionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default('nomic-embed-text'),
  batchSize: z.number().int().positive().default(10),
  minConfidence: z.number().min(0).max(1).default(0.3),
  maxInsights: z.number().int().positive().default(50),
  extractionPrompts: z.object({
    codeReview: z.string(),
    commitReview: z.string(),
  }).default({
    codeReview: `Extract key insights from this code review result. Focus on:
1. Issues and problems identified
2. Recommendations and improvements suggested
3. Patterns or anti-patterns detected
4. Security concerns
5. Performance issues
6. Maintainability concerns

Format your response as a JSON array of insights with the following structure:
[
  {
    "type": "issue|recommendation|pattern|improvement|security|performance|maintainability",
    "title": "Brief title",
    "description": "Detailed description",
    "category": "Optional category",
    "severity": "low|medium|high|critical",
    "lineNumbers": [line numbers if applicable],
    "filePath": "file path if applicable",
    "confidence": 0.0-1.0,
    "tags": ["tag1", "tag2"],
    "metadata": {}
  }
]`,
    commitReview: `Extract key insights from this commit review result. Focus on:
1. Overall impact of the commit
2. Areas of concern or risk
3. Recommendations for improvement
4. Patterns introduced or fixed
5. Security implications
6. Performance considerations

Format your response as a JSON array of insights with the same structure as above.`,
  }),
});

export type InsightExtractionConfig = z.infer<typeof InsightExtractionConfigSchema>;

export const InsightEmbeddingSchema = z.object({
  insightId: z.string(),
  embedding: z.array(z.number()),
  model: z.string(),
  created: z.string().datetime(),
  checksum: z.string(),
});

export type InsightEmbedding = z.infer<typeof InsightEmbeddingSchema>;

export const InsightEmbeddingBatchResultSchema = z.object({
  batchId: z.string(),
  insights: z.array(z.object({
    insightId: z.string(),
    success: z.boolean(),
    embedding: z.array(z.number()).optional(),
    error: z.string().optional(),
  })),
  processingTime: z.number(),
  successCount: z.number(),
  errorCount: z.number(),
});

export type InsightEmbeddingBatchResult = z.infer<typeof InsightEmbeddingBatchResultSchema>;

export class InsightExtractionService {
  private configManager: ConfigManager;
  private ollamaService: OllamaService;
  private config: InsightExtractionConfig;
  private isInitialized: boolean = false;

  constructor() {
    this.configManager = new ConfigManager();
    this.ollamaService = new OllamaService();
    this.config = {
      enabled: true,
      model: 'nomic-embed-text',
      batchSize: 10,
      minConfidence: 0.3,
      maxInsights: 50,
      extractionPrompts: {
        codeReview: `Extract key insights from this code review result...`,
        commitReview: `Extract key insights from this commit review result...`,
      },
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();

      const insightConfig = this.configManager.get('insight_extraction');
      if (insightConfig) {
        this.config = InsightExtractionConfigSchema.parse(insightConfig);
      }

      this.isInitialized = true;
      logger.info('InsightExtractionService initialized successfully', {
        model: this.config.model,
        batchSize: this.config.batchSize,
      });
    } catch (error) {
      logger.error('Failed to initialize InsightExtractionService', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async extractInsights(reviewResult: CloudReviewResult, reviewId: string): Promise<InsightExtractionResult> {
    await this.initialize();

    const startTime = Date.now();

    try {
      logger.debug('Starting insight extraction', {
        reviewId,
        reviewType: 'issues' in reviewResult.review ? 'code' : 'commit',
        model: reviewResult.model,
      });

      let insights: ExtractedInsight[] = [];

      if ('issues' in reviewResult.review) {
        
        insights = await this.extractFromCodeReview(reviewResult.review, reviewResult.rawResponse);
      } else {
        
        insights = await this.extractFromCommitReview(reviewResult.review, reviewResult.rawResponse);
      }

      insights = insights
        .filter(insight => insight.confidence >= this.config.minConfidence)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.config.maxInsights);

      const processingTime = Date.now() - startTime;

      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      let totalConfidence = 0;

      for (const insight of insights) {
        byType[insight.type] = (byType[insight.type] || 0) + 1;
        if (insight.severity) {
          bySeverity[insight.severity] = (bySeverity[insight.severity] || 0) + 1;
        }
        totalConfidence += insight.confidence;
      }

      const averageConfidence = insights.length > 0 ? totalConfidence / insights.length : 0;

      const result: InsightExtractionResult = {
        reviewId,
        insights,
        summary: {
          totalInsights: insights.length,
          byType,
          bySeverity,
          averageConfidence,
        },
        processingTime,
        model: reviewResult.model,
      };

      logger.info('Insight extraction completed', {
        reviewId,
        totalInsights: insights.length,
        averageConfidence: averageConfidence.toFixed(3),
        processingTime,
      });

      return result;
    } catch (error) {
      logger.error('Failed to extract insights', {
        reviewId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async generateEmbeddings(insights: ExtractedInsight[], reviewId: string): Promise<InsightEmbeddingBatchResult> {
    await this.initialize();

    const startTime = Date.now();
    const batchId = `batch_${reviewId}_${Date.now()}`;
    const results: InsightEmbeddingBatchResult['insights'] = [];

    try {
      logger.debug('Starting embedding generation', {
        batchId,
        insightCount: insights.length,
        batchSize: this.config.batchSize,
      });

      for (let i = 0; i < insights.length; i += this.config.batchSize) {
        const batch = insights.slice(i, i + this.config.batchSize);
        const batchResults = await this.processEmbeddingBatch(batch, batchId);
        results.push(...batchResults);
      }

      const successCount = results.filter((r: any) => r.success).length;
      const errorCount = results.filter((r: any) => !r.success).length;
      const processingTime = Date.now() - startTime;

      const batchResult: InsightEmbeddingBatchResult = {
        batchId,
        insights: results,
        processingTime,
        successCount,
        errorCount,
      };

      logger.info('Embedding generation completed', {
        batchId,
        totalProcessed: insights.length,
        successCount,
        errorCount,
        successRate: ((successCount / insights.length) * 100).toFixed(1) + '%',
        processingTime,
      });

      return batchResult;
    } catch (error) {
      logger.error('Failed to generate embeddings', {
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async extractFromCodeReview(review: CodeReview, rawResponse: string): Promise<ExtractedInsight[]> {
    try {
      
      const prompt = `${this.config.extractionPrompts.codeReview}

Code Review Result:
${JSON.stringify(review, null, 2)}

Raw LLM Response:
${rawResponse}

Please extract insights from this code review. Focus on actionable insights that would be valuable for semantic search and retrieval.`;

      const response = await this.ollamaService.generate({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
        },
      });

      const insights = this.parseInsightResponse(response.response);
      return insights;
    } catch (error) {
      logger.warn('Failed to extract insights from code review, returning empty array', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async extractFromCommitReview(review: CommitReview, rawResponse: string): Promise<ExtractedInsight[]> {
    try {
      
      const prompt = `${this.config.extractionPrompts.commitReview}

Commit Review Result:
${JSON.stringify(review, null, 2)}

Raw LLM Response:
${rawResponse}

Please extract insights from this commit review. Focus on the overall impact and implications of the changes.`;

      const response = await this.ollamaService.generate({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
        },
      });

      const insights = this.parseInsightResponse(response.response);
      return insights;
    } catch (error) {
      logger.warn('Failed to extract insights from commit review, returning empty array', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async processEmbeddingBatch(insights: ExtractedInsight[], batchId: string): Promise<InsightEmbeddingBatchResult['insights']> {
    const results: InsightEmbeddingBatchResult['insights'] = [];

    try {
      
      const texts = insights.map(insight =>
        `Type: ${insight.type}\nTitle: ${insight.title}\nDescription: ${insight.description}\n${insight.category ? `Category: ${insight.category}\n` : ''}${insight.severity ? `Severity: ${insight.severity}\n` : ''}Tags: ${insight.tags.join(', ')}`
      );

      const embeddings: number[][] = [];
      for (const text of texts) {
        const embedding = await this.ollamaService.generateEmbedding({
          model: this.config.model,
          prompt: text,
        });
        embeddings.push(embedding.embedding);
      }

      for (let i = 0; i < insights.length; i++) {
        const embedding = embeddings[i];

        if (embedding && embedding.length > 0) {
          results.push({
            insightId: `insight_${batchId}_${i}`,
            success: true,
            embedding,
          });
        } else {
          results.push({
            insightId: `insight_${batchId}_${i}`,
            success: false,
            error: 'Failed to generate embedding',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process embedding batch', {
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });

      for (let i = 0; i < insights.length; i++) {
        results.push({
          insightId: `insight_${batchId}_${i}`,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private parseInsightResponse(response: string): ExtractedInsight[] {
    try {
      
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('No JSON array found in insight response');
        return [];
      }

      const insights = JSON.parse(jsonMatch[0]);

      const validInsights: ExtractedInsight[] = [];
      for (const insight of insights) {
        try {
          const validatedInsight = ExtractedInsightSchema.parse({
            ...insight,
            confidence: insight.confidence || 0.5,
            tags: insight.tags || [],
          });
          validInsights.push(validatedInsight);
        } catch (validationError) {
          logger.warn('Invalid insight format, skipping', {
            insight,
            error: validationError instanceof Error ? validationError.message : String(validationError),
          });
        }
      }

      return validInsights;
    } catch (error) {
      logger.error('Failed to parse insight response', {
        error: error instanceof Error ? error.message : String(error),
        responsePreview: response.substring(0, 200) + '...',
      });
      return [];
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.initialize();
      
      return true;
    } catch (error) {
      return false;
    }
  }

  async getStats(): Promise<{
    isReady: boolean;
    model: string;
    batchSize: number;
    minConfidence: number;
    maxInsights: number;
  }> {
    await this.initialize();

    return {
      isReady: await this.isReady(),
      model: this.config.model,
      batchSize: this.config.batchSize,
      minConfidence: this.config.minConfidence,
      maxInsights: this.config.maxInsights,
    };
  }
}
