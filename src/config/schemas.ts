import { z } from 'zod';

// TypeScript interfaces for configuration schemas
export interface QdrantCollections {
  code_chunks: string;
  review_insights: string;
  prompts: string;
  cloud_responses: string;
}

// LLM Configuration Schema
// Local LLM Configuration (Ollama)
export const LocalLLMConfigSchema = z.object({
  provider: z.literal('ollama'),
  model: z.string().min(1).default('llama3.1:8b'),
  embedding_model: z.string().default('nomic-embed-text:v1.5'),
  temperature: z.number().min(0).max(2).default(0.1),
  max_tokens: z.number().min(1).max(8192).default(2048),
  timeout: z.number().min(1000).max(300000).default(30000),
  base_url: z.string().url().default('http://localhost:11434'),
});

// Cloud LLM Configuration (Anthropic)
export const CloudLLMConfigSchema = z.object({
  provider: z.literal('anthropic'),
  model: z.string().min(1).default('claude-3-haiku'),
  temperature: z.number().min(0).max(2).default(0.1),
  max_tokens: z.number().min(1).max(8192).default(4096),
  timeout: z.number().min(1000).max(300000).default(30000),
  api_key: z.string().optional(),
});

// Legacy LLM Configuration (for backward compatibility)
export const LLMConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic', 'claude']).default('ollama'),
  model: z.string().min(1).default('mistral:7b-instruct'),
  temperature: z.number().min(0).max(2).default(0.1),
  max_tokens: z.number().min(1).max(8192).default(2048),
  timeout: z.number().min(1000).max(300000).default(30000),
  max_retries: z.number().min(0).max(10).default(3),
  base_url: z.string().url().optional(),
  api_key: z.string().optional(),
  embeddings_model: z.string().default('nomic-embed-text'),
  embeddings_dimensions: z.number().min(128).max(4096).default(768),
});

// Embedding Service Configuration Schema
export const EmbeddingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default('nomic-embed-text:v1.5'),
  batch_size: z.number().int().min(1).max(100).default(10),
  timeout: z.number().int().min(1000).default(30000),
  retries: z.number().int().min(0).max(10).default(3),
  cache: z.object({
    max_size: z.number().int().min(1).default(10000),
    max_size_bytes: z.number().int().min(1).default(100 * 1024 * 1024), // 100MB
    ttl_ms: z.number().int().min(1).default(7 * 24 * 60 * 60 * 1000), // 7 days
    cleanup_interval_ms: z.number().int().min(1).default(60 * 60 * 1000), // 1 hour
  }).default({
    max_size: 10000,
    max_size_bytes: 100 * 1024 * 1024,
    ttl_ms: 7 * 24 * 60 * 60 * 1000,
    cleanup_interval_ms: 60 * 60 * 1000,
  }),
});

// Qdrant Vector Database Configuration Schema
export const QdrantConfigSchema = z.object({
  url: z.string().url().default('http://localhost:6333'),
  api_key: z.string().optional(),
  timeout: z.number().min(1000).max(60000).default(10000),
  retries: z.number().min(0).max(10).default(3),
  batch_size: z.number().min(1).max(1000).default(100),
  collections: z.object({
    code_chunks: z.string().default('code_chunks'),
    review_insights: z.string().default('review_insights'),
    prompts: z.string().default('prompts'),
    cloud_responses: z.string().default('cloud_responses'),
  }).default({}),
  vector_dimension: z.number().min(128).max(4096).default(768),
  distance_metric: z.enum(['cosine', 'euclidean', 'dot']).default('cosine'),
  // Embedding model compatibility
  embedding_model: z.string().default('nomic-embed-text:v1.5'),
  max_chunk_size: z.number().min(100).max(10000).default(1000),
  chunk_overlap: z.number().min(0).max(500).default(50),
  // Indexing settings
  index_batch_size: z.number().min(1).max(500).default(50),
  max_concurrent_chunks: z.number().min(1).max(100).default(10),
  // Retrieval settings
  default_top_k: z.number().min(1).max(100).default(10),
  max_retrieval_tokens: z.number().min(1000).max(50000).default(4000),
  // Legacy fields for backward compatibility
  collection_name: z.string().optional(),
  dimension: z.number().optional(),
});

// Legacy Vector Database Configuration Schema (for backward compatibility)
export const VectorDBConfigSchema = z.object({
  provider: z.enum(['qdrant', 'pinecone', 'weaviate', 'chroma']).default('qdrant'),
  url: z.string().url().default('http://localhost:6333'),
  api_key: z.string().optional(),
  collection_name: z.string().default('code_reviews'),
  namespace: z.string().default('default'),
  dimensions: z.number().min(128).max(4096).default(768),
  similarity_metric: z.enum(['cosine', 'euclidean', 'dot']).default('cosine'),
  batch_size: z.number().min(1).max(1000).default(100),
  timeout: z.number().min(1000).max(60000).default(10000),
});

// Review Settings Schema
export const ReviewConfigSchema = z.object({
  severity_levels: z.array(z.enum(['low', 'medium', 'high', 'critical'])).default(['low', 'medium', 'high', 'critical']),
  categories: z.array(z.enum(['security', 'performance', 'style', 'bug', 'complexity'])).default(['security', 'performance', 'style', 'bug', 'complexity']),
  auto_escalate_keywords: z.array(z.string()).default(['vulnerability', 'security', 'critical', 'urgent', 'blocker']),
  max_comments_per_file: z.number().min(1).max(1000).default(100),
  max_file_size_mb: z.number().min(0.1).max(100).default(10),
  exclude_patterns: z.array(z.string()).default([
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    '*.min.js',
    '*.bundle.js',
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml'
  ]),
  include_patterns: z.array(z.string()).default([
    'src/**/*.{ts,tsx,js,jsx}',
    'lib/**/*.{ts,tsx,js,jsx}',
    'components/**/*.{ts,tsx,js,jsx}',
    'utils/**/*.{ts,tsx,js,jsx}',
    '*.{ts,tsx,js,jsx}'
  ]),
  review_template: z.string().default('Please review this code for {categories} issues with focus on {severity} severity items.'),
  auto_resolve_patterns: z.array(z.string()).default([
    '^\\s*//\\s*todo:',
    '^\\s*//\\s*fixme:',
    '^\\s*//\\s*hack:',
    '^\\s*//\\s*temp:'
  ]),
});

// Git Configuration Schema
export const GitConfigSchema = z.object({
  max_commit_history: z.number().min(1).max(10000).default(1000),
  exclude_merge_commits: z.boolean().default(true),
  include_merge_commits: z.boolean().default(false),
  branch_patterns: z.array(z.string()).default(['main', 'master', 'develop', 'feature/*', 'bugfix/*', 'hotfix/*']),
  ignore_branches: z.array(z.string()).default(['gh-pages', 'dependabot/*', 'renovate/*']),
  commit_message_patterns: z.array(z.string()).default([
    '^feat\\(.+\\):',
    '^fix\\(.+\\):',
    '^docs\\(.+\\):',
    '^style\\(.+\\):',
    '^refactor\\(.+\\):',
    '^test\\(.+\\):',
    '^chore\\(.+\\):'
  ]),
  max_file_changes: z.number().min(1).max(1000).default(100),
  max_lines_changed: z.number().min(1).max(10000).default(1000),
});

// Logging Configuration Schema
export const LoggingConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  format: z.enum(['json', 'simple', 'detailed']).default('json'),
  file_enabled: z.boolean().default(true),
  console_enabled: z.boolean().default(true),
  max_file_size_mb: z.number().min(1).max(100).default(10),
  max_files: z.number().min(1).max(100).default(5),
  log_directory: z.string().default('.code_review/logs'),
  retention_days: z.number().min(1).max(365).default(30),
});

// Backup Configuration Schema
export const BackupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  auto_backup: z.boolean().default(true),
  backup_interval_hours: z.number().min(1).max(168).default(24),
  max_backups: z.number().min(1).max(100).default(10),
  backup_directory: z.string().default('.code_review/backups'),
  compression: z.boolean().default(true),
  encryption: z.boolean().default(false),
  encryption_key: z.string().optional(),
});

// Retrieval Configuration Schema
export const RetrievalConfigSchema = z.object({
  enabled: z.boolean().default(true),
  default_top_k: z.number().min(1).max(100).default(10),
  max_retrieval_tokens: z.number().min(1000).max(50000).default(4000),
  hybrid_scoring: z.object({
    enabled: z.boolean().default(true),
    semantic_weight: z.number().min(0).max(1).default(0.7),
    keyword_weight: z.number().min(0).max(1).default(0.3),
    file_path_weight: z.number().min(0).max(1).default(0.2),
    language_weight: z.number().min(0).max(1).default(0.1),
  }).default({
    enabled: true,
    semantic_weight: 0.7,
    keyword_weight: 0.3,
    file_path_weight: 0.2,
    language_weight: 0.1,
  }),
  reranking: z.object({
    enabled: z.boolean().default(true),
    method: z.enum(['rrf', 'score_fusion', 'custom']).default('rrf'),
    rrf_k: z.number().min(1).max(100).default(60),
    diversity_factor: z.number().min(0).max(1).default(0.5),
  }).default({
    enabled: true,
    method: 'rrf',
    rrf_k: 60,
    diversity_factor: 0.5,
  }),
  filtering: z.object({
    min_score_threshold: z.number().min(0).max(1).default(0.1),
    max_results_per_source: z.number().min(1).max(50).default(10),
    deduplication_enabled: z.boolean().default(true),
    deduplication_threshold: z.number().min(0.5).max(1).default(0.95),
  }).default({
    min_score_threshold: 0.1,
    max_results_per_source: 10,
    deduplication_enabled: true,
    deduplication_threshold: 0.95,
  }),
  caching: z.object({
    enabled: z.boolean().default(true),
    ttl_seconds: z.number().min(60).max(86400).default(3600),
    max_cache_size: z.number().min(100).max(10000).default(1000),
  }).default({
    enabled: true,
    ttl_seconds: 3600,
    max_cache_size: 1000,
  }),
});

// Prompt Composition Configuration Schema
export const PromptCompositionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  token_budget: z.number().min(1000).max(100000).default(8000),
  token_allocations: z.object({
    preamble: z.number().min(0).max(1).default(0.1),
    context: z.number().min(0).max(1).default(0.6),
    diffs: z.number().min(0).max(1).default(0.2),
    insights: z.number().min(0).max(1).default(0.1),
    instructions: z.number().min(0).max(1).default(0.1),
  }).default({
    preamble: 0.1,
    context: 0.6,
    diffs: 0.2,
    insights: 0.1,
    instructions: 0.1,
  }),
  section_templates: z.object({
    preamble: z.string().default('You are an expert code reviewer. Analyze the following code and provide constructive feedback.'),
    context_intro: z.string().default('Here is the code context for review:'),
    diffs_intro: z.string().default('Here are the recent changes:'),
    insights_intro: z.string().default('Previous review insights:'),
    instructions: z.string().default('Please provide a detailed code review focusing on: code quality, potential bugs, security issues, performance improvements, and best practices.'),
  }).default({
    preamble: 'You are an expert code reviewer. Analyze the following code and provide constructive feedback.',
    context_intro: 'Here is the code context for review:',
    diffs_intro: 'Here are the recent changes:',
    insights_intro: 'Previous review insights:',
    instructions: 'Please provide a detailed code review focusing on: code quality, potential bugs, security issues, performance improvements, and best practices.',
  }),
  truncation: z.object({
    enabled: z.boolean().default(true),
    strategy: z.enum(['truncate_oldest', 'truncate_least_relevant', 'balanced']).default('balanced'),
    preserve_structure: z.boolean().default(true),
    min_section_tokens: z.number().min(50).max(1000).default(100),
  }).default({
    enabled: true,
    strategy: 'balanced',
    preserve_structure: true,
    min_section_tokens: 100,
  }),
  validation: z.object({
    enabled: z.boolean().default(true),
    check_token_limits: z.boolean().default(true),
    validate_structure: z.boolean().default(true),
    warn_on_truncation: z.boolean().default(true),
  }).default({
    enabled: true,
    check_token_limits: true,
    validate_structure: true,
    warn_on_truncation: true,
  }),
});

// Review Storage Configuration Schema
export const ReviewStorageConfigSchema = z.object({
  enabled: z.boolean().default(true),
  local_storage: z.object({
    enabled: z.boolean().default(true),
    directory: z.string().default('.code_review/reviews'),
    format: z.enum(['json', 'yaml']).default('json'),
    compression: z.boolean().default(false),
    max_file_size_mb: z.number().min(1).max(100).default(10),
    retention: z.object({
      enabled: z.boolean().default(true),
      max_reviews: z.number().min(100).max(10000).default(1000),
      max_age_days: z.number().min(30).max(3650).default(365),
      cleanup_interval_hours: z.number().min(1).max(168).default(24),
    }).default({
      enabled: true,
      max_reviews: 1000,
      max_age_days: 365,
      cleanup_interval_hours: 24,
    }),
  }).default({
    enabled: true,
    directory: '.code_review/reviews',
    format: 'json',
    compression: false,
    max_file_size_mb: 10,
    retention: {
      enabled: true,
      max_reviews: 1000,
      max_age_days: 365,
      cleanup_interval_hours: 24,
    },
  }),
  vector_storage: z.object({
    enabled: z.boolean().default(true),
    collections: z.object({
      reviews: z.string().default('review_results'),
      insights: z.string().default('review_insights'),
      prompts: z.string().default('review_prompts'),
      responses: z.string().default('cloud_responses'),
    }).default({
      reviews: 'review_results',
      insights: 'review_insights',
      prompts: 'review_prompts',
      responses: 'cloud_responses',
    }),
    embedding_model: z.string().default('nomic-embed-text:v1.5'),
    batch_size: z.number().min(1).max(100).default(10),
    indexing: z.object({
      enabled: z.boolean().default(true),
      batch_size: z.number().min(1).max(100).default(50),
      parallel_workers: z.number().min(1).max(10).default(3),
    }).default({
      enabled: true,
      batch_size: 50,
      parallel_workers: 3,
    }),
  }).default({
    enabled: true,
    collections: {
      reviews: 'review_results',
      insights: 'review_insights',
      prompts: 'review_prompts',
      responses: 'cloud_responses',
    },
    embedding_model: 'nomic-embed-text:v1.5',
    batch_size: 10,
    indexing: {
      enabled: true,
      batch_size: 50,
      parallel_workers: 3,
    },
  }),
  insight_extraction: z.object({
    enabled: z.boolean().default(true),
    model: z.string().default('nomic-embed-text:v1.5'),
    batch_size: z.number().min(1).max(50).default(10),
    min_confidence: z.number().min(0).max(1).default(0.3),
    max_insights: z.number().min(1).max(100).default(50),
    extraction_prompts: z.object({
      code_review: z.string(),
      commit_review: z.string(),
    }).default({
      code_review: `Extract key insights from this code review result. Focus on:
- Issues identified and their severity
- Recommendations for improvement
- Patterns or anti-patterns observed
- Security considerations
- Performance implications

Provide structured insights that can help improve future code reviews.`,
      commit_review: `Extract key insights from this commit review result. Focus on:
- Code quality changes
- Architectural decisions
- Potential regressions
- Best practices followed or violated
- Areas needing attention in future commits

Provide actionable insights for development teams.`,
    }),
  }).default({
    enabled: true,
    model: 'nomic-embed-text:v1.5',
    batch_size: 10,
    min_confidence: 0.3,
    max_insights: 50,
    extraction_prompts: {
      code_review: `Extract key insights from this code review result. Focus on:
- Issues identified and their severity
- Recommendations for improvement
- Patterns or anti-patterns observed
- Security considerations
- Performance implications

Provide structured insights that can help improve future code reviews.`,
      commit_review: `Extract key insights from this commit review result. Focus on:
- Code quality changes
- Architectural decisions
- Potential regressions
- Best practices followed or violated
- Areas needing attention in future commits

Provide actionable insights for development teams.`,
    },
  }),
  backup: z.object({
    enabled: z.boolean().default(true),
    directory: z.string().default('.code_review/backups'),
    schedule: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
    retention_count: z.number().min(1).max(100).default(10),
    compression: z.boolean().default(true),
  }).default({
    enabled: true,
    directory: '.code_review/backups',
    schedule: 'weekly',
    retention_count: 10,
    compression: true,
  }),
});

// Main Configuration Schema
export const AppConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  schema_version: z.string().default('1.0.0'),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  cloudEnabled: z.boolean().default(true),
  // New dual LLM configuration
  local_llm: LocalLLMConfigSchema,
  cloud_llm: CloudLLMConfigSchema,
  qdrant: QdrantConfigSchema,
  embeddings: EmbeddingConfigSchema,
  chunking: z.object({
    defaultChunkSize: z.number().int().min(1).default(100),
    defaultOverlapLines: z.number().int().min(0).default(5),
    includeComments: z.boolean().default(true),
    preserveContext: z.boolean().default(true),
    minChunkSize: z.number().int().min(1).default(10),
    maxOverlapPercentage: z.number().min(0).max(1).default(0.2),
    languageSpecific: z.object({
      dart: z.object({
        // Line-based chunker options
        chunkSize: z.number().int().min(1).default(80),
        overlapLines: z.number().int().min(0).default(3),
        respectBoundaries: z.boolean().default(true),
        includeComments: z.boolean().default(true),
        preserveContext: z.boolean().default(true),
        minFunctionSize: z.number().int().min(1).default(5),
        // AST-based chunker options
        maxChunkSize: z.number().int().min(1).default(100),
        prioritizeFunctions: z.boolean().default(true),
        prioritizeClasses: z.boolean().default(true),
      }).default({
        chunkSize: 80,
        overlapLines: 3,
        respectBoundaries: true,
        includeComments: true,
        preserveContext: true,
        minFunctionSize: 5,
        maxChunkSize: 100,
        prioritizeFunctions: true,
        prioritizeClasses: true,
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
  }).default({
    defaultChunkSize: 100,
    defaultOverlapLines: 5,
    includeComments: true,
    preserveContext: true,
    minChunkSize: 10,
    maxOverlapPercentage: 0.2,
    languageSpecific: {
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
    },
  }),
  indexing: z.object({
    enabled: z.boolean().default(true),
    include_patterns: z.array(z.string()).default([
      'src/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
      'lib/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
      'components/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
      'utils/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
      '*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
    ]),
    exclude_patterns: z.array(z.string()).default([
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      '.next/**',
      '.nuxt/**',
      'coverage/**',
      '*.min.js',
      '*.bundle.js',
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '*.log',
      '.DS_Store',
      'Thumbs.db',
    ]),
    max_file_size_mb: z.number().min(0.1).max(100).default(10),
    max_files_per_index: z.number().min(1).max(10000).default(1000),
    batch_size: z.number().min(1).max(100).default(10),
    enable_incremental: z.boolean().default(true),
    gitignore_support: z.boolean().default(true),
    follow_symlinks: z.boolean().default(false),
    max_depth: z.number().min(1).max(20).default(10),
  }).default({
    enabled: true,
    include_patterns: [
      'src/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
      'lib/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
      'components/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
      'utils/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
      '*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
    ],
    exclude_patterns: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      '.next/**',
      '.nuxt/**',
      'coverage/**',
      '*.min.js',
      '*.bundle.js',
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '*.log',
      '.DS_Store',
      'Thumbs.db',
    ],
    max_file_size_mb: 10,
    max_files_per_index: 1000,
    batch_size: 10,
    enable_incremental: true,
    gitignore_support: true,
    follow_symlinks: false,
    max_depth: 10,
  }),
  deltaIndexing: z.object({
    enabled: z.boolean().default(true),
    maxConcurrentFiles: z.number().min(1).max(20).default(5),
    batchSize: z.number().min(1).max(100).default(10),
    forceRecheck: z.boolean().default(false),
    skipEmbeddingRegeneration: z.boolean().default(false),
    changeDetectionMode: z.enum(['commit', 'working-tree', 'both']).default('both'),
    hashComparisonEnabled: z.boolean().default(true),
    incrementalUpdateThreshold: z.number().min(1).max(1000).default(50),
    errorHandlingMode: z.enum(['strict', 'lenient', 'ignore']).default('lenient'),
    progressReportingEnabled: z.boolean().default(true),
    dryRunSupported: z.boolean().default(true),
  }).default({
    enabled: true,
    maxConcurrentFiles: 5,
    batchSize: 10,
    forceRecheck: false,
    skipEmbeddingRegeneration: false,
    changeDetectionMode: 'both',
    hashComparisonEnabled: true,
    incrementalUpdateThreshold: 50,
    errorHandlingMode: 'lenient',
    progressReportingEnabled: true,
    dryRunSupported: true,
  }),
  // Legacy configuration (optional for backward compatibility)
  llm: LLMConfigSchema.optional(),
  vector_db: VectorDBConfigSchema.optional(),
  review: ReviewConfigSchema,
  git: GitConfigSchema,
  logging: LoggingConfigSchema,
  backup: BackupConfigSchema,
  // Feature flags
  features: z.object({
    ai_code_review: z.boolean().default(true),
    vector_search: z.boolean().default(true),
    auto_categorization: z.boolean().default(true),
    batch_processing: z.boolean().default(false),
    real_time_notifications: z.boolean().default(false),
    integration_webhooks: z.boolean().default(false),
  }).default({}),
  // Integration settings
  integrations: z.object({
    github: z.object({
      enabled: z.boolean().default(false),
      api_token: z.string().optional().nullable(),
      webhook_secret: z.string().optional().nullable(),
      repository: z.string().optional().nullable(),
      organization: z.string().optional().nullable(),
    }).default({}),
    slack: z.object({
      enabled: z.boolean().default(false),
      webhook_url: z.string().optional().nullable(),
      channel: z.string().optional().nullable(),
      username: z.string().default('Code Review Bot'),
    }).default({}),
    email: z.object({
      enabled: z.boolean().default(false),
      smtp_host: z.string().optional().nullable(),
      smtp_port: z.number().min(1).max(65535).optional().nullable(),
      smtp_user: z.string().optional().nullable(),
      smtp_pass: z.string().optional().nullable(),
      from_address: z.string().optional().nullable(),
      to_addresses: z.array(z.string().email()).default([]),
    }).default({}),
  }).default({}),
  performance: z.object({
    max_concurrent_reviews: z.number().int().min(1).default(5),
    max_memory_usage_mb: z.number().int().min(100).default(1024),
    cache_enabled: z.boolean().default(true),
    cache_ttl_seconds: z.number().int().min(60).default(3600),
    batch_size: z.number().int().min(1).default(100),
  }).default({}),
  // Extended configuration sections
  retrieval: RetrievalConfigSchema,
  prompt_composition: PromptCompositionConfigSchema,
  review_storage: ReviewStorageConfigSchema,
});




// Environment variable mapping
export const EnvVarMapping = {
  // Local LLM configuration
  LOCAL_LLM_MODEL: 'local_llm.model',
  LOCAL_LLM_BASE_URL: 'local_llm.base_url',
  LOCAL_LLM_EMBEDDING_MODEL: 'local_llm.embedding_model',

  // Cloud LLM configuration
  CLOUD_LLM_MODEL: 'cloud_llm.model',
  CLOUD_LLM_API_KEY: 'cloud_llm.api_key',

  // Qdrant configuration
  QDRANT_URL: 'qdrant.url',
  QDRANT_API_KEY: 'qdrant.api_key',
  QDRANT_TIMEOUT: 'qdrant.timeout',
  QDRANT_RETRIES: 'qdrant.retries',
  QDRANT_BATCH_SIZE: 'qdrant.batch_size',
  QDRANT_CODE_CHUNKS_COLLECTION: 'qdrant.collections.code_chunks',
  QDRANT_REVIEW_INSIGHTS_COLLECTION: 'qdrant.collections.review_insights',
  QDRANT_PROMPTS_COLLECTION: 'qdrant.collections.prompts',
  QDRANT_CLOUD_RESPONSES_COLLECTION: 'qdrant.collections.cloud_responses',
  QDRANT_VECTOR_DIMENSION: 'qdrant.vector_dimension',
  QDRANT_DISTANCE_METRIC: 'qdrant.distance_metric',
  QDRANT_EMBEDDING_MODEL: 'qdrant.embedding_model',
  QDRANT_MAX_CHUNK_SIZE: 'qdrant.max_chunk_size',
  QDRANT_CHUNK_OVERLAP: 'qdrant.chunk_overlap',
  QDRANT_INDEX_BATCH_SIZE: 'qdrant.index_batch_size',
  QDRANT_MAX_CONCURRENT_CHUNKS: 'qdrant.max_concurrent_chunks',
  QDRANT_DEFAULT_TOP_K: 'qdrant.default_top_k',
  QDRANT_MAX_RETRIEVAL_TOKENS: 'qdrant.max_retrieval_tokens',
  // Legacy mapping
  QDRANT_COLLECTION: 'qdrant.collection_name',

  // Legacy mappings (for backward compatibility)
  LLM_PROVIDER: 'llm.provider',
  LLM_MODEL: 'llm.model',
  LLM_TEMPERATURE: 'llm.temperature',
  LLM_MAX_TOKENS: 'llm.max_tokens',
  LLM_TIMEOUT: 'llm.timeout',
  LLM_API_KEY: 'llm.api_key',
  LLM_BASE_URL: 'llm.base_url',
  VECTOR_DB_PROVIDER: 'vector_db.provider',
  VECTOR_DB_URL: 'vector_db.url',
  VECTOR_DB_API_KEY: 'vector_db.api_key',
  VECTOR_DB_COLLECTION: 'vector_db.collection_name',
  LOG_LEVEL: 'logging.level',
  LOG_FORMAT: 'logging.format',
  BACKUP_ENABLED: 'backup.enabled',
  BACKUP_INTERVAL: 'backup.backup_interval_hours',
  GITHUB_ENABLED: 'integrations.github.enabled',
  GITHUB_TOKEN: 'integrations.github.api_token',
  SLACK_ENABLED: 'integrations.slack.enabled',
  SLACK_WEBHOOK: 'integrations.slack.webhook_url',
  EMAIL_ENABLED: 'integrations.email.enabled',
  SMTP_HOST: 'integrations.email.smtp_host',
  SMTP_PORT: 'integrations.email.smtp_port',
  SMTP_USER: 'integrations.email.smtp_user',
  SMTP_PASS: 'integrations.email.smtp_pass',
};

// Type exports
export type LocalLLMConfig = z.infer<typeof LocalLLMConfigSchema>;
export type CloudLLMConfig = z.infer<typeof CloudLLMConfigSchema>;
export type QdrantConfig = z.infer<typeof QdrantConfigSchema>;

// Legacy types (for backward compatibility)
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type VectorDBConfig = z.infer<typeof VectorDBConfigSchema>;
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
export type GitConfig = z.infer<typeof GitConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type BackupConfig = z.infer<typeof BackupConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
