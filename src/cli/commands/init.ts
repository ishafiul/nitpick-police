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
    await testService.initialize();
    const response = await testService.generateReview('test', { model: 'claude-3-5-haiku-20241022', maxTokens: 10 });
    return typeof response.content === 'string' && response.content.length > 0;
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
    .action(async (options: any) => {
      try {
        const baseDir = path.join(process.cwd(), '.code_review');
        fs.mkdirSync(baseDir, { recursive: true });
        fs.mkdirSync(path.join(baseDir, 'reviews'), { recursive: true });
        fs.mkdirSync(path.join(baseDir, 'logs'), { recursive: true });

        const configManager = new ConfigManager();

        if (options.anthropicKey && !options.skipValidation) {
          logInfo(chalk.blue('🔐 Validating Anthropic API key...'));
          const isValid = await validateAnthropicKey(options.anthropicKey);
          if (!isValid) {
            throw new Error('Invalid Anthropic API key - validation failed');
          }
          logInfo(chalk.green('✅ API key validated successfully'));
        }

        const config: any = {
          version: '1.0.0',
          schema_version: '1.0.0',
          environment: options.environment || 'development',
          cloudEnabled: !options.disableCloud,

          local_llm: {
            provider: 'ollama',
            model: options.ollamaModel || 'llama2',
            embedding_model: 'nomic-embed-text',
            temperature: 0.1,
            max_tokens: 2048,
            timeout: 30000,
            base_url: options.ollamaUrl || 'http://localhost:11434',
          },

          cloud_llm: {
            provider: 'anthropic',
            model: 'claude-3-5-haiku-20241022',
            temperature: 0.1,
            max_tokens: 4096,
            timeout: 30000,
            api_key: options.anthropicKey || '',
          },

          qdrant: {
            url: options.qdrantUrl || 'http://localhost:6333',
            collections: {
              code_chunks: 'code_chunks',
              review_insights: 'review_insights',
              prompts: 'prompts',
              cloud_responses: 'cloud_responses',
            },
            vector_dimension: 768,
            distance_metric: 'cosine',
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
