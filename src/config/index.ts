
export * from './schemas';
export * from './config-manager';
export * from './migrations';

import {
  AppConfigSchema,
  LLMConfigSchema,
  VectorDBConfigSchema,
  ReviewConfigSchema,
  GitConfigSchema,
  LoggingConfigSchema,
  BackupConfigSchema,
} from './schemas';

export {
  AppConfigSchema,
  LLMConfigSchema,
  VectorDBConfigSchema,
  ReviewConfigSchema,
  GitConfigSchema,
  LoggingConfigSchema,
  BackupConfigSchema,
};

export {
  ConfigManager,
  ConfigSource,
  ConfigValidationResult,
} from './config-manager';

export {
  ConfigMigrationManager,
  MigrationResult,
  Migration,
} from './migrations';

export const createDefaultConfig = () => AppConfigSchema.parse({
  version: '1.0.0',
  schema_version: '1.0.0',
  environment: 'development',
  local_llm: {
    provider: 'ollama',
    model: 'llama2',
    embedding_model: 'nomic-embed-text',
    temperature: 0.1,
    max_tokens: 2048,
    timeout: 30000,
    base_url: 'http://localhost:11434',
  },
  cloud_llm: {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.1,
    max_tokens: 4096,
    timeout: 30000,
    api_key: '',
  },
  qdrant: {
    url: 'http://localhost:6333',
    collection_name: 'code_review',
    dimension: 768,
    distance_metric: 'cosine',
  },
  review: {
    severity_levels: ['low', 'medium', 'high', 'critical'],
    categories: ['security', 'performance', 'style', 'bug', 'complexity'],
    auto_escalate_keywords: ['security', 'vulnerability', 'critical'],
    max_comments_per_file: 50,
    max_file_changes: 100,
    max_lines_changed: 1000,
  },
  git: {
    max_commits_per_review: 50,
    max_files_per_commit: 100,
    exclude_patterns: ['node_modules*.ts', '***.py', '**/*.java'],
    max_file_size_kb: 1024,
    max_history_days: 365,
  },
  logging: {
    level: 'info',
    format: 'json',
    file_enabled: true,
    console_enabled: true,
    max_file_size_mb: 10,
    max_files: 5,
    log_directory: '.code_review/logs',
    retention_days: 30,
  },
  backup: {
    enabled: true,
    auto_backup: true,
    backup_interval_hours: 24,
    max_backups: 10,
    backup_directory: '.code_review/backups',
    compression: true,
    encryption: false,
  },
  features: {
    ai_code_review: true,
    vector_search: true,
    auto_categorization: true,
    batch_processing: false,
    real_time_notifications: false,
    integration_webhooks: false,
  },
  integrations: {
    github: {
      enabled: false,
    },
    slack: {
      enabled: false,
      username: 'Code Review Bot',
    },
    email: {
      enabled: false,
      to_addresses: [],
    },
  },
  performance: {
    max_concurrent_reviews: 5,
    max_memory_usage_mb: 1024,
    cache_enabled: true,
    cache_ttl_seconds: 3600,
    batch_size: 100,
  },
});

export const getEnvConfigValue = (envVar: string): string | undefined => {
  return process.env[envVar];
};

export const setEnvConfigValue = (envVar: string, value: string): void => {
  process.env[envVar] = value;
};

export const validateConfigFile = (configPath: string): boolean => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    AppConfigSchema.parse(config);
    return true;
  } catch {
    return false;
  }
};

export const getConfigSchema = () => AppConfigSchema._def;
