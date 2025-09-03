// Services module exports
export { OllamaService } from './ollama-service';
export type { 
  OllamaConfig, 
  OllamaModel, 
  OllamaGenerateRequest, 
  OllamaGenerateResponse,
  OllamaEmbeddingRequest,
  OllamaEmbeddingResponse
} from './ollama-service';

export { VectorStore } from './vector-store';
export type {
  VectorDocument,
  SearchResult,
  CollectionInfo,
  SearchParams,
  BatchOperation,
  FallbackStorage,
} from './vector-store';

export { CodeVectorStore } from './code-vector-store';
export type {
  CommitSummaryDocument,
  CodeChunkDocument,
  CommitSearchResult,
  CodeChunkSearchResult,
} from './code-vector-store';




export { AnthropicService } from './anthropic-service';
export { CloudReviewService } from './cloud-review.service';
export { ReviewStorageService } from './review-storage.service';
export { QdrantReviewStorageService } from './qdrant-review-storage.service';
export { InsightExtractionService } from './insight-extraction.service';
export { ReviewGenerator } from './review-generator';
export type {
  AnthropicOptions,
  AnthropicResponse,
} from './anthropic-service';
export type {
  CloudReviewOptions,
  CloudReviewResult,
  BatchReviewOptions,
} from './cloud-review.service';
export type {
  ReviewMetadata,
  StoredReview,
  ReviewSearchOptions as FileReviewSearchOptions,
  ReviewStorageStats,
} from './review-storage.service';
export type {
  ReviewPoint,
  InsightPoint,
  PromptPoint,
  CloudResponsePoint,
  QdrantReviewConfig,
  ReviewSearchOptions as QdrantReviewSearchOptions,
  InsightSearchOptions,
} from './qdrant-review-storage.service';

export { QdrantManager, QdrantCollectionManager } from './qdrant';
export type {
  CollectionSchema,
  Point,
  QdrantSearchResult,
  SearchRequest,
  IndexConfig,
} from './qdrant';
export type {
  ExtractedInsight,
  InsightExtractionResult,
  InsightExtractionConfig,
  InsightEmbedding,
  InsightEmbeddingBatchResult,
} from './insight-extraction.service';

export { EmbeddingService } from './embedding.service';
export { EmbeddingCache } from './embedding-cache';
export { CodeChunkProcessor } from './code-chunk-processor';
export { ChunkingService } from './chunking/chunking-service';
export { FileWalkerService } from './file-walker.service';
export { RepositoryIndexer } from './repository-indexer.service';
export { GitChangeService } from './git/git-change.service';
export { DeltaIndexingService } from './indexing/delta-indexing.service';
export { QdrantService } from './qdrant.service';
export { QueryBuilderService } from './query-builder.service';
export { HybridScoringService } from './hybrid-scoring.service';
export { RetrievalService } from './retrieval.service';

// Prompt Composition Services
export {
  buildPreamble,
  summarizeContext,
  summarizeDiffs,
  formatInsights,
  buildInstructions,
  extractCodePatterns,
  prioritizeChunks,
} from './prompt/section-builders';
export { PromptComposer } from './prompt/composer';
export type {
  EmbeddingResult,
  EmbeddingBatchResult,
  EmbeddingCacheEntry,
  ChunkForEmbedding,
} from './embedding.service';
export type { CacheStats, CacheConfig } from './embedding-cache';
