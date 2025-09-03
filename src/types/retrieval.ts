import { z } from 'zod';

export interface RetrievalFilter {
  
  files?: string[];
  filePatterns?: string[];
  excludeFiles?: string[];
  excludePatterns?: string[];

  languages?: string[];
  excludeLanguages?: string[];

  chunkTypes?: Array<'function' | 'class' | 'method' | 'block' | 'file' | 'module' | 'statement' | 'expression'>;
  excludeChunkTypes?: Array<'function' | 'class' | 'method' | 'block' | 'file' | 'module' | 'statement' | 'expression'>;

  commitRange?: {
    from: string;
    to: string;
  };
  commit?: string;
  branch?: string;
  author?: string;

  createdAfter?: string;
  createdBefore?: string;

  hasDependencies?: boolean;
  hasImports?: boolean;
  minComplexity?: number;
  maxComplexity?: number;

  custom?: Record<string, any>;
}

export interface RetrievalQuery {
  
  text?: string; 
  queryVector?: number[]; 

  topK?: number;
  minScore?: number;
  maxResults?: number;

  filter?: RetrievalFilter;

  scoring?: {
    semanticWeight?: number; 
    recencyWeight?: number; 
    fileImportanceWeight?: number; 
    customWeights?: Record<string, number>; 
  };

  collection?: string;

  includeInsights?: boolean;

  includeMetadata?: boolean;
  includeContent?: boolean;
  maxTokens?: number;
}

export const RetrievalFilterSchema = z.object({
  files: z.array(z.string()).optional(),
  filePatterns: z.array(z.string()).optional(),
  excludeFiles: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  excludeLanguages: z.array(z.string()).optional(),
  chunkTypes: z.array(z.enum(['function', 'class', 'method', 'block', 'file', 'module', 'statement', 'expression'])).optional(),
  excludeChunkTypes: z.array(z.enum(['function', 'class', 'method', 'block', 'file', 'module', 'statement', 'expression'])).optional(),
  commitRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
  commit: z.string().optional(),
  branch: z.string().optional(),
  author: z.string().optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  hasDependencies: z.boolean().optional(),
  hasImports: z.boolean().optional(),
  minComplexity: z.number().min(0).optional(),
  maxComplexity: z.number().min(0).optional(),
  custom: z.record(z.any()).optional(),
});

export const RetrievalQuerySchema = z.object({
  text: z.string().optional(),
  queryVector: z.array(z.number()).optional(),
  topK: z.number().int().min(1).max(100).default(10),
  minScore: z.number().min(0).max(1).default(0.0),
  maxResults: z.number().int().min(1).max(1000).default(100),
  filter: RetrievalFilterSchema.optional(),
  scoring: z.object({
    semanticWeight: z.number().min(0).max(1).default(0.7),
    recencyWeight: z.number().min(0).max(1).default(0.2),
    fileImportanceWeight: z.number().min(0).max(1).default(0.1),
    customWeights: z.record(z.number()).optional(),
  }).optional(),
  collection: z.string().default('code_chunks'),
  includeInsights: z.boolean().default(true),
  includeMetadata: z.boolean().default(true),
  includeContent: z.boolean().default(true),
  maxTokens: z.number().int().min(1000).max(100000).optional(),
});

export interface RetrievedChunk {
  id: string;
  score: number;
  semanticScore: number;
  hybridScore: number;
  content: string;
  metadata: {
    file: string;
    language: string;
    startLine: number;
    endLine: number;
    chunkType: string;
    complexityScore?: number;
    dependencies?: string[];
    imports?: string[];
    commit?: string;
    author?: string;
    createdAt: string;
  };
  insights?: Array<{
    category: string;
    severity: string;
    summary: string;
    suggestion?: string | undefined;
  }>;
}

export interface RetrievalResult {
  query: RetrievalQuery;
  chunks: RetrievedChunk[];
  totalChunks: number;
  processingTime: number;
  estimatedTokens: number;
  appliedFilters: string;
  scoringConfig: RetrievalQuery['scoring'];
  insights?: Array<{
    file: string;
    totalInsights: number;
    categories: Record<string, number>;
    severities: Record<string, number>;
  }>;
}

export interface RetrievalStats {
  totalQueries: number;
  averageProcessingTime: number;
  averageResults: number;
  filterUsage: Record<string, number>;
  collectionUsage: Record<string, number>;
  errorRate: number;
}

export interface ScoringFactors {
  semanticSimilarity: number; 
  recency: number; 
  fileImportance: number; 
  codeQuality: number; 
  relevance: number; 
  custom: Record<string, number>; 
}

export interface ScoringWeights {
  semanticWeight: number;
  recencyWeight: number;
  fileImportanceWeight: number;
  codeQualityWeight: number;
  relevanceWeight: number;
  customWeights: Record<string, number>;
}

export interface HybridScore {
  totalScore: number;
  factors: ScoringFactors;
  weights: ScoringWeights;
  breakdown: Record<string, number>; 
}

export function validateRetrievalQuery(query: any): RetrievalQuery {
  return RetrievalQuerySchema.parse(query) as RetrievalQuery;
}

export function validateRetrievalFilter(filter: any): RetrievalFilter {
  return RetrievalFilterSchema.parse(filter) as RetrievalFilter;
}

export function isRetrievedChunk(chunk: any): chunk is RetrievedChunk {
  return chunk &&
         typeof chunk.id === 'string' &&
         typeof chunk.score === 'number' &&
         typeof chunk.content === 'string' &&
         chunk.metadata &&
         typeof chunk.metadata.file === 'string';
}

export function isRetrievalResult(result: any): result is RetrievalResult {
  return result &&
         result.query &&
         Array.isArray(result.chunks) &&
         typeof result.totalChunks === 'number' &&
         typeof result.processingTime === 'number';
}

export const DefaultScoringWeights: ScoringWeights = {
  semanticWeight: 0.7,
  recencyWeight: 0.2,
  fileImportanceWeight: 0.1,
  codeQualityWeight: 0.0,
  relevanceWeight: 0.0,
  customWeights: {},
};

export const DefaultRetrievalConfig: Partial<RetrievalQuery> = {
  topK: 10,
  minScore: 0.0,
  maxResults: 100,
  collection: 'code_chunks',
  includeInsights: true,
  includeMetadata: true,
  includeContent: true,
  scoring: DefaultScoringWeights,
};
