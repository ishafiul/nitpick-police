import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import logger from '../utils/logger';
import {
  AppConfigSchema,
  AppConfig,
  EnvVarMapping,
} from './schemas';

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
    if (config.git.exclude_merge_commits && config.git.include_merge_commits) {
      result.warnings.push('Both exclude_merge_commits and include_merge_commits are enabled');
    }

    // Check for reasonable performance settings
    if (config.performance.max_memory_usage_mb > 4096) {
      result.warnings.push('High memory usage setting detected (>4GB)');
    }

    // Check for security concerns
    if (config.integrations.github.enabled && !config.integrations.github.api_token) {
      result.warnings.push('GitHub integration enabled but no API token provided');
    }

    // Check for backup settings
    if (config.backup.enabled && config.backup.encryption && !config.backup.encryption_key) {
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
}
