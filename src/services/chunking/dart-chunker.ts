import {
  ChunkingStrategy,
  CodeChunk,
  ChunkingOptions,
  calculateChunkId,
  detectLanguageFromPath,
} from '../../types/chunking';
import { validateDartChunkingConfig } from '../../schemas/chunking';
import logger from '../../utils/logger';

export interface DartChunkingConfig {
  chunkSize: number;
  overlapLines: number;
  respectBoundaries: boolean;
  includeComments: boolean;
  preserveContext: boolean;
  minFunctionSize: number;
}

export class DartChunker implements ChunkingStrategy {
  private config: DartChunkingConfig;

  constructor(config: Partial<DartChunkingConfig> = {}) {
    this.config = validateDartChunkingConfig(config);
  }

  getSupportedLanguages(): string[] {
    return ['dart'];
  }

  getStrategyName(): string {
    return 'dart-line-based';
  }

  async chunk(
    content: string,
    filePath: string,
    options: ChunkingOptions = {}
  ): Promise<CodeChunk[]> {
    const startTime = Date.now();
    const lines = content.split('\n');

    logger.debug('DartChunker: Starting chunking', {
      filePath,
      totalLines: lines.length,
      chunkSize: this.config.chunkSize,
    });

    try {
      
      const detectedLanguage = detectLanguageFromPath(filePath);
      if (detectedLanguage !== 'dart') {
        logger.warn('DartChunker: File does not appear to be Dart', {
          filePath,
          detectedLanguage,
        });
      }

      const chunks = this.createLineBasedChunks(lines, filePath, options);

      const processingTime = Date.now() - startTime;
      logger.debug('DartChunker: Chunking completed', {
        filePath,
        chunksGenerated: chunks.length,
        processingTime,
      });

      return chunks;

    } catch (error) {
      logger.error('DartChunker: Failed to chunk file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private createLineBasedChunks(
    lines: string[],
    filePath: string,
    options: ChunkingOptions = {}
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const chunkSize = options.maxChunkSize || this.config.chunkSize;
    const overlapLines = options.overlapLines || this.config.overlapLines;

    let currentLine = 0;
    let chunkIndex = 0;

    while (currentLine < lines.length) {
      const chunkStart = Math.max(0, currentLine - (chunkIndex > 0 ? overlapLines : 0));
      let chunkEnd = Math.min(lines.length, chunkStart + chunkSize);

      if (this.config.respectBoundaries) {
        chunkEnd = this.findOptimalChunkEnd(lines, chunkStart, chunkEnd);
      }

      if (chunkEnd <= chunkStart) {
        chunkEnd = Math.min(lines.length, chunkStart + chunkSize);
      }

      const chunkLines = lines.slice(chunkStart, chunkEnd);
      const chunkContent = chunkLines.join('\n');

      if (chunkContent.trim().length > 0) {
        const chunk: CodeChunk = {
          id: calculateChunkId(filePath, chunkStart + 1, chunkEnd),
          content: chunkContent,
          language: 'dart',
          startLine: chunkStart + 1,
          endLine: chunkEnd,
          chunkType: this.determineChunkType(chunkLines, chunkStart),
          complexityScore: this.calculateComplexity(chunkLines),
          dependencies: this.extractDependencies(chunkLines),
          filePath,
          metadata: {
            lineCount: chunkLines.length,
            hasComments: this.hasComments(chunkLines),
            hasFunctions: this.hasFunctions(chunkLines),
            hasClasses: this.hasClasses(chunkLines),
            strategy: this.getStrategyName(),
          },
        };

        chunks.push(chunk);
        chunkIndex++;
      }

      currentLine = chunkEnd;

      if (currentLine >= lines.length) {
        break;
      }

      if (chunkEnd <= chunkStart) {
        currentLine = Math.min(lines.length, currentLine + 1);
      }
    }

    return chunks;
  }

  private findOptimalChunkEnd(lines: string[], start: number, maxEnd: number): number {
    
    for (let i = maxEnd - 1; i >= start; i--) {
      const line = lines[i]?.trim() || '';

      if (this.isGoodBoundary(line)) {
        return i + 1; 
      }
    }

    for (let i = maxEnd - 1; i >= start; i--) {
      const line = lines[i]?.trim() || '';

      if (this.isBadCut(line)) {
        
        for (let j = i - 1; j >= start; j--) {
          if (this.isGoodBoundary(lines[j]?.trim() || '')) {
            return j + 1;
          }
        }
        
        return i;
      }
    }

    return maxEnd;
  }

  private isGoodBoundary(line: string): boolean {
    
    if (line.length === 0) {
      return true;
    }

    if (line === '}' || line === '});' || line === '})') {
      return true;
    }

    if (line.startsWith('import ') || line.startsWith('export ')) {
      return true;
    }

    if (line.match(/^(const|var|final|late)\s+\w+/) && !line.includes('=')) {
      return true;
    }

    if (line.match(/^(class|abstract class|enum|typedef)\s+\w+/) ||
        line.match(/^(Future<.*>|void|bool|String|int|double|dynamic)\s+\w+\s*\(/)) {
      return true;
    }

    return false;
  }

  private isBadCut(line: string): boolean {

    if (line.includes('(') && !line.includes(')') && !line.includes(';')) {
      return true;
    }

    if (line.includes('?.') || line.includes('??') || line.includes('&&') || line.includes('||')) {
      return true;
    }

    if ((line.includes('"""') || line.includes("'''")) && !line.endsWith('"""') && !line.endsWith("'''")) {
      return true;
    }

    if (line.match(/\b(if|for|while|do)\s*\([^)]*$/) && !line.includes('{')) {
      return true;
    }

    return false;
  }

  private determineChunkType(lines: string[], _startLine: number): CodeChunk['chunkType'] {
    const content = lines.join('\n');

    if (content.match(/\b\w+\s*\([^)]*\)\s*\{/)) {
      return 'function';
    }

    if (content.match(/\bclass\s+\w+/) || content.match(/\babstract\s+class\s+\w+/)) {
      return 'class';
    }

    if (content.match(/\b(import|export)\s/)) {
      return 'module';
    }

    if (content.includes('{') && content.includes('}')) {
      return 'block';
    }

    return 'statement';
  }

  private calculateComplexity(lines: string[]): number {
    let score = 0;
    const content = lines.join('\n');

    const controlStructures = (content.match(/\b(if|for|while|do|switch|try|catch)\b/g) || []).length;
    score += controlStructures * 2;

    const functions = (content.match(/\b\w+\s*\([^)]*\)\s*\{/g) || []).length;
    score += functions * 3;

    const classes = (content.match(/\bclass\s+\w+/g) || []).length;
    score += classes * 5;

    const operators = (content.match(/[\+\-\*\/\%\=\<\>\&\^\|\!\~\?]+/g) || []).length;
    score += Math.floor(operators / 3);

    return Math.max(1, score);
  }

  private extractDependencies(lines: string[]): string[] {
    const dependencies: string[] = [];
    const content = lines.join('\n');

    const importMatches = content.match(/import\s+['"]([^'"]+)['"]/g);
    if (importMatches) {
      for (const match of importMatches) {
        const dep = match.match(/import\s+['"]([^'"]+)['"]/);
        if (dep && dep[1]) {
          dependencies.push(dep[1]);
        }
      }
    }

    const packageMatches = content.match(/(?:dart|package):[\w\/]+/g);
    if (packageMatches) {
      dependencies.push(...packageMatches);
    }

    return [...new Set(dependencies)]; 
  }

  private hasComments(lines: string[]): boolean {
    return lines.some(line => line.trim().startsWith('//') || line.trim().startsWith('/*'));
  }

  private hasFunctions(lines: string[]): boolean {
    const content = lines.join('\n');
    return /\b\w+\s*\([^)]*\)\s*\{/.test(content);
  }

  private hasClasses(lines: string[]): boolean {
    const content = lines.join('\n');
    return /\bclass\s+\w+/.test(content);
  }
}
