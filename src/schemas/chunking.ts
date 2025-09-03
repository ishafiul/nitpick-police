import { z } from 'zod';

export {
  CodeChunkSchema,
  ChunkingOptionsSchema,
  ChunkingConfigSchema,
  ChunkingResultSchema,
  validateCodeChunk,
  validateChunkingOptions,
  validateChunkingConfig,
  validateChunkingResult,
} from '../types/chunking';

export const LanguageChunkingConfigSchema = z.object({
  javascript: z.object({
    chunkSize: z.number().int().min(1).default(100),
    overlapLines: z.number().int().min(0).default(5),
    useAst: z.boolean().default(true),
    fallbackToLines: z.boolean().default(true),
    maxAstDepth: z.number().int().min(1).default(10),
    includeComments: z.boolean().default(true),
    preserveContext: z.boolean().default(true),
  }).default({
    chunkSize: 100,
    overlapLines: 5,
    useAst: true,
    fallbackToLines: true,
    maxAstDepth: 10,
    includeComments: true,
    preserveContext: true,
  }),

  typescript: z.object({
    chunkSize: z.number().int().min(1).default(100),
    overlapLines: z.number().int().min(0).default(5),
    useAst: z.boolean().default(true),
    fallbackToLines: z.boolean().default(true),
    maxAstDepth: z.number().int().min(1).default(10),
    includeComments: z.boolean().default(true),
    preserveContext: z.boolean().default(true),
  }).default({
    chunkSize: 100,
    overlapLines: 5,
    useAst: true,
    fallbackToLines: true,
    maxAstDepth: 10,
    includeComments: true,
    preserveContext: true,
  }),

  dart: z.object({
    chunkSize: z.number().int().min(1).default(80),
    overlapLines: z.number().int().min(0).default(3),
    respectBoundaries: z.boolean().default(true),
    includeComments: z.boolean().default(true),
    preserveContext: z.boolean().default(true),
    minFunctionSize: z.number().int().min(1).default(5),
  }).default({
    chunkSize: 80,
    overlapLines: 3,
    respectBoundaries: true,
    includeComments: true,
    preserveContext: true,
    minFunctionSize: 5,
  }),

  python: z.object({
    chunkSize: z.number().int().min(1).default(120),
    overlapLines: z.number().int().min(0).default(6),
    includeComments: z.boolean().default(true),
    preserveContext: z.boolean().default(true),
    respectIndentation: z.boolean().default(true),
  }).default({
    chunkSize: 120,
    overlapLines: 6,
    includeComments: true,
    preserveContext: true,
    respectIndentation: true,
  }),

  go: z.object({
    chunkSize: z.number().int().min(1).default(100),
    overlapLines: z.number().int().min(0).default(5),
    includeComments: z.boolean().default(true),
    preserveContext: z.boolean().default(true),
  }).default({
    chunkSize: 100,
    overlapLines: 5,
    includeComments: true,
    preserveContext: true,
  }),

  rust: z.object({
    chunkSize: z.number().int().min(1).default(100),
    overlapLines: z.number().int().min(0).default(5),
    includeComments: z.boolean().default(true),
    preserveContext: z.boolean().default(true),
  }).default({
    chunkSize: 100,
    overlapLines: 5,
    includeComments: true,
    preserveContext: true,
  }),
});

export const DartChunkingConfigSchema = z.object({
  chunkSize: z.number().int().min(1).default(80),
  overlapLines: z.number().int().min(0).default(3),
  respectBoundaries: z.boolean().default(true),
  includeComments: z.boolean().default(true),
  preserveContext: z.boolean().default(true),
  minFunctionSize: z.number().int().min(1).default(5),
});

export const TypeScriptChunkingConfigSchema = z.object({
  chunkSize: z.number().int().min(1).default(100),
  overlapLines: z.number().int().min(0).default(5),
  useAst: z.boolean().default(true),
  fallbackToLines: z.boolean().default(true),
  maxAstDepth: z.number().int().min(1).default(10),
  includeComments: z.boolean().default(true),
  preserveContext: z.boolean().default(true),
});

export const LineBasedChunkingConfigSchema = z.object({
  chunkSize: z.number().int().min(1).default(100),
  overlapLines: z.number().int().min(0).default(5),
  includeComments: z.boolean().default(true),
  preserveContext: z.boolean().default(true),
  minChunkSize: z.number().int().min(1).default(10),
  maxOverlapPercentage: z.number().min(0).max(1).default(0.2),
});

export function validateDartChunkingConfig(data: unknown) {
  return DartChunkingConfigSchema.parse(data);
}

export function validateTypeScriptChunkingConfig(data: unknown) {
  return TypeScriptChunkingConfigSchema.parse(data);
}

export function validateLineBasedChunkingConfig(data: unknown) {
  return LineBasedChunkingConfigSchema.parse(data);
}

export function validateLanguageChunkingConfig(data: unknown) {
  return LanguageChunkingConfigSchema.parse(data);
}

export const defaultDartChunkingConfig = DartChunkingConfigSchema.parse({});
export const defaultTypeScriptChunkingConfig = TypeScriptChunkingConfigSchema.parse({});
export const defaultLineBasedChunkingConfig = LineBasedChunkingConfigSchema.parse({});
export const defaultLanguageChunkingConfig = LanguageChunkingConfigSchema.parse({});

