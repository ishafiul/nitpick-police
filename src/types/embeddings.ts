import { z } from 'zod';

export const EmbeddingResultSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  sha256: z.string(),
  model: z.string(),
  generatedAt: z.string().datetime(),
  error: z.string().optional(),
});

export const EmbeddingBatchResultSchema = z.object({
  results: z.array(EmbeddingResultSchema),
  totalProcessed: z.number().int().min(0),
  errors: z.array(z.object({
    id: z.string(),
    error: z.string(),
  })),
  duration: z.number().int().min(0),
});

export const EmbeddingCacheEntrySchema = z.object({
  sha256: z.string(),
  vector: z.array(z.number()),
  model: z.string(),
  generatedAt: z.string().datetime(),
  accessCount: z.number().int().min(0),
  lastAccessed: z.string().datetime(),
});

export const CacheStatsSchema = z.object({
  totalEntries: z.number().int().min(0),
  totalAccessCount: z.number().int().min(0),
  averageAccessCount: z.number(),
  cacheSizeBytes: z.number().int().min(0),
  oldestEntry: z.string().datetime().nullable(),
  newestEntry: z.string().datetime().nullable(),
  hitRate: z.number().min(0).max(1),
  totalRequests: z.number().int().min(0),
  totalHits: z.number().int().min(0),
});

export const CacheConfigSchema = z.object({
  maxSize: z.number().int().min(1),
  maxSizeBytes: z.number().int().min(1),
  ttlMs: z.number().int().min(1),
  cleanupIntervalMs: z.number().int().min(1),
  persistencePath: z.string().optional(),
});

export const EmbeddingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default('nomic-embed-text:v1.5'),
  batchSize: z.number().int().min(1).max(100).default(10),
  timeout: z.number().int().min(1000).default(30000),
  retries: z.number().int().min(0).max(10).default(3),
  cache: CacheConfigSchema.default({
    maxSize: 10000,
    maxSizeBytes: 100 * 1024 * 1024, 
    ttlMs: 7 * 24 * 60 * 60 * 1000, 
    cleanupIntervalMs: 60 * 60 * 1000, 
  }),
});

export const EmbeddingMetadataSchema = z.object({
  id: z.string(),
  chunkId: z.string(),
  sha256: z.string(),
  model: z.string(),
  dimension: z.number().int().min(1),
  generatedAt: z.string().datetime(),
  lastUsed: z.string().datetime().optional(),
  usageCount: z.number().int().min(0).default(0),
  filePath: z.string(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  language: z.string(),
});

export const BatchEmbeddingRequestSchema = z.object({
  chunks: z.array(z.object({
    id: z.string(),
    file: z.string(),
    language: z.string(),
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(1),
    content: z.string().optional(), 
  })),
  options: z.object({
    useCache: z.boolean().default(true),
    batchSize: z.number().int().min(1).max(100).default(10),
    skipErrors: z.boolean().default(false),
  }).optional(),
});

export type EmbeddingResult = z.infer<typeof EmbeddingResultSchema>;
export type EmbeddingBatchResult = z.infer<typeof EmbeddingBatchResultSchema>;
export type EmbeddingCacheEntry = z.infer<typeof EmbeddingCacheEntrySchema>;
export type CacheStats = z.infer<typeof CacheStatsSchema>;
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;
export type EmbeddingMetadata = z.infer<typeof EmbeddingMetadataSchema>;
export type BatchEmbeddingRequest = z.infer<typeof BatchEmbeddingRequestSchema>;

export function validateEmbeddingResult(data: unknown): EmbeddingResult {
  return EmbeddingResultSchema.parse(data);
}

export function validateEmbeddingBatchResult(data: unknown): EmbeddingBatchResult {
  return EmbeddingBatchResultSchema.parse(data);
}

export function validateEmbeddingCacheEntry(data: unknown): EmbeddingCacheEntry {
  return EmbeddingCacheEntrySchema.parse(data);
}

export function validateCacheStats(data: unknown): CacheStats {
  return CacheStatsSchema.parse(data);
}

export function validateEmbeddingConfig(data: unknown): EmbeddingConfig {
  return EmbeddingConfigSchema.parse(data);
}

export function validateEmbeddingMetadata(data: unknown): EmbeddingMetadata {
  return EmbeddingMetadataSchema.parse(data);
}

export function validateBatchEmbeddingRequest(data: unknown): BatchEmbeddingRequest {
  return BatchEmbeddingRequestSchema.parse(data);
}

