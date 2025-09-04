import { AnthropicService, AnthropicOptions, AnthropicResponse } from './anthropic-service';
import {
  parseCodeReviewResponse,
  parseCommitReviewResponse,
  CodeReview,
  CommitReview,
  cleanResponseText,
  getValidationErrors,
  CodeReviewSchema
} from '../utils/json-extraction';
import { ConfigManager } from '../config';
import { ComposedPrompt } from '../types/prompt';
import logger from '../utils/logger';

export interface CloudReviewOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  systemPrompt?: string; // handled by prompt composer
  retry?: number;
}

export interface CloudReviewResult {
  review: CodeReview | CommitReview;
  rawResponse: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  processingTime: number;
  validationErrors?: string[];
}

export interface BatchReviewOptions extends CloudReviewOptions {
  maxConcurrent?: number;
  retryFailed?: boolean;
  retryDelay?: number;
}

export class CloudReviewService {
  private anthropicService: AnthropicService;
  private configManager: ConfigManager;
  private isInitialized: boolean = false;

  constructor() {
    this.anthropicService = new AnthropicService();
    this.configManager = new ConfigManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();
      await this.anthropicService.initialize();
      this.isInitialized = true;
      logger.info('CloudReviewService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize CloudReviewService', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private extractJson(text: string): string {
    // Try fenced code block first
    const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (fence && fence[1]) return fence[1].trim();
    // Try first JSON object
    const obj = text.match(/\{[\s\S]*\}/);
    if (obj) return obj[0];
    return text; // fallback
  }

  private async callAnthropic(promptText: string, opts: AnthropicOptions, retries: number = 2): Promise<AnthropicResponse> {
    let attempt = 0;
    let delay = 500;
    while (true) {
      try {
        return await this.anthropicService.generateReview(promptText, opts);
      } catch (e) {
        attempt++;
        if (attempt > retries) throw e;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  async reviewCode(composedPrompt: ComposedPrompt, options: CloudReviewOptions = {}): Promise<CloudReviewResult> {
    await this.initialize();

    const startTime = Date.now();

    try {
      const config = this.configManager.get('cloud_llm');
      if (!config) throw new Error('Cloud LLM configuration not found');

      const reviewOptions: AnthropicOptions = {
        model: options.model || config.model || 'claude-3-5-haiku-20241022',
        maxTokens: options.maxTokens || config.max_tokens || 4096,
        temperature: options.temperature || config.temperature || 0.1,
        timeout: options.timeout || config.timeout || 30000,
      };

      if (!this.anthropicService.isValidModel(reviewOptions.model)) {
        logger.warn('Invalid model specified, using default', {
          requested: reviewOptions.model,
          default: 'claude-3-5-haiku-20241022'
        });
        reviewOptions.model = 'claude-3-5-haiku-20241022';
      }

      const response = await this.callAnthropic(composedPrompt.text, reviewOptions, options.retry ?? 2);
      const processingTime = Date.now() - startTime;

      const cleanedResponse = cleanResponseText(response.content);
      const extracted = this.extractJson(cleanedResponse);
      const review = parseCodeReviewResponse(extracted);

      if (!review) {
        const validationErrors = getValidationErrors(extracted, CodeReviewSchema);
        logger.error('Failed to parse code review response', {
          validationErrors,
          responsePreview: cleanedResponse.substring(0, 500) + '...',
        });
        throw new Error('Failed to parse valid code review from AI response');
      }

      return {
        review,
        rawResponse: response.content,
        usage: response.usage,
        model: response.model,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('CloudReviewService: Code review failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });
      throw error;
    }
  }

  async reviewCommit(composedPrompt: ComposedPrompt, options: CloudReviewOptions = {}): Promise<CloudReviewResult> {
    await this.initialize();

    const startTime = Date.now();

    try {
      const config = this.configManager.get('cloud_llm');
      if (!config) throw new Error('Cloud LLM configuration not found');

      const reviewOptions: AnthropicOptions = {
        model: options.model || config.model || 'claude-3-5-haiku-20241022',
        maxTokens: options.maxTokens || config.max_tokens || 4096,
        temperature: options.temperature || config.temperature || 0.1,
        timeout: options.timeout || config.timeout || 30000,
      };

      const response = await this.callAnthropic(composedPrompt.text, reviewOptions, options.retry ?? 2);
      const processingTime = Date.now() - startTime;

      const cleanedResponse = cleanResponseText(response.content);
      const extracted = this.extractJson(cleanedResponse);
      const review = parseCommitReviewResponse(extracted);

      if (!review) {
        logger.error('Failed to parse commit review response', {
          responsePreview: cleanedResponse.substring(0, 500) + '...',
        });
        throw new Error('Failed to parse valid commit review from AI response');
      }

      return {
        review,
        rawResponse: response.content,
        usage: response.usage,
        model: response.model,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('CloudReviewService: Commit review failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });
      throw error;
    }
  }

  async batchReviewCode(
    composedPrompts: ComposedPrompt[],
    options: BatchReviewOptions = {}
  ): Promise<CloudReviewResult[]> {
    await this.initialize();

    const {
      maxConcurrent = 3,
      retryFailed = true,
      retryDelay = 1000,
      ...reviewOptions
    } = options;

    const results: CloudReviewResult[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    logger.info('CloudReviewService: Starting batch review', {
      promptCount: composedPrompts.length,
      maxConcurrent,
      retryFailed,
    });

    for (let i = 0; i < composedPrompts.length; i += maxConcurrent) {
      const batch = composedPrompts.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(async (prompt, batchIndex) => {
        const globalIndex = i + batchIndex;

        try {
          const result = await this.reviewCode(prompt, reviewOptions);
          return { index: globalIndex, result };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));

          if (retryFailed) {
            logger.warn('Batch review item failed, will retry', {
              index: globalIndex,
              error: err.message,
            });

            await new Promise(resolve => setTimeout(resolve, retryDelay));

            try {
              const result = await this.reviewCode(prompt, reviewOptions);
              return { index: globalIndex, result };
            } catch (retryError) {
              const retryErr = retryError instanceof Error ? retryError : new Error(String(retryError));
              logger.error('Batch review retry failed', {
                index: globalIndex,
                originalError: err.message,
                retryError: retryErr.message,
              });
              return { index: globalIndex, error: retryErr };
            }
          } else {
            return { index: globalIndex, error: err };
          }
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const batchResult of batchResults) {
        if (batchResult.result) {
          results[batchResult.index] = batchResult.result;
        } else if (batchResult.error) {
          errors.push({ index: batchResult.index, error: batchResult.error });
        }
      }
    }

    logger.info('CloudReviewService: Batch review completed', {
      successful: results.filter(r => r !== undefined).length,
      failed: errors.length,
      total: composedPrompts.length,
    });

    if (errors.length > 0) {
      logger.warn('Batch review had failures', {
        errors: errors.map(e => ({ index: e.index, message: e.error.message })),
      });
    }

    return results;
  }

  isReady(): boolean {
  return this.isInitialized && this.anthropicService.isReady();
  }
}

