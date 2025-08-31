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

export { CommentManager } from './comment-manager';
export type {
  CommentFilter,
  CommentSort,
  CommentSearchParams,
  BulkOperationResult,
  CommentHistory,
  CommentExport,
} from './comment-manager';

export { AnthropicService } from './anthropic-service';
export { ReviewGenerator } from './review-generator';
export type {
  AnthropicOptions,
} from './anthropic-service';
