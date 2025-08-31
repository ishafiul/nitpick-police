import { z } from 'zod';

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

// Qdrant Vector Database Configuration Schema
export const QdrantConfigSchema = z.object({
  url: z.string().url().default('http://localhost:6333'),
  collection_name: z.string().default('code_review'),
  dimension: z.number().min(128).max(4096).default(768),
  distance_metric: z.enum(['cosine', 'euclidean', 'dot']).default('cosine'),
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
      api_token: z.string().optional(),
      webhook_secret: z.string().optional(),
      repository: z.string().optional(),
      organization: z.string().optional(),
    }).default({}),
    slack: z.object({
      enabled: z.boolean().default(false),
      webhook_url: z.string().optional(),
      channel: z.string().optional(),
      username: z.string().default('Code Review Bot'),
    }).default({}),
    email: z.object({
      enabled: z.boolean().default(false),
      smtp_host: z.string().optional(),
      smtp_port: z.number().min(1).max(65535).optional(),
      smtp_user: z.string().optional(),
      smtp_pass: z.string().optional(),
      from_address: z.string().optional(),
      to_addresses: z.array(z.string().email()).default([]),
    }).default({}),
  }).default({}),
  // Performance settings
  performance: z.object({
    max_concurrent_reviews: z.number().min(1).max(100).default(5),
    max_memory_usage_mb: z.number().min(100).max(8192).default(1024),
    cache_enabled: z.boolean().default(true),
    cache_ttl_seconds: z.number().min(60).max(86400).default(3600),
    batch_size: z.number().min(1).max(1000).default(100),
  }).default({}),
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
