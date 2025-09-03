import { z } from 'zod';

export interface PromptOptions {
  
  guidelines?: string;
  systemPrompt?: string;

  tokenBudget: number;
  tokenAllocations?: {
    preamble?: number;      
    context?: number;       
    diffs?: number;         
    insights?: number;      
    instructions?: number;  
  };

  commitRange?: {
    from: string;
    to: string;
  };
  includeDiffs?: boolean;
  includeInsights?: boolean;

  responseFormat?: 'json' | 'markdown' | 'text';
  jsonSchema?: Record<string, any>;
  maxIssues?: number;

  repositoryInfo?: {
    name: string;
    branch: string;
    language: string;
  };
  customContext?: Record<string, any>;
}

export interface PromptSection {
  preamble: string;
  context: string;
  diffs: string;
  insights: string;
  instructions: string;
}

export interface ComposedPrompt {
  text: string;
  tokenCount: number;
  sections: PromptSection;
  metadata: {
    truncated: boolean;
    originalTokenCount: number | undefined;
    budgetUsed: number;
    budgetRemaining: number;
    timestamp: string;
    allocations: PromptOptions['tokenAllocations'];
  };
}

export interface PromptCompositionResult {
  success: boolean;
  prompt?: ComposedPrompt;
  errors?: Array<{
    type: 'token_budget_exceeded' | 'invalid_input' | 'composition_failed';
    message: string;
    details?: any;
  }>;
  warnings?: Array<{
    type: 'truncated_content' | 'missing_context' | 'low_budget';
    message: string;
  }>;
}

export interface TokenBudget {
  total: number;
  allocated: {
    preamble: number;
    context: number;
    diffs: number;
    insights: number;
    instructions: number;
  };
  remaining: number;
}

export interface TokenEstimation {
  text: string;
  tokenCount: number;
  method: 'tiktoken' | 'approximation';
  model?: string;
}

export interface ContextSummary {
  originalChunks: number;
  summarizedChunks: number;
  totalTokens: number;
  summary: string;
  keyFunctions: string[];
  keyClasses: string[];
  patterns: string[];
  dependencies: string[];
}

export interface DiffSummary {
  commits: number;
  filesChanged: number;
  additions: number;
  deletions: number;
  summary: string;
  keyChanges: Array<{
    file: string;
    type: 'added' | 'modified' | 'deleted';
    description: string;
  }>;
}

export interface InsightsSummary {
  totalInsights: number;
  categories: Record<string, number>;
  severities: Record<string, number>;
  summary: string;
  keyIssues: Array<{
    category: string;
    severity: string;
    summary: string;
  }>;
}

export const TokenAllocationsSchema = z.object({
  preamble: z.number().min(0).max(1).optional(),
  context: z.number().min(0).max(1).optional(),
  diffs: z.number().min(0).max(1).optional(),
  insights: z.number().min(0).max(1).optional(),
  instructions: z.number().min(0).max(1).optional(),
}).optional();

export const PromptOptionsSchema = z.object({
  guidelines: z.string().optional(),
  systemPrompt: z.string().optional(),
  tokenBudget: z.number().int().min(1000).max(100000),
  tokenAllocations: TokenAllocationsSchema,
  commitRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
  includeDiffs: z.boolean().default(true),
  includeInsights: z.boolean().default(true),
  responseFormat: z.enum(['json', 'markdown', 'text']).default('json'),
  jsonSchema: z.record(z.any()).optional(),
  maxIssues: z.number().int().min(1).max(100).optional(),
  repositoryInfo: z.object({
    name: z.string(),
    branch: z.string(),
    language: z.string(),
  }).optional(),
  customContext: z.record(z.any()).optional(),
});

export const PromptSectionSchema = z.object({
  preamble: z.string(),
  context: z.string(),
  diffs: z.string(),
  insights: z.string(),
  instructions: z.string(),
});

export const ComposedPromptSchema = z.object({
  text: z.string(),
  tokenCount: z.number().int().min(0),
  sections: PromptSectionSchema,
  metadata: z.object({
    truncated: z.boolean(),
    originalTokenCount: z.number().int().min(0).optional(),
    budgetUsed: z.number().int().min(0),
    budgetRemaining: z.number().int().min(0),
    timestamp: z.string().datetime(),
    allocations: TokenAllocationsSchema,
  }),
});

export const PromptCompositionResultSchema = z.object({
  success: z.boolean(),
  prompt: ComposedPromptSchema.optional(),
  errors: z.array(z.object({
    type: z.enum(['token_budget_exceeded', 'invalid_input', 'composition_failed']),
    message: z.string(),
    details: z.any().optional(),
  })).optional(),
  warnings: z.array(z.object({
    type: z.enum(['truncated_content', 'missing_context', 'low_budget']),
    message: z.string(),
  })).optional(),
});

export function validatePromptOptions(options: any): PromptOptions {
  return PromptOptionsSchema.parse(options) as PromptOptions;
}

export function validateComposedPrompt(prompt: any): ComposedPrompt {
  return ComposedPromptSchema.parse(prompt) as ComposedPrompt;
}

export function validatePromptCompositionResult(result: any): PromptCompositionResult {
  return PromptCompositionResultSchema.parse(result) as PromptCompositionResult;
}

export function isComposedPrompt(obj: any): obj is ComposedPrompt {
  return obj &&
         typeof obj.text === 'string' &&
         typeof obj.tokenCount === 'number' &&
         obj.sections &&
         obj.metadata;
}

export function isPromptCompositionResult(obj: any): obj is PromptCompositionResult {
  return obj &&
         typeof obj.success === 'boolean' &&
         (obj.prompt === undefined || isComposedPrompt(obj.prompt));
}

export const DefaultTokenAllocations: PromptOptions['tokenAllocations'] = {
  preamble: 0.10,      
  context: 0.60,       
  diffs: 0.20,         
  insights: 0.10,      
  instructions: 0.10,  
};

export const DefaultPromptOptions: Partial<PromptOptions> = {
  tokenBudget: 8000,
  tokenAllocations: DefaultTokenAllocations,
  includeDiffs: true,
  includeInsights: true,
  responseFormat: 'json',
  maxIssues: 10,
};
