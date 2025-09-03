import logger from '../utils/logger';
import { AppConfigSchema } from './schemas';

export interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  errors: string[];
  warnings: string[];
  migratedConfig: any;
  changes?: string[];
}

export interface Migration {
  version: string;
  description: string;
  migrate: (config: any) => any;
  validate?: (config: any) => boolean;
}

export class ConfigMigrationManager {
  private migrations: Migration[] = [];
  private currentSchemaVersion: string;

  constructor() {
    this.currentSchemaVersion = '1.3.0';
    this.registerMigrations();
  }

  private registerMigrations(): void {
    this.migrations.push({
      version: '1.0.0',
      description: 'Initial configuration structure',
      migrate: (config: any) => {
        const migrated = { ...config };
        if (!migrated.llm) {
          migrated.llm = {
            provider: 'ollama',
            model: 'llama2',
            temperature: 0.7,
            max_tokens: 4096,
            timeout: 30000,
            max_retries: 3,
            embeddings_model: 'llama2',
            embeddings_dimensions: 4096,
          };
        }
        if (!migrated.local_llm) {
          migrated.local_llm = {
            provider: 'ollama',
            model: 'llama2',
            embedding_model: 'nomic-embed-text',
            temperature: 0.1,
            max_tokens: 2048,
            timeout: 30000,
            base_url: 'http://localhost:11434',
          };
        }
        if (!migrated.cloud_llm) {
          migrated.cloud_llm = {
            provider: 'anthropic',
            model: 'claude-3-sonnet-20240229',
            temperature: 0.1,
            max_tokens: 4096,
            timeout: 30000,
            api_key: '',
          };
        }
        if (!migrated.qdrant) {
          migrated.qdrant = {
            url: 'http://localhost:6333',
            collections: {
              code_chunks: 'code_chunks',
              review_insights: 'review_insights',
              prompts: 'prompts',
              cloud_responses: 'cloud_responses',
            },
            vector_dimension: 768,
            distance_metric: 'cosine',
          };
        }
        if (!migrated.review) {
          migrated.review = {
            severity_levels: ['low', 'medium', 'high', 'critical'],
            categories: ['security', 'performance', 'style', 'bug', 'complexity'],
            auto_escalate_keywords: ['security', 'vulnerability', 'critical'],
            max_comments_per_file: 50,
            max_file_changes: 100,
            max_lines_changed: 1000,
          };
        }
        if (!migrated.git) {
          migrated.git = {
            max_commits_per_review: 50,
            max_files_per_commit: 100,
            exclude_patterns: ['node_modules/**', 'dist/**', '*.log'],
          };
        }
        migrated.schema_version = '1.0.0';
        return migrated;
      },
    });

    // 1.1.0: add retrieval and embeddings defaults
    this.migrations.push({
      version: '1.1.0',
      description: 'Add retrieval and embeddings defaults; expand qdrant collections',
      migrate: (config: any) => {
        const migrated = { ...config };
        migrated.schema_version = '1.1.0';
        migrated.embeddings = migrated.embeddings || {
          enabled: true,
          model: 'nomic-embed-text:v1.5',
          batch_size: 10,
          timeout: 30000,
          retries: 3,
        };
        migrated.retrieval = migrated.retrieval || {
          enabled: true,
          default_top_k: 10,
          max_retrieval_tokens: 4000,
        };
        if (migrated.qdrant && !migrated.qdrant.collections) {
          migrated.qdrant.collections = {
            code_chunks: 'code_chunks',
            review_insights: 'review_insights',
            prompts: 'prompts',
            cloud_responses: 'cloud_responses',
          };
        }
        return migrated;
      },
    });

    // 1.2.0: add prompt composition section
    this.migrations.push({
      version: '1.2.0',
      description: 'Introduce prompt_composition section and defaults',
      migrate: (config: any) => {
        const migrated = { ...config };
        migrated.schema_version = '1.2.0';
        migrated.prompt_composition = migrated.prompt_composition || {
          enabled: true,
          token_budget: 8000,
          token_allocations: { preamble: 0.1, context: 0.6, instructions: 0.2, examples: 0.1 },
          context_management: { max_files: 10, max_lines_per_file: 100, prioritize_recent: true, include_imports: true },
        };
        return migrated;
      },
    });

    // 1.3.0: indexing/deltaIndexing defaults + review_storage
    this.migrations.push({
      version: '1.3.0',
      description: 'Add indexing/deltaIndexing and review_storage defaults',
      migrate: (config: any) => {
        const migrated = { ...config };
        migrated.schema_version = '1.3.0';
        migrated.indexing = migrated.indexing || {
          enabled: true,
          include_patterns: [
            'src/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
            'lib/**/*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
            '*.{ts,tsx,js,jsx,dart,py,java,cpp,c}',
          ],
          exclude_patterns: [
            'node_modules/**', 'dist/**', 'build/**', '.git/**', '*.min.js', '*.bundle.js', '*.lock',
            'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
          ],
          max_file_size_mb: 10,
          max_files_per_index: 1000,
          batch_size: 10,
          enable_incremental: true,
          gitignore_support: true,
          follow_symlinks: false,
          max_depth: 10,
        };
        migrated.deltaIndexing = migrated.deltaIndexing || {
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
        };
        migrated.review_storage = migrated.review_storage || {
          enabled: true,
          local_storage: {
            enabled: true,
            directory: '.code_review/reviews',
            format: 'json',
            compression: false,
            retention_days: 90,
          },
          cloud_storage: {
            enabled: false,
            provider: 's3',
            bucket: '',
            region: 'us-east-1',
            prefix: 'reviews/',
          },
          indexing: {
            enabled: true,
            searchable_fields: ['summary', 'issues', 'suggestions'],
            full_text_search: true,
          },
        };
        return migrated;
      },
    });
  }

  async migrateConfig(config: any, targetVersion?: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      fromVersion: config.schema_version || '1.0.0',
      toVersion: targetVersion || this.currentSchemaVersion,
      errors: [],
      warnings: [],
      migratedConfig: config,
      changes: [],
    };

    try {
      logger.info(`Starting migration from ${result.fromVersion} to ${result.toVersion}`);

      const migrations = this.getMigrationPath(result.fromVersion, result.toVersion);

      if (migrations.length === 0) {
        logger.info('No migration needed');
        result.success = true;
        return result;
      }

      let currentConfig = { ...config };

      for (const migration of migrations) {
        logger.info(`Applying migration to ${migration.version}: ${migration.description}`);
        try {
          currentConfig = migration.migrate(currentConfig);
          if (migration.validate && !migration.validate(currentConfig)) {
            result.warnings.push(`Migration ${migration.version} validation failed`);
          }
          logger.info(`Migration to ${migration.version} completed successfully`);
        } catch (error) {
          const errorMsg = `Migration ${migration.version} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg, error);
          throw error;
        }
      }

      result.migratedConfig = currentConfig;
      result.success = true;
      logger.info(`Migration completed successfully to ${result.toVersion}`);
    } catch (error) {
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error('Migration failed:', error);
    }

    return result;
  }

  needsMigration(config: any): boolean {
    const currentVersion = config.schema_version || '1.0.0';
    return currentVersion !== this.currentSchemaVersion;
  }

  getAvailableVersions(): string[] {
    return this.migrations.map(m => m.version);
  }

  getMigrationInfo(): Array<{ version: string; description: string }> {
    return this.migrations.map(m => ({
      version: m.version,
      description: m.description,
    }));
  }

  validateMigratedConfig(config: any): boolean {
    try {
      AppConfigSchema.parse(config);
      return true;
    } catch {
      return false;
    }
  }

  // deepMerge not needed in migration manager; removed to avoid unused code

  getMigrationPath(fromVersion: string, toVersion: string): Migration[] {
    const sortedMigrations = [...this.migrations].sort((a, b) => this.compareVersions(a.version, b.version));
    const fromIndex = sortedMigrations.findIndex(m => m.version === fromVersion);
    const toIndex = sortedMigrations.findIndex(m => m.version === toVersion);

    if (fromIndex === -1 || toIndex === -1) {
      throw new Error(`Invalid version: from=${fromVersion}, to=${toVersion}`);
    }

    if (fromIndex === toIndex) {
      return [];
    }

    if (fromIndex < toIndex) {
      return sortedMigrations.slice(fromIndex + 1, toIndex + 1);
    }

    throw new Error(`Backward migration not supported: ${fromVersion} -> ${toVersion}`);
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      if (aPart < bPart) return -1;
      if (aPart > bPart) return 1;
    }

    return 0;
  }
}
