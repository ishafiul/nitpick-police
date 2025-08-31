import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../../config';
import { logInfo, logError } from '../../utils';
import { AnthropicService } from '../../services';

async function validateAnthropicKey(_key: string): Promise<boolean> {
  try {
    const testService = new AnthropicService();
    // Test with a minimal prompt
    const response = await testService.generateReview('test', { model: 'claude-instant', maxTokens: 10 });
    return typeof response === 'string' && response.length > 0;
  } catch {
    return false;
  }
}

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize code review configuration')
    .option('--anthropic-key <key>', 'Set Anthropic API key for cloud LLM reviews')
    .option('--ollama-model <model>', 'Set Ollama model for local LLM (default: llama2)', 'llama2')
    .option('--ollama-url <url>', 'Set Ollama base URL (default: http://localhost:11434)', 'http://localhost:11434')
    .option('--qdrant-url <url>', 'Set Qdrant database URL (default: http://localhost:6333)', 'http://localhost:6333')
    .option('--environment <env>', 'Set environment (development, staging, production)', 'development')
    .option('--disable-cloud', 'Disable cloud review features')
    .option('--skip-validation', 'Skip API key validation (not recommended)')
    .option('--interactive', 'Run interactive setup for all configuration options')
    .action(async (options) => {
      try {
        // Create .code_review directory structure
        const baseDir = path.join(process.cwd(), '.code_review');
        fs.mkdirSync(baseDir, { recursive: true });
        fs.mkdirSync(path.join(baseDir, 'reviews'), { recursive: true });
        fs.mkdirSync(path.join(baseDir, 'logs'), { recursive: true });

        const configManager = new ConfigManager();
        
        // Validate API key if provided
        if (options.anthropicKey && !options.skipValidation) {
          logInfo(chalk.blue('🔐 Validating Anthropic API key...'));
          const isValid = await validateAnthropicKey(options.anthropicKey);
          if (!isValid) {
            throw new Error('Invalid Anthropic API key - validation failed');
          }
          logInfo(chalk.green('✅ API key validated successfully'));
        }
        
        // Initialize minimal demo config with dual LLM setup
        const config: any = {
          version: '1.0.0',
          environment: options.environment || 'development',
          cloudEnabled: !options.disableCloud,

          // Local LLM Configuration (Ollama)
          local_llm: {
            provider: 'ollama',
            model: options.ollamaModel || 'llama2',
            embedding_model: 'nomic-embed-text',
            temperature: 0.1,
            max_tokens: 2048,
            timeout: 30000,
            base_url: options.ollamaUrl || 'http://localhost:11434',
          },

          // Cloud LLM Configuration (Anthropic)
          cloud_llm: {
            provider: 'anthropic',
            model: 'claude-3-sonnet-20240229',
            temperature: 0.1,
            max_tokens: 4096,
            timeout: 30000,
            api_key: options.anthropicKey || '',
          },

          // Qdrant Vector Database Configuration
          qdrant: {
            url: options.qdrantUrl || 'http://localhost:6333',
            collection_name: 'code_review',
            dimension: 768,
            distance_metric: 'cosine',
          },

          // Basic Review Configuration
          review: {
            severity_levels: ['low', 'medium', 'high', 'critical'],
            categories: ['security', 'performance', 'style', 'bug'],
            max_comments_per_file: 20,
            max_file_changes: 50,
          },

          // Basic Git Configuration
          git: {
            exclude_patterns: ['node_modules/**', 'dist/**', '*.log', '.git/**'],
            include_patterns: ['**/*.ts', '**/*.js', '**/*.py'],
            max_file_size_kb: 500,
          },

          // Basic Logging
          logging: {
            level: 'info',
            log_directory: '.code_review/logs',
          },
        };

        
        configManager.setConfig(config);

        logInfo(chalk.green(`✅ Successfully initialized code review in ${baseDir}`));
        if (options.anthropicKey) {
          logInfo(chalk.blue('ℹ Cloud review features enabled with validated Anthropic key'));
        } else if (options.disableCloud) {
          logInfo(chalk.yellow('⚠ Cloud features disabled - run with --anthropic-key to enable'));
        }
      } catch (error) {
        logError('Initialization failed', error as Error);
        process.exit(1);
      }
    });
}
