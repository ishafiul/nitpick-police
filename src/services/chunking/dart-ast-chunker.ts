import {
  ChunkingStrategy,
  CodeChunk,
  ChunkingOptions,
  calculateChunkId,
  detectLanguageFromPath,
} from '../../types/chunking';

import logger from '../../utils/logger';

export interface DartAstChunkingConfig {
  chunkSize: number;
  overlapLines: number;
  respectBoundaries: boolean;
  includeComments: boolean;
  preserveContext: boolean;
  minFunctionSize: number;
  maxChunkSize: number;
  prioritizeFunctions: boolean;
  prioritizeClasses: boolean;
}

export interface DartAstNode {
  type: string;
  name?: string;
  startLine: number;
  endLine: number;
  content: string;
  children?: DartAstNode[];
  dependencies?: string[];
  complexity: number;
}

export class DartAstChunker implements ChunkingStrategy {
  private config: DartAstChunkingConfig;

  constructor(config: Partial<DartAstChunkingConfig> = {}) {
    this.config = {
      chunkSize: 50,
      overlapLines: 5,
      respectBoundaries: true,
      includeComments: true,
      preserveContext: true,
      minFunctionSize: 5,
      maxChunkSize: 100,
      prioritizeFunctions: true,
      prioritizeClasses: true,
      ...config,
    };
  }

  getSupportedLanguages(): string[] {
    return ['dart'];
  }

  getStrategyName(): string {
    return 'dart-ast-based';
  }

  async chunk(
    content: string,
    filePath: string,
    options: ChunkingOptions = {}
  ): Promise<CodeChunk[]> {
    const startTime = Date.now();

    logger.debug('DartAstChunker: Starting AST-based chunking', {
      filePath,
      contentLength: content.length,
    });

    try {
      
      const detectedLanguage = detectLanguageFromPath(filePath);
      if (detectedLanguage !== 'dart') {
        logger.warn('DartAstChunker: File does not appear to be Dart', {
          filePath,
          detectedLanguage,
        });
      }

      const astNodes = this.parseDartAst(content);

      const chunks = this.createChunksFromAst(astNodes, filePath, options);

      const processingTime = Date.now() - startTime;
      logger.debug('DartAstChunker: Chunking completed', {
        filePath,
        chunksGenerated: chunks.length,
        processingTime,
      });

      return chunks;

    } catch (error) {
      logger.error('DartAstChunker: Failed to chunk file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private parseDartAst(content: string): DartAstNode[] {
    const lines = content.split('\n');
    const nodes: DartAstNode[] = [];

    let currentLine = 0;
    while (currentLine < lines.length) {
      const remainingLines = lines.slice(currentLine);
      const node = this.parseNextNode(remainingLines, currentLine);

      if (node) {
        nodes.push(node);
        currentLine = node.endLine;
      } else {
        currentLine++;
      }
    }

    return nodes;
  }

  private parseNextNode(lines: string[], startLine: number): DartAstNode | null {
    const content = lines.join('\n');

    const classMatch = this.findClassDefinition(content, startLine);
    if (classMatch) {
      return classMatch;
    }

    const functionMatch = this.findFunctionDefinition(content, startLine);
    if (functionMatch) {
      return functionMatch;
    }

    const moduleMatch = this.findModuleStatements(content, startLine);
    if (moduleMatch) {
      return moduleMatch;
    }

    const otherMatch = this.findOtherConstructs(content, startLine);
    if (otherMatch) {
      return otherMatch;
    }

    return null;
  }

  private findClassDefinition(content: string, startLine: number): DartAstNode | null {
    
    const classRegex = /(?:^|\n)\s*(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+(?:\s+implements\s+[\w\s,]+)?|\s+implements\s+[\w\s,]+)?\s*\{([\s\S]*?)\n\}/;
    const match = classRegex.exec(content);

    if (!match) return null;

    const className = match[1];
    const classContent = match[0];
    const classLines = classContent.split('\n');
    const endLine = startLine + classLines.length;

    const members = this.parseClassMembers(classContent, startLine);

    return {
      type: 'class',
      name: className || 'AnonymousClass',
      startLine,
      endLine,
      content: classContent.trim(),
      children: members,
      dependencies: this.extractClassDependencies(classContent),
      complexity: this.calculateClassComplexity(classContent),
    };
  }

  private findFunctionDefinition(content: string, startLine: number): DartAstNode | null {
    
    const functionRegex = /(?:^|\n)\s*(?:static\s+)?(?:async\s+)?(?:Future(?:<[\w\s,<>]+>)?\s+|void\s+|[\w<>]+\s+)?(\w+)\s*\(([^)]*)\)\s*(?:async)?\s*\{([\s\S]*?)\n\}/;
    const match = functionRegex.exec(content);

    if (!match) return null;

    const functionName = match[2];
    const params = match[3];
    const functionContent = match[0];
    const functionLines = functionContent.split('\n');
    const endLine = startLine + functionLines.length;

    return {
      type: 'function',
      name: functionName || 'AnonymousFunction',
      startLine,
      endLine,
      content: functionContent.trim(),
      dependencies: this.extractFunctionDependencies(functionContent, params || ''),
      complexity: this.calculateFunctionComplexity(functionContent),
    };
  }

  private findModuleStatements(content: string, startLine: number): DartAstNode | null {
    const lines = content.split('\n');
    const moduleLines: string[] = [];
    let currentLineIndex = 0;

    while (currentLineIndex < lines.length) {
      const line = lines[currentLineIndex]?.trim() || '';
      if (line.startsWith('import ') || line.startsWith('export ')) {
        moduleLines.push(line);
        currentLineIndex++;
      } else {
        break;
      }
    }

    if (moduleLines.length === 0) return null;

    const moduleContent = moduleLines.join('\n');
    const endLine = startLine + moduleLines.length;

    return {
      type: 'module',
      startLine,
      endLine,
      content: moduleContent,
      dependencies: this.extractModuleDependencies(moduleLines),
      complexity: 1,
    };
  }

  private findOtherConstructs(content: string, startLine: number): DartAstNode | null {
    
    const enumRegex = /(?:^|\n)\s*enum\s+(\w+)\s*\{([^}]*)\}/;
    const enumMatch = enumRegex.exec(content);
    if (enumMatch) {
      const enumName = enumMatch[1];
      const enumContent = enumMatch[0];
      const enumLines = enumContent.split('\n');
      const endLine = startLine + enumLines.length;

      return {
        type: 'enum',
        name: enumName || 'AnonymousEnum',
        startLine,
        endLine,
        content: enumContent.trim(),
        complexity: enumContent.split(',').length,
      };
    }

    const typedefRegex = /(?:^|\n)\s*typedef\s+([\w<>]+)\s*=\s*([^;]+);/;
    const typedefMatch = typedefRegex.exec(content);
    if (typedefMatch) {
      const typedefName = typedefMatch[1];
      const typedefContent = typedefMatch[0];
      const typedefLines = typedefContent.split('\n');
      const endLine = startLine + typedefLines.length;

      return {
        type: 'typedef',
        name: typedefName || 'AnonymousTypedef',
        startLine,
        endLine,
        content: typedefContent.trim(),
        complexity: 2,
      };
    }

    return null;
  }

  private parseClassMembers(classContent: string, startLine: number): DartAstNode[] {
    const members: DartAstNode[] = [];
    const lines = classContent.split('\n');
    let currentLineIndex = 1; 

    while (currentLineIndex < lines.length - 1) { 
      const remainingLines = lines.slice(currentLineIndex);
      const remainingContent = remainingLines.join('\n');

      const methodMatch = this.findFunctionDefinition(remainingContent, startLine + currentLineIndex);
      if (methodMatch) {
        members.push(methodMatch);
        currentLineIndex += methodMatch.endLine - methodMatch.startLine;
      } else {
        currentLineIndex++;
      }
    }

    return members;
  }

  private extractClassDependencies(classContent: string): string[] {
    const dependencies: string[] = [];

    const extendsMatch = classContent.match(/extends\s+(\w+)/);
    if (extendsMatch && extendsMatch[1]) {
      dependencies.push(extendsMatch[1]);
    }

    const implementsMatch = classContent.match(/implements\s+([\w\s,]+)/);
    if (implementsMatch && implementsMatch[1]) {
      dependencies.push(...implementsMatch[1].split(',').map(s => s.trim()));
    }

    return dependencies;
  }

  private extractFunctionDependencies(functionContent: string, params: string): string[] {
    const dependencies: string[] = [];

    const paramTypes = params.match(/(\w+)(?:\s+\w+)/g);
    if (paramTypes) {
      const paramTypeNames = paramTypes
        .map(p => p.split(' ')[0])
        .filter((type): type is string => Boolean(type));
      dependencies.push(...paramTypeNames);
    }

    const returnTypeMatch = functionContent.match(/Future<(\w+)>/);
    if (returnTypeMatch && returnTypeMatch[1]) {
      dependencies.push(returnTypeMatch[1]);
    }

    return dependencies;
  }

  private extractModuleDependencies(lines: string[]): string[] {
    const dependencies: string[] = [];

    for (const line of lines) {
      
      const packageMatches = line.match(/(?:dart|package):[\w\/]+/g);
      if (packageMatches) {
        dependencies.push(...packageMatches);
      }

      const importMatch = line.match(/import\s+['"]([^'"]+)['"]/);
      if (importMatch && importMatch[1]) {
        dependencies.push(importMatch[1]);
      }
    }

    return dependencies;
  }

  private calculateClassComplexity(classContent: string): number {
    let complexity = 5; 

    const methodMatches = classContent.match(/\w+\s*\([^)]*\)\s*\{/g);
    if (methodMatches) {
      complexity += methodMatches.length * 2;
    }

    const fieldMatches = classContent.match(/(?:final|var|const|late)\s+\w+/g);
    if (fieldMatches) {
      complexity += fieldMatches.length;
    }

    return complexity;
  }

  private calculateFunctionComplexity(functionContent: string): number {
    let complexity = 2; 

    const controlMatches = functionContent.match(/\b(if|for|while|do|switch|try|catch)\b/g);
    if (controlMatches) {
      complexity += controlMatches.length;
    }

    const operatorMatches = functionContent.match(/[\+\-\*\/\%\=\<\>\&\^\|\!\~\?]+/g);
    if (operatorMatches) {
      complexity += Math.floor(operatorMatches.length / 3);
    }

    return Math.max(1, complexity);
  }

  private createChunksFromAst(
    nodes: DartAstNode[],
    filePath: string,
    options: ChunkingOptions
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (const node of nodes) {
      if (this.shouldCreateSeparateChunk(node, options)) {
        
        const chunk = this.createChunkFromNode(node, filePath);
        chunks.push(chunk);
      }
    }

    if (chunks.length < 2) {
      logger.debug('DartAstChunker: Falling back to line-based chunking due to low AST node count');
      
    }

    return chunks;
  }

  private shouldCreateSeparateChunk(node: DartAstNode, options: ChunkingOptions): boolean {
    
    if (node.type === 'class') {
      return this.config.prioritizeClasses;
    }

    if (node.type === 'function') {
      const minSize = options.minChunkSize || this.config.minFunctionSize;
      return node.content.split('\n').length >= minSize && this.config.prioritizeFunctions;
    }

    if (node.type === 'module') {
      return true;
    }

    return false;
  }

  private createChunkFromNode(node: DartAstNode, filePath: string): CodeChunk {
    return {
      id: calculateChunkId(filePath, node.startLine + 1, node.endLine),
      content: node.content,
      language: 'dart',
      startLine: node.startLine + 1,
      endLine: node.endLine,
      chunkType: node.type as CodeChunk['chunkType'],
      complexityScore: node.complexity,
      dependencies: node.dependencies || [],
      filePath,
      metadata: {
        lineCount: node.endLine - node.startLine,
        hasComments: node.content.includes('/*') || node.content.includes('//'),
        hasFunctions: node.type === 'function' || (node.children?.some(c => c.type === 'function') ?? false),
        hasClasses: node.type === 'class',
        strategy: this.getStrategyName(),
        astNodeType: node.type,
        astNodeName: node.name,
      },
    };
  }
}
