import {
  ChunkingStrategy,
  CodeChunk,
  ChunkingOptions,
  calculateChunkId,
  detectLanguageFromPath,
} from '../../types/chunking';
import logger from '../../utils/logger';

export interface GenericChunkingConfig {
  chunkSize: number;
  overlapLines: number;
  includeComments: boolean;
  preserveContext: boolean;
}

export class GenericChunker implements ChunkingStrategy {
  private config: GenericChunkingConfig;

  constructor(config: Partial<GenericChunkingConfig> = {}) {
    this.config = {
      chunkSize: 50,
      overlapLines: 5,
      includeComments: true,
      preserveContext: true,
      ...config,
    };
  }

  getSupportedLanguages(): string[] {
    return ['unknown', 'json', 'yaml', 'yml', 'md', 'txt', 'xml', 'html', 'css', 'scss', 'sass', 'less'];
  }

  getStrategyName(): string {
    return 'generic-line-based';
  }

  async chunk(
    content: string,
    filePath: string,
    options: ChunkingOptions = {}
  ): Promise<CodeChunk[]> {
    const startTime = Date.now();
    const language = detectLanguageFromPath(filePath);

    logger.debug('GenericChunker: Starting chunking', {
      filePath,
      language,
      contentLength: content.length,
    });

    try {
      const lines = content.split('\n');
      const chunks: CodeChunk[] = [];
      const chunkSize = options.maxChunkSize || this.config.chunkSize;
      const overlapLines = options.overlapLines || this.config.overlapLines;

      let currentLine = 0;
      let chunkIndex = 0;

      while (currentLine < lines.length) {
        const chunkStart = Math.max(0, currentLine - (chunkIndex > 0 ? overlapLines : 0));
        const chunkEnd = Math.min(lines.length, chunkStart + chunkSize);

        const chunkLines = lines.slice(chunkStart, chunkEnd);
        const chunkContent = chunkLines.join('\n');

        if (chunkContent.trim().length > 0) {
          const chunk: CodeChunk = {
            id: calculateChunkId(filePath, chunkStart + 1, chunkEnd),
            content: chunkContent,
            language: language === 'unknown' ? 'text' : language,
            startLine: chunkStart + 1,
            endLine: chunkEnd,
            chunkType: 'statement',
            complexityScore: this.calculateComplexity(chunkLines),
            filePath,
            dependencies: this.extractDependencies(chunkLines, language),
            metadata: {
              lineCount: chunkLines.length,
              hasComments: this.hasComments(chunkLines),
              strategy: this.getStrategyName(),
              astBased: false,
            },
          };

          chunks.push(chunk);
          chunkIndex++;
        }

        currentLine = chunkEnd;

        if (currentLine >= lines.length) {
          break;
        }
      }

      const processingTime = Date.now() - startTime;
      logger.debug('GenericChunker: Chunking completed', {
        filePath,
        chunksGenerated: chunks.length,
        processingTime,
      });

      return chunks;

    } catch (error) {
      logger.error('GenericChunker: Failed to chunk file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private calculateComplexity(lines: string[]): number {
    let score = 0;
    const content = lines.join('\n');

    // Count control structures
    const controlStructures = (content.match(/\b(if|for|while|do|switch|try|catch|else|elif)\b/g) || []).length;
    score += controlStructures * 2;

    // Count functions/methods
    const functions = (content.match(/\bfunction\b|\b=>\b|function\s*\(|\bdef\b|\bclass\b|\binterface\b/g) || []).length;
    score += functions * 3;

    // Count operators
    const operators = (content.match(/[\+\-\*\/\%\=\<\>\&\^\|\!\~\?]+/g) || []).length;
    score += Math.floor(operators / 3);

    // Count nested structures
    const nested = (content.match(/[\{\[\(]/g) || []).length;
    score += Math.floor(nested / 2);

    return Math.max(1, score);
  }

  private extractDependencies(lines: string[], language: string): string[] {
    const dependencies: string[] = [];
    const content = lines.join('\n');

    // JSON dependencies
    if (language === 'json' || language === 'unknown') {
      const jsonMatches = content.match(/"([^"]+)":\s*"[^"]*"/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          const dep = match.match(/"([^"]+)":\s*"[^"]*"/);
          if (dep && dep[1] && (dep[1].includes('@') || dep[1].includes('/'))) {
            dependencies.push(dep[1]);
          }
        }
      }
    }

    // Import statements
    const importMatches = content.match(/import\s+['"]([^'"]+)['"]/g);
    if (importMatches) {
      for (const match of importMatches) {
        const dep = match.match(/import\s+['"]([^'"]+)['"]/);
        if (dep && dep[1]) {
          dependencies.push(dep[1]);
        }
      }
    }

    // Require statements
    const requireMatches = content.match(/require\s*\(\s*['"]([^'"]+)['"]/g);
    if (requireMatches) {
      for (const match of requireMatches) {
        const dep = match.match(/require\s*\(\s*['"]([^'"]+)['"]/);
        if (dep && dep[1]) {
          dependencies.push(dep[1]);
        }
      }
    }

    return [...new Set(dependencies)];
  }

  private hasComments(lines: string[]): boolean {
    return lines.some(line =>
      line.trim().startsWith('//') ||
      line.trim().startsWith('*') ||
      line.trim().startsWith('/*') ||
      line.trim().startsWith('#') ||
      line.trim().startsWith('<!--')
    );
  }
}
