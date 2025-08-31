import logger from '../utils/logger';
import { AppConfigSchema } from './schemas';

export interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  errors: string[];
  warnings: string[];
  migratedConfig: any;
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

  /**
   * Register all available migrations
   */
  private registerMigrations(): void {
    // Migration from v1.0.0 to v1.1.0
    this.migrations.push({
      version: '1.0.0',
      description: 'Initial configuration structure',
      migrate: (config: any) => {
        const migrated = { ...config };
        
        // Ensure basic structure exists
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
            collection_name: 'code_review',
            dimension: 768,
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
            include_patterns: ['**/*.ts', '**/*.js', '**/*.py', '**/*.java'],
            max_file_size_kb: 1024,
            max_history_days: 365,
          };
        }
        
        migrated.schema_version = '1.0.0';
        return migrated;
      },
      validate: (config: any) => {
        return config.local_llm && config.cloud_llm && config.qdrant && config.review && config.git;
      },
    });

    // Migration from v1.0.0 to v1.1.0
    this.migrations.push({
      version: '1.1.0',
      description: 'Add performance settings and feature flags',
      migrate: (config: any) => {
        const migrated = { ...config };
        
        // Add performance settings if missing
        if (!migrated.performance) {
          migrated.performance = {
            max_concurrent_reviews: 5,
            max_memory_usage_mb: 1024,
            cache_enabled: true,
            cache_ttl_seconds: 3600,
            batch_size: 100,
          };
        }

        // Add feature flags if missing
        if (!migrated.features) {
          migrated.features = {
            ai_code_review: true,
            vector_search: true,
            auto_categorization: true,
            batch_processing: false,
            real_time_notifications: false,
            integration_webhooks: false,
          };
        }

        // Add integrations if missing
        if (!migrated.integrations) {
          migrated.integrations = {
            github: { enabled: false },
            slack: { enabled: false },
            email: { enabled: false },
          };
        }

        migrated.schema_version = '1.1.0';
        return migrated;
      },
      validate: (config: any) => {
        return config.performance && config.features && config.integrations;
      },
    });

    // Migration from v1.1.0 to v1.2.0
    this.migrations.push({
      version: '1.2.0',
      description: 'Add logging and backup configuration',
      migrate: (config: any) => {
        const migrated = { ...config };
        
        // Add logging config if missing
        if (!migrated.logging) {
          migrated.logging = {
            level: 'info',
            format: 'json',
            file_enabled: true,
            console_enabled: true,
            max_file_size_mb: 10,
            max_files: 5,
            log_directory: '.code_review/logs',
            retention_days: 30,
          };
        }

        // Add backup config if missing
        if (!migrated.backup) {
          migrated.backup = {
            enabled: true,
            auto_backup: true,
            backup_interval_hours: 24,
            max_backups: 10,
            backup_directory: '.code_review/backups',
            compression: true,
            encryption: false,
          };
        }

        migrated.schema_version = '1.2.0';
        return migrated;
      },
      validate: (config: any) => {
        return config.logging && config.backup;
      },
    });

    // Migration from v1.2.0 to current (deep merge with defaults)
    this.migrations.push({
      version: '1.3.0',
      description: 'Deep merge with default configuration',
      migrate: (config: any) => {
        const migrated = { ...config };
        
        // Deep merge with default configuration to ensure all required fields exist
        const defaultConfig = {
          version: '1.0.0',
          schema_version: '1.2.0',
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
            exclude_patterns: ['node_modules/**', 'dist/**', '*.log'],
            include_patterns: ['**/*.ts', '**/*.js', '**/*.py', '**/*.java'],
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
            github: { enabled: false },
            slack: { enabled: false, username: 'Code Review Bot' },
            email: { enabled: false, to_addresses: [] },
          },
          performance: {
            max_concurrent_reviews: 5,
            max_memory_usage_mb: 1024,
            cache_enabled: true,
            cache_ttl_seconds: 3600,
            batch_size: 100,
          },
        };

        // Deep merge
        const mergedConfig = this.deepMerge(defaultConfig, migrated);
        mergedConfig.schema_version = '1.2.0';
        return mergedConfig;
      },
      validate: (config: any) => {
        try {
          AppConfigSchema.parse(config);
          return true;
        } catch {
          return false;
        }
      },
    });

    // Migration to current version
    this.migrations.push({
      version: this.currentSchemaVersion,
      description: 'Migrate to current schema version',
      migrate: (config: any) => {
        const migrated = { ...config };
        
        // Ensure all required fields are present with defaults
        const defaultConfig = AppConfigSchema.parse({});
        
        // Deep merge with defaults
        migrated.schema_version = this.currentSchemaVersion;
        return this.deepMerge(defaultConfig, migrated);
      },
      validate: (config: any) => {
        try {
          AppConfigSchema.parse(config);
          return true;
        } catch {
          return false;
        }
      },
    });
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.deepMerge(result[key] || {}, value);
      } else if (value !== undefined) {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Get migration path from current version to target version
   */
  getMigrationPath(fromVersion: string, toVersion: string): Migration[] {
    // Sort migrations by version to ensure correct order
    const sortedMigrations = [...this.migrations].sort((a, b) => {
      return this.compareVersions(a.version, b.version);
    });
    
    const fromIndex = sortedMigrations.findIndex(m => m.version === fromVersion);
    const toIndex = sortedMigrations.findIndex(m => m.version === toVersion);
    
    if (fromIndex === -1 || toIndex === -1) {
      throw new Error(`Invalid version: from=${fromVersion}, to=${toVersion}`);
    }
    
    if (fromIndex === toIndex) {
      return [];
    }
    
    if (fromIndex < toIndex) {
      // Forward migration
      return sortedMigrations.slice(fromIndex + 1, toIndex + 1);
    } else {
      // Backward migration (not supported)
      throw new Error(`Backward migration not supported: ${fromVersion} -> ${toVersion}`);
    }
  }

  /**
   * Compare two version strings (simple semantic version comparison)
   */
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

  /**
   * Migrate configuration to target version
   */
  async migrateConfig(config: any, targetVersion?: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      fromVersion: config.schema_version || '1.0.0',
      toVersion: targetVersion || this.currentSchemaVersion,
      errors: [],
      warnings: [],
      migratedConfig: config,
    };

    try {
      logger.info(`Starting migration from ${result.fromVersion} to ${result.toVersion}`);
      
      // Get migration path
      const migrations = this.getMigrationPath(result.fromVersion, result.toVersion);
      
      if (migrations.length === 0) {
        logger.info('No migration needed');
        result.success = true;
        return result;
      }
      
      // Apply migrations in sequence
      let currentConfig = { ...config };
      
      for (const migration of migrations) {
        logger.info(`Applying migration to ${migration.version}: ${migration.description}`);
        
        try {
          // Apply migration
          currentConfig = migration.migrate(currentConfig);
          
          // Validate if validation function exists
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

  /**
   * Check if migration is needed
   */
  needsMigration(config: any): boolean {
    const currentVersion = config.schema_version || '1.0.0';
    return currentVersion !== this.currentSchemaVersion;
  }

  /**
   * Get available migration versions
   */
  getAvailableVersions(): string[] {
    return this.migrations.map(m => m.version);
  }

  /**
   * Get migration information
   */
  getMigrationInfo(): Array<{ version: string; description: string }> {
    return this.migrations.map(m => ({
      version: m.version,
      description: m.description,
    }));
  }

  /**
   * Validate configuration after migration
   */
  validateMigratedConfig(config: any): boolean {
    try {
      AppConfigSchema.parse(config);
      return true;
    } catch {
      return false;
    }
  }
}
