import {
  ChunkingStrategy,
  CodeChunk,
  ChunkingOptions,
  ChunkingResult,
  detectLanguageFromPath,
} from '../../types/chunking';
import { DartChunker } from './dart-chunker';
import { DartAstChunker } from './dart-ast-chunker';
import { TypeScriptChunker } from './typescript-chunker';
import { ConfigManager } from '../../config';
import logger from '../../utils/logger';

export interface ChunkingServiceConfig {
  defaultStrategy: string;
  enableFallback: boolean;
  batchSize: number;
  enableProgressReporting: boolean;
}

export interface FileChunkRequest {
  path: string;
  content: string;
  language?: string;
  options?: ChunkingOptions;
}

export interface BatchChunkRequest {
  files: FileChunkRequest[];
  globalOptions?: ChunkingOptions;
}

export class ChunkingService {
  private strategies: Map<string, ChunkingStrategy> = new Map();
  private config: ChunkingServiceConfig;
  private configManager: ConfigManager;
  private isInitialized: boolean = false;

  constructor(config: Partial<ChunkingServiceConfig> = {}) {
    this.config = {
      defaultStrategy: 'typescript-ast',
      enableFallback: true,
      batchSize: 10,
      enableProgressReporting: true,
      ...config,
    };
    this.configManager = new ConfigManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();
      this.registerStrategies();
      this.isInitialized = true;

      logger.info('ChunkingService: Initialized successfully', {
        strategiesRegistered: this.strategies.size,
        defaultStrategy: this.config.defaultStrategy,
      });

    } catch (error) {
      logger.error('ChunkingService: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private registerStrategies(): void {
    
    const chunkingConfig = this.configManager.get('chunking');

    if (chunkingConfig?.languageSpecific?.dart) {
      this.strategies.set('dart-ast-based', new DartAstChunker(chunkingConfig.languageSpecific.dart));
      this.strategies.set('dart-line-based', new DartChunker(chunkingConfig.languageSpecific.dart));
    } else {
      this.strategies.set('dart-ast-based', new DartAstChunker());
      this.strategies.set('dart-line-based', new DartChunker());
    }

    if (chunkingConfig?.languageSpecific?.typescript) {
      this.strategies.set('typescript-ast', new TypeScriptChunker(chunkingConfig.languageSpecific.typescript));
    } else {
      this.strategies.set('typescript-ast', new TypeScriptChunker());
    }

    if (chunkingConfig?.languageSpecific?.javascript) {
      this.strategies.set('javascript-ast', new TypeScriptChunker(chunkingConfig.languageSpecific.javascript));
    } else {
      this.strategies.set('javascript-ast', new TypeScriptChunker());
    }

    logger.debug('ChunkingService: Strategies registered', {
      strategies: Array.from(this.strategies.keys()),
    });
  }

  async chunkFile(
    filePath: string,
    content: string,
    options: ChunkingOptions = {}
  ): Promise<CodeChunk[]> {
    await this.initialize();

    const startTime = Date.now();
    const language = detectLanguageFromPath(filePath);

    logger.debug('ChunkingService: Processing single file', {
      filePath,
      language,
      contentLength: content.length,
    });

    try {
      const strategy = this.selectStrategy(language, filePath);
      const chunks = await strategy.chunk(content, filePath, options);

      const processingTime = Date.now() - startTime;
      logger.debug('ChunkingService: File chunked successfully', {
        filePath,
        strategy: strategy.getStrategyName(),
        chunksGenerated: chunks.length,
        processingTime,
      });

      return chunks;

    } catch (error) {
      logger.error('ChunkingService: Failed to chunk file', {
        filePath,
        language,
        error: error instanceof Error ? error.message : String(error),
      });

      if (this.config.enableFallback && language !== 'unknown') {
        logger.debug('ChunkingService: Attempting fallback chunking', { filePath });
        try {
          
          const fallbackStrategy = this.selectFallbackStrategy(language);
          const chunks = await fallbackStrategy.chunk(content, filePath, options);

          logger.info('ChunkingService: Fallback chunking successful', {
            filePath,
            fallbackStrategy: fallbackStrategy.getStrategyName(),
            chunksGenerated: chunks.length,
          });

          return chunks;

        } catch (fallbackError) {
          logger.error('ChunkingService: Fallback chunking also failed', {
            filePath,
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  async chunkFilesBatch(request: BatchChunkRequest): Promise<ChunkingResult> {
    await this.initialize();

    const startTime = Date.now();
    const { files, globalOptions = {} } = request;
    const allChunks: CodeChunk[] = [];
    const errors: Array<{ message: string; line?: number }> = [];

    logger.info('ChunkingService: Starting batch chunking', {
      fileCount: files.length,
      batchSize: this.config.batchSize,
    });

    for (let i = 0; i < files.length; i += this.config.batchSize) {
      const batch = files.slice(i, i + this.config.batchSize);

      if (this.config.enableProgressReporting) {
        const progress = Math.round(((i + batch.length) / files.length) * 100);
        logger.info('ChunkingService: Batch progress', {
          processed: i + batch.length,
          total: files.length,
          progress: `${progress}%`,
        });
      }

      const batchPromises = batch.map(async (file) => {
        try {
          const options = { ...globalOptions, ...file.options };
          const chunks = await this.chunkFile(file.path, file.content, options);
          return { chunks, file: file.path, error: null };
        } catch (error) {
          const errorMessage = `Failed to chunk ${file.path}: ${error instanceof Error ? error.message : String(error)}`;
          logger.warn('ChunkingService: File in batch failed', {
            file: file.path,
            error: errorMessage,
          });
          return { chunks: [], file: file.path, error: errorMessage };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result.error) {
          errors.push({ message: result.error });
        } else {
          allChunks.push(...result.chunks);
        }
      }
    }

    const processingTime = Date.now() - startTime;
    const totalLines = files.reduce((sum, file) => sum + file.content.split('\n').length, 0);

    const result: ChunkingResult = {
      chunks: allChunks,
      totalChunks: allChunks.length,
      totalLines,
      processingTime,
      strategy: 'batch',
      language: 'mixed',
      errors,
    };

    logger.info('ChunkingService: Batch chunking completed', {
      totalFiles: files.length,
      totalChunks: allChunks.length,
      totalLines,
      processingTime,
      errors: errors.length,
      avgChunksPerFile: files.length > 0 ? allChunks.length / files.length : 0,
      avgLinesPerChunk: allChunks.length > 0 ? totalLines / allChunks.length : 0,
    });

    return result;
  }

  private selectStrategy(language: string, filePath: string): ChunkingStrategy {
    
    const languageStrategyMap: Record<string, string> = {
      'dart': 'dart-ast-based', 
      'typescript': 'typescript-ast',
      'javascript': 'javascript-ast',
      'jsx': 'typescript-ast',
      'tsx': 'typescript-ast',
    };

    const strategyName = languageStrategyMap[language] || this.config.defaultStrategy;

    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`No chunking strategy available for language: ${language} (strategy: ${strategyName})`);
    }

    logger.debug('ChunkingService: Selected strategy', {
      filePath,
      language,
      strategy: strategyName,
      supportedLanguages: strategy.getSupportedLanguages(),
    });

    return strategy;
  }

  private selectFallbackStrategy(language: string): ChunkingStrategy {
    
    const fallbackStrategyMap: Record<string, string> = {
      'dart': 'dart-line-based', 
      'typescript': 'typescript-ast', 
      'javascript': 'javascript-ast', 
      'jsx': 'typescript-ast',
      'tsx': 'typescript-ast',
    };

    const strategyName = fallbackStrategyMap[language] || 'typescript-ast';
    const strategy = this.strategies.get(strategyName);

    if (!strategy) {
      
      const availableStrategies = Array.from(this.strategies.values()).filter(strategy => strategy !== undefined);
      if (availableStrategies.length === 0) {
        throw new Error('No chunking strategies available for fallback');
      }
      return availableStrategies[0] as ChunkingStrategy;
    }

    return strategy;
  }

  getAvailableStrategies(): Array<{ name: string; supportedLanguages: string[] }> {
    return Array.from(this.strategies.entries()).map(([name, strategy]) => ({
      name,
      supportedLanguages: strategy.getSupportedLanguages(),
    }));
  }

  getStrategyForLanguage(language: string): ChunkingStrategy | null {
    try {
      return this.selectStrategy(language, '');
    } catch {
      return null;
    }
  }

  async testChunking(
    filePath: string,
    content: string,
    options: ChunkingOptions & { strategy?: string } = {}
  ): Promise<{
    success: boolean;
    chunks: CodeChunk[];
    strategy: string;
    processingTime: number;
    error?: string;
  }> {
    await this.initialize();

    const startTime = Date.now();
    const language = detectLanguageFromPath(filePath);

    try {
      let strategy: ChunkingStrategy;

      if (options.strategy) {
        
        strategy = this.strategies.get(options.strategy) || this.selectStrategy(language, filePath);
      } else {
        
        strategy = this.selectStrategy(language, filePath);
      }

      const chunks = await strategy.chunk(content, filePath, options);
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        chunks,
        strategy: strategy.getStrategyName(),
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn('ChunkingService: Test chunking failed', {
        filePath,
        language,
        error: errorMessage,
        processingTime,
      });

      return {
        success: false,
        chunks: [],
        strategy: 'unknown',
        processingTime,
        error: errorMessage,
      };
    }
  }

  getStats(): {
    initialized: boolean;
    strategiesCount: number;
    availableStrategies: string[];
    config: ChunkingServiceConfig;
  } {
    return {
      initialized: this.isInitialized,
      strategiesCount: this.strategies.size,
      availableStrategies: Array.from(this.strategies.keys()),
      config: this.config,
    };
  }
}
