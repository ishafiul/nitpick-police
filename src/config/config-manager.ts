import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import logger from '../utils/logger';
import {
  AppConfigSchema,
  AppConfig,
  EnvVarMapping,
  RetrievalConfigSchema,
  PromptCompositionConfigSchema,
  ReviewStorageConfigSchema,
} from './schemas';
import { ConfigMigrationManager, MigrationResult } from './migrations';

export interface ConfigSource {
  path: string;
  priority: number;
  exists: boolean;
  content?: string | undefined;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: AppConfig;
}

type CodeReviewConfig = {
  version: string;
  cloudEnabled: boolean;
  anthropic?: {
    apiKey: string;
  };
};

export class ConfigManager {
  private config: AppConfig | null = null;
  private configPath: string;
  private globalConfigPath: string;
  private sources: ConfigSource[] = [];
  private configDir: string;
  
  constructor(projectRoot: string = process.cwd()) {
    this.configPath = path.join(projectRoot, '.code_review', 'config.json');
    this.globalConfigPath = path.join(os.homedir(), '.code_review_config.json');
    this.configDir = path.join(projectRoot, '.code_review');
    this.initializeSources();
  }

  /**
   * Initialize configuration sources with proper precedence
   */
  private initializeSources(): void {
    this.sources = [
      {
        path: this.globalConfigPath,
        priority: 1, // Lowest priority
        exists: fs.existsSync(this.globalConfigPath),
      },
      {
        path: this.configPath,
        priority: 2, // Higher priority than global
        exists: fs.existsSync(this.configPath),
      },
    ];
  }

  /**
   * Load configuration from all sources
   */
  async loadConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    logger.info('Loading configuration...');
    
    // Start with default configuration
    let config = this.createDefaultConfigObject();
    
    // Load from sources in priority order
    for (const source of this.sources.sort((a, b) => a.priority - b.priority)) {
      if (source.exists) {
        try {
          const sourceConfig = await this.loadConfigFromFile(source.path);
          config = this.mergeConfigs(config, sourceConfig);
          logger.info(`Loaded config from: ${source.path}`);
        } catch (error) {
          logger.warn(`Failed to load config from ${source.path}:`, error);
        }
      }
    }

    // Apply environment variable overrides
    config = this.applyEnvironmentOverrides(config);
    
    // Validate final configuration
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      logger.error('Configuration validation failed:', validation.errors);
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      logger.warn('Configuration warnings:', validation.warnings);
    }

    this.config = validation.config!;
    logger.info('Configuration loaded successfully');
    
    return this.config;
  }

  /**
   * Load configuration from a specific file
   */
  private async loadConfigFromFile(filePath: string): Promise<Partial<AppConfig>> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return parsed;
    } catch (error) {
      logger.error(`Failed to load config from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Merge configurations with proper precedence
   */
  private mergeConfigs(base: AppConfig, override: Partial<AppConfig>): AppConfig {
    const merged = { ...base } as AppConfig;
    
    // Deep merge for nested objects
    for (const [key, value] of Object.entries(override)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const baseValue = merged[key as keyof AppConfig];
        if (baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)) {
          (merged as any)[key] = this.mergeConfigs(
            baseValue as any,
            value as any
          );
        } else {
          (merged as any)[key] = value;
        }
      } else if (value !== undefined) {
        (merged as any)[key] = value;
      }
    }
    
    return merged;
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(config: AppConfig): AppConfig {
    const overridden = { ...config };
    
    for (const [envVar, configPath] of Object.entries(EnvVarMapping) as [string, string][]) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedValue(overridden, configPath, this.parseEnvValue(value));
        logger.debug(`Applied environment override: ${envVar}=${value} -> ${configPath}`);
      }
    }
    
    return overridden;
  }

  /**
   * Set a nested value in an object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key && !(key in current)) {
        current[key] = {};
      }
      if (key) {
        current = current[key];
      }
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
  }

  /**
   * Parse environment variable value to appropriate type
   */
  private parseEnvValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, try to infer type
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      if (!isNaN(Number(value)) && value.trim() !== '') return Number(value);
      return value;
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config: any): ConfigValidationResult {
    const result: ConfigValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
    };

    try {
      const validated = AppConfigSchema.parse(config);
      result.isValid = true;
      result.config = validated;
      
      // Additional validation checks
      this.performAdditionalValidation(validated, result);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        result.errors = error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        );
      } else {
        result.errors = [error instanceof Error ? error.message : 'Unknown validation error'];
      }
    }

    return result;
  }

  /**
   * Perform additional validation beyond schema validation
   */
  private performAdditionalValidation(config: AppConfig, result: ConfigValidationResult): void {
    // Check for conflicting settings
    if (config.git?.exclude_merge_commits && config.git?.include_merge_commits) {
      result.warnings.push('Both exclude_merge_commits and include_merge_commits are enabled');
    }

    // Check for reasonable performance settings
    if (config.performance?.max_memory_usage_mb && config.performance.max_memory_usage_mb > 4096) {
      result.warnings.push('High memory usage setting detected (>4GB)');
    }

    // Check for security concerns
    if (config.integrations?.github?.enabled && !config.integrations.github.api_token) {
      result.warnings.push('GitHub integration enabled but no API token provided');
    }

    // Check for backup settings
    if (config.backup?.enabled && config.backup?.encryption && !config.backup.encryption_key) {
      result.warnings.push('Backup encryption enabled but no encryption key provided');
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: AppConfig, targetPath?: string): Promise<void> {
    const savePath = targetPath || this.configPath;
    const dir = path.dirname(savePath);
    
    try {
      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      
      // Validate before saving
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(`Cannot save invalid configuration: ${validation.errors.join(', ')}`);
      }
      
      // Save with pretty formatting
      const content = JSON.stringify(config, null, 2);
      await fs.promises.writeFile(savePath, content, 'utf-8');
      
      logger.info(`Configuration saved to: ${savePath}`);
      
      // Update local config if saving to project config
      if (savePath === this.configPath) {
        this.config = config;
      }
      
    } catch (error) {
      logger.error(`Failed to save configuration to ${savePath}:`, error);
      throw error;
    }
  }

  /**
   * Create default configuration object
   */
  private createDefaultConfigObject(): AppConfig {
    return AppConfigSchema.parse({
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
        api_key: '',
        timeout: 10000,
        retries: 3,
        batch_size: 100,
        collections: {
          code_chunks: 'code_chunks',
          review_insights: 'review_insights',
          prompts: 'prompts',
          cloud_responses: 'cloud_responses',
        },
        vector_dimension: 768,
        distance_metric: 'cosine',
        // Embedding model compatibility
        embedding_model: 'nomic-embed-text:v1.5',
        max_chunk_size: 1000,
        chunk_overlap: 50,
        // Indexing settings
        index_batch_size: 50,
        max_concurrent_chunks: 10,
        // Retrieval settings
        default_top_k: 10,
        max_retrieval_tokens: 4000,
      },
      embeddings: {
        enabled: true,
        model: 'nomic-embed-text:v1.5',
        batch_size: 10,
        timeout: 30000,
        retries: 3,
        cache: {
          max_size: 10000,
          max_size_bytes: 100 * 1024 * 1024, // 100MB
          ttl_ms: 7 * 24 * 60 * 60 * 1000, // 7 days
          cleanup_interval_ms: 60 * 60 * 1000, // 1 hour
        },
      },
      chunking: {
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
      },
      indexing: {
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
      },
      deltaIndexing: {
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
      },
      review: {
        severity_levels: ['low', 'medium', 'high', 'critical'],
        categories: ['security', 'performance', 'style', 'bug', 'complexity'],
        auto_escalate_keywords: ['security', 'vulnerability', 'critical'],
        max_comments_per_file: 50,
        max_file_size_mb: 10,
        exclude_patterns: [
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
        ],
        include_patterns: [
          'src/**/*.{ts,tsx,js,jsx}',
          'lib/**/*.{ts,tsx,js,jsx}',
          'components/**/*.{ts,tsx,js,jsx}',
          'utils/**/*.{ts,tsx,js,jsx}',
          '*.{ts,tsx,js,jsx}'
        ],
        review_template: 'Please review this code for {categories} issues with focus on {severity} severity items.',
        auto_resolve_patterns: [
          '^\\s*//\\s*todo:',
          '^\\s*//\\s*fixme:',
          '^\\s*//\\s*hack:',
          '^\\s*//\\s*temp:'
        ],
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
      retrieval: {
        enabled: true,
        default_top_k: 10,
        max_retrieval_tokens: 4000,
        hybrid_scoring: {
          enabled: true,
          semantic_weight: 0.7,
          keyword_weight: 0.3,
        },
        reranking: {
          enabled: false,
          model: 'cross-encoder/ms-marco-MiniLM-L-6-v2',
          top_k: 20,
        },
        filters: {
          enabled: true,
          file_types: ['ts', 'js', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c'],
          exclude_patterns: ['node_modules/**', 'dist/**', 'build/**'],
        },
      },
      prompt_composition: {
        enabled: true,
        token_budget: 8000,
        token_allocations: {
          preamble: 0.1,
          context: 0.6,
          instructions: 0.2,
          examples: 0.1,
        },
        context_management: {
          max_files: 10,
          max_lines_per_file: 100,
          prioritize_recent: true,
          include_imports: true,
        },
        template_engine: {
          enabled: true,
          custom_templates: {},
          fallback_template: 'default',
        },
      },
      review_storage: {
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
      },
    });
  }

  /**
   * Create default configuration file
   */
  async createDefaultConfig(): Promise<void> {
    const defaultConfig = this.createDefaultConfigObject();
    await this.saveConfig(defaultConfig);
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Get configuration value by path
   */
  getConfigValue(path: string): any {
    const config = this.getConfig();
    const keys = path.split('.');
    let current: any = config;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Set configuration value by path
   */
  setConfigValue(path: string, value: any): void {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    
    this.setNestedValue(this.config, path, value);
  }

  public setConfig(config: CodeReviewConfig): void {
    const configPath = path.join(this.configDir, 'config.json');
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  public get<T = any>(key: string): T | undefined {
    const keys = key.split('.');
    let current: any = this.getConfig();

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Reload configuration from sources
   */
  async reloadConfig(): Promise<AppConfig> {
    this.config = null;
    return this.loadConfig();
  }

  /**
   * Export configuration as JSON schema
   */
  exportSchema(): any {
    return AppConfigSchema._def;
  }

  /**
   * Get configuration sources information
   */
  async getConfigSources(): Promise<ConfigSource[]> {
    return Promise.all(this.sources.map(async source => ({
      ...source,
      content: source.exists ? await fs.promises.readFile(source.path, 'utf-8') : undefined,
    })));
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Get configuration file paths
   */
  getConfigPaths(): { project: string; global: string } {
    return {
      project: this.configPath,
      global: this.globalConfigPath,
    };
  }

  /**
   * Check if configuration needs migration
   */
  needsMigration(): boolean {
    if (!this.config) return false;
    return new ConfigMigrationManager().needsMigration(this.config);
  }

  /**
   * Migrate configuration to latest version
   */
  async migrateConfiguration(options: {
    dryRun?: boolean;
    createBackup?: boolean;
    backupDir?: string;
  } = {}): Promise<MigrationResult> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    // Create backup if requested
    if (options.createBackup) {
      // TODO: Implement backup functionality
      logger.info('Backup requested but not yet implemented');
    }

    // Perform migration
    const result = await new ConfigMigrationManager().migrateConfig(this.config, undefined);

    if (result.success && !options.dryRun) {
      // Save migrated configuration
      await this.saveConfig(result.migratedConfig);
      this.config = result.migratedConfig;
      logger.info('Migrated configuration saved successfully');
    }

    return result;
  }

  /**
   * Get migration recommendations
   */
  getMigrationRecommendations(): string[] {
    if (!this.config) return [];
    // TODO: Implement migration recommendations
    return ['Consider updating to latest schema version'];
  }

  /**
   * Get retrieval configuration section
   */
  getRetrievalConfig() {
    if (!this.config?.retrieval) {
      throw new Error('Retrieval configuration not found');
    }
    return this.config.retrieval;
  }

  /**
   * Update retrieval configuration
   */
  async updateRetrievalConfig(updates: Partial<AppConfig['retrieval']>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    if (!this.config.retrieval) {
      this.config.retrieval = RetrievalConfigSchema.parse({});
    }

    // Deep merge updates
    this.config.retrieval = this.deepMerge(this.config.retrieval, updates);

    // Validate the updated configuration
    const validationResult = RetrievalConfigSchema.safeParse(this.config.retrieval);
    if (!validationResult.success) {
      throw new Error(`Invalid retrieval configuration: ${validationResult.error.message}`);
    }

    await this.saveConfig(this.config);
    logger.info('Retrieval configuration updated successfully');
  }

  /**
   * Get prompt composition configuration section
   */
  getPromptCompositionConfig() {
    if (!this.config?.prompt_composition) {
      throw new Error('Prompt composition configuration not found');
    }
    return this.config.prompt_composition;
  }

  /**
   * Update prompt composition configuration
   */
  async updatePromptCompositionConfig(updates: Partial<AppConfig['prompt_composition']>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    if (!this.config.prompt_composition) {
      this.config.prompt_composition = PromptCompositionConfigSchema.parse({});
    }

    // Deep merge updates
    this.config.prompt_composition = this.deepMerge(this.config.prompt_composition, updates);

    // Validate the updated configuration
    const validationResult = PromptCompositionConfigSchema.safeParse(this.config.prompt_composition);
    if (!validationResult.success) {
      throw new Error(`Invalid prompt composition configuration: ${validationResult.error.message}`);
    }

    await this.saveConfig(this.config);
    logger.info('Prompt composition configuration updated successfully');
  }

  /**
   * Get review storage configuration section
   */
  getReviewStorageConfig() {
    if (!this.config?.review_storage) {
      throw new Error('Review storage configuration not found');
    }
    return this.config.review_storage;
  }

  /**
   * Update review storage configuration
   */
  async updateReviewStorageConfig(updates: Partial<AppConfig['review_storage']>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    if (!this.config.review_storage) {
      this.config.review_storage = ReviewStorageConfigSchema.parse({});
    }

    // Deep merge updates
    this.config.review_storage = this.deepMerge(this.config.review_storage, updates);

    // Validate the updated configuration
    const validationResult = ReviewStorageConfigSchema.safeParse(this.config.review_storage);
    if (!validationResult.success) {
      throw new Error(`Invalid review storage configuration: ${validationResult.error.message}`);
    }

    await this.saveConfig(this.config);
    logger.info('Review storage configuration updated successfully');
  }

  /**
   * Get configuration compatibility information
   */
  async getCompatibilityInfo() {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const issues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Basic checks for required sections
    if (!this.config.qdrant?.url) {
      issues.push('Missing qdrant.url');
    }
    if (!this.config.local_llm?.model) {
      warnings.push('local_llm.model not set; default may be used');
    }
    if (!this.config.cloud_llm?.model) {
      warnings.push('cloud_llm.model not set; default may be used');
    }
    if (!this.config.embeddings?.model) {
      warnings.push('embeddings.model not set; retrieval might be suboptimal');
    }

    // Version checks
    const schemaVersion = this.config.schema_version || '1.0.0';
    const available = new ConfigMigrationManager().getAvailableVersions();
    const latest = available[available.length - 1] || schemaVersion;
    if (schemaVersion !== latest) {
      warnings.push(`Config schema_version is ${schemaVersion}; latest is ${latest}`);
      recommendations.push('Run: code-review config-mgmt migrate');
    }

    return {
      compatible: issues.length === 0,
      warnings,
      recommendations,
      issues,
    };
  }

  /**
   * Get available migration versions
   */
  getAvailableMigrations(): string[] {
    return new ConfigMigrationManager().getAvailableVersions();
  }

  /**
   * Get migration information
   */
  getMigrationInfo(): Array<{ version: string; description: string }> {
    return new ConfigMigrationManager().getMigrationInfo();
  }

  /**
   * Deep merge utility function
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
}
