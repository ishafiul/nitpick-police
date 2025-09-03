import {
  RetrievalQuery,
  RetrievalResult,
  RetrievedChunk,
  validateRetrievalQuery,
} from '../types/retrieval';
import { QdrantService } from './qdrant.service';
import { QueryBuilderService } from './query-builder.service';
import { HybridScoringService } from './hybrid-scoring.service';
import { EmbeddingService } from './embedding.service';
import { ConfigManager } from '../config';
import { CodeChunkDocument } from '../types/qdrant';
import logger from '../utils/logger';

export interface RetrievalServiceConfig {
  maxConcurrentSearches: number;
  tokenEstimationBuffer: number; 
  defaultTopK: number;
  defaultMinScore: number;
  enableInsightsIntegration: boolean;
  insightsBoostFactor: number; 
}

export class RetrievalService {
  private qdrantService: QdrantService;
  private queryBuilder: QueryBuilderService;
  private scoringService: HybridScoringService;
  private embeddingService: EmbeddingService;
  private configManager: ConfigManager;
  private serviceConfig: RetrievalServiceConfig;
  private retrievalInitialized: boolean = false;

  constructor(serviceConfig?: Partial<RetrievalServiceConfig>) {
    this.qdrantService = new QdrantService();
    this.queryBuilder = new QueryBuilderService();
    this.scoringService = new HybridScoringService();
    this.embeddingService = new EmbeddingService();
    this.configManager = new ConfigManager();

    this.serviceConfig = {
      maxConcurrentSearches: 5,
      tokenEstimationBuffer: 1.1, 
      defaultTopK: 10,
      defaultMinScore: 0.0,
      enableInsightsIntegration: true,
      insightsBoostFactor: 0.1,
      ...serviceConfig,
    };
  }

  async initialize(): Promise<void> {
    if (this.retrievalInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();
      await this.qdrantService.initialize();
      await this.embeddingService.initialize();

      logger.info('RetrievalService: Initialized successfully');
      this.retrievalInitialized = true;
    } catch (error) {
      logger.error('RetrievalService: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    await this.initialize();

    const startTime = Date.now();

    try {
      const validatedQuery = this.validateAndNormalizeQuery(query);

      logger.info('RetrievalService: Starting retrieval', {
        queryText: validatedQuery.text ? validatedQuery.text.substring(0, 50) + '...' : 'vector-only',
        topK: validatedQuery.topK,
        collection: validatedQuery.collection || 'code_chunks',
      });

      let queryVector: number[];
      if (validatedQuery.text) {
        queryVector = await this.generateQueryEmbedding(validatedQuery.text);
      } else if (validatedQuery.queryVector) {
        queryVector = validatedQuery.queryVector;
      } else {
        throw new Error('Either query text or query vector must be provided');
      }

      const filterResult = this.queryBuilder.buildFilter(validatedQuery);

      logger.debug('RetrievalService: Built filter', {
        appliedFilters: filterResult.appliedFilters.length,
        warnings: filterResult.warnings.length,
      });

      const searchOptions = {
        collection: validatedQuery.collection || 'code_chunks',
        limit: validatedQuery.maxResults || (validatedQuery.topK || 10) * 2, 
        scoreThreshold: validatedQuery.minScore || 0.0,
        filter: filterResult.filter,
        withPayload: !!(validatedQuery.includeMetadata || validatedQuery.includeContent),
      };

      const searchResults = await this.qdrantService.searchCodeChunks(queryVector, searchOptions);

      logger.debug('RetrievalService: Vector search completed', {
        resultsFound: searchResults.length,
        minScore: validatedQuery.minScore,
      });

      if (searchResults.length === 0) {
        return this.createEmptyResult(validatedQuery, filterResult.appliedFilters, startTime);
      }

      const semanticScores = searchResults.map(result => (result as any).score || 0);

      const chunks = this.convertToRetrievedChunks(searchResults, validatedQuery);

      const rankedChunks = this.scoringService.rankChunks(chunks, semanticScores, validatedQuery);

      const topChunks = rankedChunks.slice(0, validatedQuery.topK);

      let insights: RetrievalResult['insights'];
      if (validatedQuery.includeInsights && this.serviceConfig.enableInsightsIntegration) {
        insights = await this.getInsightsForChunks(topChunks);
      }

      const estimatedTokens = this.estimateTokenCount(topChunks);

      const result: RetrievalResult = {
        query: validatedQuery,
        chunks: topChunks,
        totalChunks: topChunks.length,
        processingTime: Date.now() - startTime,
        estimatedTokens,
        appliedFilters: filterResult.appliedFilters.join(', '),
        scoringConfig: validatedQuery.scoring,
        insights: insights || [],
      };

      logger.info('RetrievalService: Retrieval completed', {
        chunksReturned: result.chunks.length,
        estimatedTokens: result.estimatedTokens,
        processingTime: result.processingTime,
        insightsIncluded: !!result.insights,
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('RetrievalService: Retrieval failed', {
        queryText: query.text ? query.text.substring(0, 50) + '...' : 'vector-only',
        processingTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async retrieveFileChunks(
    filePath: string,
    query?: Partial<RetrievalQuery>
  ): Promise<RetrievalResult> {
    const fileQuery: RetrievalQuery = {
      ...query,
      filter: {
        files: [filePath],
        ...query?.filter,
      },
      topK: query?.topK || 50, 
    } as RetrievalQuery;

    return this.retrieve(fileQuery);
  }

  async retrieveLanguageChunks(
    language: string,
    query?: Partial<RetrievalQuery>
  ): Promise<RetrievalResult> {
    const languageQuery: RetrievalQuery = {
      ...query,
      filter: {
        languages: [language],
        ...query?.filter,
      },
    } as RetrievalQuery;

    return this.retrieve(languageQuery);
  }

  async retrieveCommitChunks(
    commitHash: string,
    query?: Partial<RetrievalQuery>
  ): Promise<RetrievalResult> {
    const commitQuery: RetrievalQuery = {
      ...query,
      filter: {
        commit: commitHash,
        ...query?.filter,
      },
    } as RetrievalQuery;

    return this.retrieve(commitQuery);
  }

  async retrieveDirectoryChunks(
    directoryPath: string,
    query?: Partial<RetrievalQuery>
  ): Promise<RetrievalResult> {
    const dirQuery: RetrievalQuery = {
      ...query,
      filter: {
        filePatterns: [directoryPath.endsWith('/') ? directoryPath + '**' : directoryPath + '/**'],
        ...query?.filter,
      },
    } as RetrievalQuery;

    return this.retrieve(dirQuery);
  }

  private validateAndNormalizeQuery(query: RetrievalQuery): RetrievalQuery {
    const validatedQuery = validateRetrievalQuery(query);
    return {
      ...validatedQuery,
      topK: validatedQuery.topK || this.serviceConfig.defaultTopK,
      minScore: validatedQuery.minScore !== undefined ? validatedQuery.minScore : this.serviceConfig.defaultMinScore,
      maxResults: validatedQuery.maxResults || (validatedQuery.topK || 10) * 2,
      collection: validatedQuery.collection || 'code_chunks',
      includeInsights: validatedQuery.includeInsights !== undefined ? validatedQuery.includeInsights : this.serviceConfig.enableInsightsIntegration,
      includeMetadata: validatedQuery.includeMetadata !== undefined ? validatedQuery.includeMetadata : true,
      includeContent: validatedQuery.includeContent !== undefined ? validatedQuery.includeContent : true,
    } as RetrievalQuery;
  }

  private async generateQueryEmbedding(text: string): Promise<number[]> {
    try {
      const result = await this.embeddingService.generateEmbeddingsForChunks([
        {
          id: `query_${Date.now()}`,
          payload: {
            content: text,
            language: 'unknown',
            startLine: 1,
            endLine: 1,
            chunkType: 'statement',
            filePath: 'query',
          },
        } as any,
      ]);

      if (!result.results[0] || !result.results[0].vector) {
        throw new Error('Failed to generate embedding for query text');
      }

      return result.results[0].vector;
    } catch (error) {
      logger.error('RetrievalService: Failed to generate query embedding', {
        textLength: text.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private convertToRetrievedChunks(
    searchResults: CodeChunkDocument[],
    query: RetrievalQuery
  ): RetrievedChunk[] {
    return searchResults.map(result => {
      const payload = result.payload as any;
      const chunk: RetrievedChunk = {
        id: result.id as unknown as string,
        score: (result as any).score || 0,
        semanticScore: 0,
        hybridScore: 0,
        content: query.includeContent ? payload.content || '' : '',
        metadata: {
          file: payload.file || '',
          language: payload.language || 'unknown',
          startLine: payload.startLine || 1,
          endLine: payload.endLine || 1,
          chunkType: payload.chunkType || 'unknown',
          complexityScore: payload.complexityScore,
          dependencies: payload.dependencies,
          imports: payload.imports,
          commit: payload.commit,
          author: payload.author,
          createdAt: payload.createdAt || new Date().toISOString(),
        },
        insights: [],
      };
      return chunk;
    });
  }

  private async getInsightsForChunks(chunks: RetrievedChunk[]): Promise<RetrievalResult['insights']> {
    try {
      const filePaths = [...new Set(chunks.map(chunk => chunk.metadata.file))];
      const insights: RetrievalResult['insights'] = [];

      for (const filePath of filePaths) {
        try {
          const fileChunks = chunks.filter(chunk => chunk.metadata.file === filePath);
          const fileInsights = await this.qdrantService.searchReviewInsights(new Array(768).fill(0), {
            filter: { file: { match: { value: filePath } } },
            limit: 20,
          });

          if (fileInsights.length > 0) {
            const categories: Record<string, number> = {};
            const severities: Record<string, number> = {};

            for (const insight of fileInsights) {
              const payload = insight.payload as any;
              categories[payload.category] = (categories[payload.category] || 0) + 1;
              severities[payload.severity] = (severities[payload.severity] || 0) + 1;
            }

            insights.push({
              file: filePath,
              totalInsights: fileInsights.length,
              categories,
              severities,
            });

            for (const chunk of fileChunks) {
              const relevantInsights = fileInsights
                .filter(insight => {
                  const payload = insight.payload as any;
                  return payload.line >= chunk.metadata.startLine && payload.line <= chunk.metadata.endLine;
                })
                .map(insight => ({
                  category: (insight.payload as any).category,
                  severity: (insight.payload as any).severity,
                  summary: (insight.payload as any).summary,
                  suggestion: ((insight.payload as any).suggestion || undefined) as string | undefined,
                }));

              chunk.insights = relevantInsights.map(insight => ({
                category: insight.category as string,
                severity: insight.severity as string,
                summary: insight.summary,
                suggestion: insight.suggestion,
              }));
            }
          }
        } catch (error) {
          logger.warn('RetrievalService: Failed to get insights for file', {
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return insights;
    } catch (error) {
      logger.warn('RetrievalService: Failed to get insights', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private estimateTokenCount(chunks: RetrievedChunk[]): number {
    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    const estimatedTokens = Math.ceil((totalChars / 4) * this.serviceConfig.tokenEstimationBuffer);

    logger.debug('RetrievalService: Estimated token count', {
      chunks: chunks.length,
      totalChars,
      estimatedTokens,
    });

    return estimatedTokens;
  }

  private createEmptyResult(
    query: RetrievalQuery,
    appliedFilters: string[],
    startTime: number
  ): RetrievalResult {
    return {
      query,
      chunks: [],
      totalChunks: 0,
      processingTime: Date.now() - startTime,
      estimatedTokens: 0,
      appliedFilters: appliedFilters.join(', '),
      scoringConfig: query.scoring,
      insights: [],
    } as RetrievalResult;
  }

  async getStats(): Promise<{
    qdrantHealth: boolean;
    collections: Record<string, { count: number; status: string }>;
    recentQueries: any[]; 
  }> {
    await this.initialize();

    try {
      const health = await this.qdrantService.healthCheck();
      const collections: Record<string, { count: number; status: string }> = {};

      const collectionNames = ['code_chunks', 'review_insights', 'prompts', 'cloud_responses'];

      for (const collectionName of collectionNames) {
        try {
          const stats = await this.qdrantService.getCollectionStats(collectionName);
          collections[collectionName] = {
            count: stats.count,
            status: stats.status,
          };
        } catch (error) {
          collections[collectionName] = {
            count: 0,
            status: 'error',
          };
        }
      }

      return {
        qdrantHealth: health,
        collections,
        recentQueries: [], 
      };
    } catch (error) {
      logger.error('RetrievalService: Failed to get stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  updateConfig(newConfig: Partial<RetrievalServiceConfig>): void {
    this.serviceConfig = {
      ...this.serviceConfig,
      ...newConfig,
    };

    logger.info('RetrievalService: Configuration updated');
  }

  getConfig(): RetrievalServiceConfig {
    return { ...this.serviceConfig };
  }

  isInitialized(): boolean {
    return this.retrievalInitialized;
  }

  async shutdown(): Promise<void> {
    try {
      await this.embeddingService.shutdown();
      logger.info('RetrievalService: Shutdown completed');
    } catch (error) {
      logger.error('RetrievalService: Shutdown failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
