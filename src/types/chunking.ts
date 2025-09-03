import { z } from 'zod';

export interface CodeChunk {
  id: string;
  content: string;
  language: string;
  startLine: number;
  endLine: number;
  chunkType: 'function' | 'class' | 'method' | 'block' | 'file' | 'module' | 'statement' | 'expression' | 'enum' | 'typedef';
  complexityScore?: number | undefined;
  dependencies?: string[] | undefined;
  metadata?: Record<string, any> | undefined;
  filePath: string;
  embedding?: any;
}

export interface ChunkingOptions {
  maxChunkSize?: number;
  overlapLines?: number;
  includeComments?: boolean;
  preserveContext?: boolean;
  minChunkSize?: number;
  maxOverlapPercentage?: number;
  generateEmbeddings?: boolean;
  storeInQdrant?: boolean;
}

export interface ChunkingStrategy {
  chunk(content: string, filePath: string, options?: ChunkingOptions): Promise<CodeChunk[]>;
  getSupportedLanguages(): string[];
  getStrategyName(): string;
}

export interface ChunkingConfig {
  defaultChunkSize: number;
  defaultOverlapLines: number;
  includeComments: boolean;
  preserveContext: boolean;
  minChunkSize: number;
  maxOverlapPercentage: number;
  languageSpecific: {
    dart: {
      chunkSize: number;
      overlapLines: number;
      respectBoundaries: boolean;
    };
    typescript: {
      useAst: boolean;
      fallbackToLines: boolean;
      maxAstDepth: number;
    };
    javascript: {
      useAst: boolean;
      fallbackToLines: boolean;
      maxAstDepth: number;
    };
  };
}

export interface ChunkingResult {
  chunks: CodeChunk[];
  totalChunks: number;
  totalLines: number;
  processingTime: number;
  strategy: string;
  language: string;
  errors: Array<{ message: string; line?: number; file?: string; error?: string }>;
  embeddingsGenerated?: number;
  storedInQdrant?: number;
}

export const CodeChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  language: z.string(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  chunkType: z.enum(['function', 'class', 'method', 'block', 'file', 'module', 'statement', 'expression', 'enum', 'typedef']),
  complexityScore: z.number().int().min(0).optional(),
  dependencies: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  filePath: z.string(),
  embedding: z.any().optional(),
});

export const ChunkingOptionsSchema = z.object({
  maxChunkSize: z.number().int().min(1).optional(),
  overlapLines: z.number().int().min(0).optional(),
  includeComments: z.boolean().optional(),
  preserveContext: z.boolean().optional(),
  minChunkSize: z.number().int().min(1).optional(),
  maxOverlapPercentage: z.number().min(0).max(1).optional(),
});

export const ChunkingStrategySchema = z.object({
  getSupportedLanguages: z.function().returns(z.array(z.string())),
  getStrategyName: z.function().returns(z.string()),
});

export const ChunkingConfigSchema = z.object({
  defaultChunkSize: z.number().int().min(1).default(100),
  defaultOverlapLines: z.number().int().min(0).default(5),
  includeComments: z.boolean().default(true),
  preserveContext: z.boolean().default(true),
  minChunkSize: z.number().int().min(1).default(10),
  maxOverlapPercentage: z.number().min(0).max(1).default(0.2),
  languageSpecific: z.object({
    dart: z.object({
      chunkSize: z.number().int().min(1).default(80),
      overlapLines: z.number().int().min(0).default(3),
      respectBoundaries: z.boolean().default(true),
    }).default({
      chunkSize: 80,
      overlapLines: 3,
      respectBoundaries: true,
    }),
    typescript: z.object({
      useAst: z.boolean().default(true),
      fallbackToLines: z.boolean().default(true),
      maxAstDepth: z.number().int().min(1).default(10),
    }).default({
      useAst: true,
      fallbackToLines: true,
      maxAstDepth: 10,
    }),
    javascript: z.object({
      useAst: z.boolean().default(true),
      fallbackToLines: z.boolean().default(true),
      maxAstDepth: z.number().int().min(1).default(10),
    }).default({
      useAst: true,
      fallbackToLines: true,
      maxAstDepth: 10,
    }),
  }).default({
    dart: {
      chunkSize: 80,
      overlapLines: 3,
      respectBoundaries: true,
    },
    typescript: {
      useAst: true,
      fallbackToLines: true,
      maxAstDepth: 10,
    },
    javascript: {
      useAst: true,
      fallbackToLines: true,
      maxAstDepth: 10,
    },
  }),
});

export const ChunkingResultSchema = z.object({
  chunks: z.array(CodeChunkSchema),
  totalChunks: z.number().int().min(0),
  totalLines: z.number().int().min(0),
  processingTime: z.number().int().min(0),
  strategy: z.string(),
  language: z.string(),
  errors: z.array(z.object({
    message: z.string(),
    line: z.number().int().min(1).optional(),
  })),
});

export function validateCodeChunk(data: unknown): CodeChunk {
  return CodeChunkSchema.parse(data);
}

export function validateChunkingOptions(data: unknown): Required<ChunkingOptions> {
  return ChunkingOptionsSchema.parse(data) as Required<ChunkingOptions>;
}

export function validateChunkingConfig(data: unknown): ChunkingConfig {
  return ChunkingConfigSchema.parse(data);
}

export function validateChunkingResult(data: unknown): ChunkingResult {
  return ChunkingResultSchema.parse(data) as ChunkingResult;
}

export function calculateChunkId(filePath: string, startLine: number, endLine: number): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return `${normalizedPath}:${startLine}-${endLine}`;
}

export function calculateContentHash(content: string): string {
  
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; 
  }
  return Math.abs(hash).toString(36);
}

export function detectLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'dart':
      return 'dart';
    case 'py':
      return 'python';
    case 'java':
      return 'java';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'c++':
      return 'cpp';
    case 'c':
      return 'c';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'php':
      return 'php';
    case 'rb':
      return 'ruby';
    case 'cs':
      return 'csharp';
    case 'swift':
      return 'swift';
    case 'kt':
      return 'kotlin';
    case 'scala':
      return 'scala';
    default:
      return 'unknown';
  }
}
