import { z } from 'zod';

export interface CodeChunkPayload {
  id: string;
  file: string;
  language: string;
  startLine: number;
  endLine: number;
  commit: string;
  sha256: string;
  createdAt: string;
  
  repository?: string;
  branch?: string;
  author?: string;
  chunkType?: 'function' | 'class' | 'method' | 'block' | 'file' | 'other';
  dependencies?: string[];
  imports?: string[];
}

export const CodeChunkPayloadSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  language: z.enum(['typescript', 'javascript', 'dart', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'php', 'ruby', 'other']),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  commit: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  repository: z.string().optional(),
  branch: z.string().optional(),
  author: z.string().optional(),
  chunkType: z.enum(['function', 'class', 'method', 'block', 'file', 'other']).optional(),
  dependencies: z.array(z.string()).optional(),
  imports: z.array(z.string()).optional(),
}).refine(data => data.endLine >= data.startLine, {
  message: "endLine must be greater than or equal to startLine",
  path: ["endLine"]
});

export interface CodeChunkDocument {
  id: string;
  vector: number[];
  payload: CodeChunkPayload;
}

export interface ReviewInsightPayload {
  id: string;
  file: string;
  line: number;
  category: 'security' | 'performance' | 'style' | 'bug' | 'complexity' | 'documentation' | 'maintainability';
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  suggestion?: string;
  source: 'local' | 'cloud' | 'manual';
  reviewId?: string;
  createdAt: string;
  
  rule?: string;
  confidence?: number;
  tags?: string[];
  contextLines?: string[];
  relatedFiles?: string[];
}

export const ReviewInsightPayloadSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().min(1),
  category: z.enum(['security', 'performance', 'style', 'bug', 'complexity', 'documentation', 'maintainability']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  summary: z.string().min(1),
  suggestion: z.string().optional(),
  source: z.enum(['local', 'cloud', 'manual']),
  reviewId: z.string().optional(),
  createdAt: z.string().datetime(),
  rule: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  contextLines: z.array(z.string()).optional(),
  relatedFiles: z.array(z.string()).optional(),
});

export interface ReviewInsightDocument {
  id: string;
  vector?: number[]; 
  payload: ReviewInsightPayload;
}

export interface PromptScope {
  type: 'file' | 'commit' | 'directory' | 'pr' | 'all';
  path?: string;
  commitRange?: string;
  files?: string[];
}

export interface PromptPayload {
  id: string;
  scope: PromptScope;
  promptText: string;
  topK: number;
  tokenBudget: number;
  createdAt: string;
  
  retrievedChunksCount?: number;
  totalTokens?: number;
  embeddingModel?: string;
  localModel?: string;
  cloudModel?: string;
  contextFiles?: string[];
  gitCommit?: string;
}

export const PromptScopeSchema = z.object({
  type: z.enum(['file', 'commit', 'directory', 'pr', 'all']),
  path: z.string().optional(),
  commitRange: z.string().optional(),
  files: z.array(z.string()).optional(),
});

export const PromptPayloadSchema = z.object({
  id: z.string().min(1),
  scope: PromptScopeSchema,
  promptText: z.string().min(1),
  topK: z.number().int().min(1).max(100),
  tokenBudget: z.number().int().min(1000).max(100000),
  createdAt: z.string().datetime(),
  retrievedChunksCount: z.number().int().min(0).optional(),
  totalTokens: z.number().int().min(0).optional(),
  embeddingModel: z.string().optional(),
  localModel: z.string().optional(),
  cloudModel: z.string().optional(),
  contextFiles: z.array(z.string()).optional(),
  gitCommit: z.string().optional(),
});

export interface PromptDocument {
  id: string;
  
  payload: PromptPayload;
}

export interface CloudResponseIssue {
  file: string;
  line: number;
  category: string;
  severity: string;
  comment: string;
  suggestion?: string;
}

export interface CloudResponsePayload {
  id: string;
  promptId: string;
  model: string;
  rawText: string;
  json: any; 
  issuesCount: number;
  suggestionsCount: number;
  createdAt: string;
  
  processingTimeMs?: number;
  tokensUsed?: number;
  cost?: number;
  issues?: CloudResponseIssue[];
  summary?: string;
  status: 'success' | 'partial' | 'error';
  errorMessage?: string;
}

export const CloudResponseIssueSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  category: z.string().min(1),
  severity: z.string().min(1),
  comment: z.string().min(1),
  suggestion: z.string().optional(),
});

export const CloudResponsePayloadSchema = z.object({
  id: z.string().min(1),
  promptId: z.string().min(1),
  model: z.string().min(1),
  rawText: z.string(),
  json: z.any(),
  issuesCount: z.number().int().min(0),
  suggestionsCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  processingTimeMs: z.number().int().min(0).optional(),
  tokensUsed: z.number().int().min(0).optional(),
  cost: z.number().min(0).optional(),
  issues: z.array(CloudResponseIssueSchema).optional(),
  summary: z.string().optional(),
  status: z.enum(['success', 'partial', 'error']),
  errorMessage: z.string().optional(),
});

export interface CloudResponseDocument {
  id: string;
  
  payload: CloudResponsePayload;
}

export interface QdrantCollectionConfig {
  name: string;
  vectorConfig?: {
    size: number;
    distance: 'cosine' | 'euclidean' | 'dot';
  };
  optimizersConfig?: {
    defaultSegmentNumber?: number;
    indexingThreshold?: number;
    memmapThreshold?: number;
  };
  payloadSchema?: Record<string, any>;
}

export const CodeChunksCollectionConfig: QdrantCollectionConfig = {
  name: 'code_chunks',
  vectorConfig: {
    size: 768, 
    distance: 'cosine',
  },
  optimizersConfig: {
    defaultSegmentNumber: 4,
    indexingThreshold: 10000,
    memmapThreshold: 1000000,
  },
};

export const ReviewInsightsCollectionConfig: QdrantCollectionConfig = {
  name: 'review_insights',
  
  vectorConfig: {
    size: 768,
    distance: 'cosine',
  },
  optimizersConfig: {
    defaultSegmentNumber: 2,
    indexingThreshold: 5000,
  },
};

export const PromptsCollectionConfig: QdrantCollectionConfig = {
  name: 'prompts',
  
  optimizersConfig: {
    defaultSegmentNumber: 1,
    indexingThreshold: 1000,
  },
};

export const CloudResponsesCollectionConfig: QdrantCollectionConfig = {
  name: 'cloud_responses',
  
  optimizersConfig: {
    defaultSegmentNumber: 1,
    indexingThreshold: 1000,
  },
};

export function validateCodeChunkPayload(payload: any): CodeChunkPayload {
  return CodeChunkPayloadSchema.parse(payload) as CodeChunkPayload;
}

export function validateReviewInsightPayload(payload: any): ReviewInsightPayload {
  return ReviewInsightPayloadSchema.parse(payload) as ReviewInsightPayload;
}

export function validatePromptPayload(payload: any): PromptPayload {
  return PromptPayloadSchema.parse(payload) as PromptPayload;
}

export function validateCloudResponsePayload(payload: any): CloudResponsePayload {
  return CloudResponsePayloadSchema.parse(payload) as CloudResponsePayload;
}

export function isCodeChunkDocument(doc: any): doc is CodeChunkDocument {
  return doc && typeof doc.id === 'string' && Array.isArray(doc.vector) && doc.payload;
}

export function isReviewInsightDocument(doc: any): doc is ReviewInsightDocument {
  return doc && typeof doc.id === 'string' && doc.payload && typeof doc.payload.category === 'string';
}

export function isPromptDocument(doc: any): doc is PromptDocument {
  return doc && typeof doc.id === 'string' && doc.payload && typeof doc.payload.promptText === 'string';
}

export function isCloudResponseDocument(doc: any): doc is CloudResponseDocument {
  return doc && typeof doc.id === 'string' && doc.payload && typeof doc.payload.model === 'string';
}
