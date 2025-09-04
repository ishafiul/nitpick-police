import * as ts from 'typescript';
import {
  ChunkingStrategy,
  CodeChunk,
  ChunkingOptions,
  calculateChunkId,
  detectLanguageFromPath,
} from '../../types/chunking';
import { validateTypeScriptChunkingConfig } from '../../schemas/chunking';
import logger from '../../utils/logger';

export interface TypeScriptChunkingConfig {
  chunkSize: number;
  overlapLines: number;
  useAst: boolean;
  fallbackToLines: boolean;
  maxAstDepth: number;
  includeComments: boolean;
  preserveContext: boolean;
}

export interface AstChunk {
  node: ts.Node;
  startLine: number;
  endLine: number;
  content: string;
  type: 'function' | 'class' | 'method' | 'module' | 'statement' | 'block' | 'expression';
  name?: string | undefined;
  complexity: number;
  dependencies: string[];
}

export class TypeScriptChunker implements ChunkingStrategy {
  private config: TypeScriptChunkingConfig;

  constructor(config: Partial<TypeScriptChunkingConfig> = {}) {
    this.config = validateTypeScriptChunkingConfig(config);
  }

  getSupportedLanguages(): string[] {
    return ['typescript', 'javascript', 'jsx', 'tsx'];
  }

  getStrategyName(): string {
    return 'typescript-ast';
  }

  async chunk(
    content: string,
    filePath: string,
    options: ChunkingOptions = {}
  ): Promise<CodeChunk[]> {
    const startTime = Date.now();

    logger.debug('TypeScriptChunker: Starting chunking', {
      filePath,
      useAst: this.config.useAst,
      fallbackToLines: this.config.fallbackToLines,
    });

    try {
      
      const detectedLanguage = detectLanguageFromPath(filePath);
      if (!this.getSupportedLanguages().includes(detectedLanguage)) {
        logger.warn('TypeScriptChunker: Unsupported language detected', {
          filePath,
          detectedLanguage,
          supportedLanguages: this.getSupportedLanguages(),
        });
        throw new Error(`Unsupported language: ${detectedLanguage}. Supported languages: ${this.getSupportedLanguages().join(', ')}`);
      }

      let chunks: CodeChunk[];

      if (this.config.useAst) {
        try {
          chunks = await this.chunkWithAst(content, filePath, detectedLanguage, options);
          logger.debug('TypeScriptChunker: Successfully chunked with AST', {
            filePath,
            chunksGenerated: chunks.length,
          });
        } catch (astError) {
          logger.warn('TypeScriptChunker: AST chunking failed, falling back to line-based', {
            filePath,
            error: astError instanceof Error ? astError.message : String(astError),
          });

          if (this.config.fallbackToLines) {
            chunks = this.chunkWithLines(content, filePath, detectedLanguage, options);
            logger.debug('TypeScriptChunker: Successfully chunked with line-based fallback', {
              filePath,
              chunksGenerated: chunks.length,
            });
          } else {
            throw astError;
          }
        }
      } else {
        chunks = this.chunkWithLines(content, filePath, detectedLanguage, options);
        logger.debug('TypeScriptChunker: Successfully chunked with line-based (AST disabled)', {
          filePath,
          chunksGenerated: chunks.length,
        });
      }

      const processingTime = Date.now() - startTime;
      logger.debug('TypeScriptChunker: Chunking completed', {
        filePath,
        chunksGenerated: chunks.length,
        strategy: this.config.useAst ? 'ast' : 'lines',
        processingTime,
      });

      return chunks;

    } catch (error) {
      logger.error('TypeScriptChunker: Failed to chunk file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async chunkWithAst(
    content: string,
    filePath: string,
    language: string,
    options: ChunkingOptions = {}
  ): Promise<CodeChunk[]> {
    const sourceFile = this.parseSourceFile(content, filePath, language);
    const astChunks: AstChunk[] = [];

    this.walkAst(sourceFile, astChunks, sourceFile, 0);

    const chunks: CodeChunk[] = astChunks.map(astChunk => {
      const lines = content.split('\n');
      const chunkLines = lines.slice(astChunk.startLine - 1, astChunk.endLine);
      const chunkContent = chunkLines.join('\n');

      return {
        id: calculateChunkId(filePath, astChunk.startLine, astChunk.endLine),
        content: chunkContent,
        language,
        startLine: astChunk.startLine,
        endLine: astChunk.endLine,
        chunkType: astChunk.type,
        complexityScore: astChunk.complexity,
        dependencies: astChunk.dependencies,
        filePath,
        metadata: {
          name: astChunk.name,
          astNodeType: ts.SyntaxKind[astChunk.node.kind],
          lineCount: chunkLines.length,
          hasComments: this.hasComments(chunkLines),
          strategy: this.getStrategyName(),
          astBased: true,
        },
      };
    });

    if (chunks.length < 2 && content.split('\n').length > this.config.chunkSize) {
      logger.debug('TypeScriptChunker: AST produced few chunks, supplementing with line-based', {
        filePath,
        astChunks: chunks.length,
      });

      const lineChunks = this.chunkWithLines(content, filePath, language, options);
      
      const existingIds = new Set(chunks.map(c => c.id));
      for (const lineChunk of lineChunks) {
        if (!existingIds.has(lineChunk.id)) {
          chunks.push(lineChunk);
        }
      }
    }

    return chunks;
  }

  private parseSourceFile(content: string, filePath: string, language: string): ts.SourceFile {
    const scriptKind = this.getScriptKind(language);
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      allowJs: language === 'javascript',
      checkJs: language === 'javascript',
      strict: false,
      noImplicitAny: false,
      skipLibCheck: true,
    };

    if (language.includes('jsx')) {
      (compilerOptions as any).jsx = ts.JsxEmit.React;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      compilerOptions.target || ts.ScriptTarget.ES2020,
      true,
      scriptKind
    );

    return sourceFile;
  }

  private getScriptKind(language: string): ts.ScriptKind {
    switch (language) {
      case 'typescript':
        return ts.ScriptKind.TS;
      case 'javascript':
        return ts.ScriptKind.JS;
      case 'jsx':
        return ts.ScriptKind.JSX;
      case 'tsx':
        return ts.ScriptKind.TSX;
      default:
        return ts.ScriptKind.TS;
    }
  }

  private walkAst(
    node: ts.Node,
    chunks: AstChunk[],
    sourceFile: ts.SourceFile,
    depth: number
  ): void {
    
    if (depth > this.config.maxAstDepth) {
      return;
    }

    if (this.shouldExtractChunk(node, sourceFile)) {
      const astChunk = this.createAstChunk(node, sourceFile);
      if (astChunk) {
        chunks.push(astChunk);
      }
    }

    ts.forEachChild(node, child => {
      this.walkAst(child, chunks, sourceFile, depth + 1);
    });
  }

  private shouldExtractChunk(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    const lineCount = this.getNodeLineCount(node, sourceFile);

    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.ModuleDeclaration:
        return lineCount >= 3; 

      default:
        return false;
    }
  }

  private createAstChunk(node: ts.Node, sourceFile: ts.SourceFile): AstChunk | null {
    const sourceText = sourceFile.getFullText();
    const startPos = node.getStart(sourceFile);
    const endPos = node.getEnd();

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(startPos);
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(endPos);

    const content = sourceText.substring(startPos, endPos);
    const lines = content.split('\n');
    const lineCount = lines.length;

    if (lineCount < 2) {
      return null;
    }

    const chunk: AstChunk = {
      node,
      startLine: startLine + 1,
      endLine: endLine + 1,
      content,
      type: this.getChunkType(node),
      name: this.getNodeName(node),
      complexity: this.calculateAstComplexity(node),
      dependencies: this.extractAstDependencies(node, sourceFile),
    };

    return chunk;
  }

  private getChunkType(node: ts.Node): AstChunk['type'] {
    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.ArrowFunction:
        return 'function';
      case ts.SyntaxKind.MethodDeclaration:
        return 'method';
      case ts.SyntaxKind.Constructor:
        return 'function';
      case ts.SyntaxKind.ClassDeclaration:
        return 'class';
      case ts.SyntaxKind.InterfaceDeclaration:
        return 'class'; 
      case ts.SyntaxKind.ModuleDeclaration:
        return 'module';
      default:
        return 'statement';
    }
  }

  private getNodeName(node: ts.Node): string | undefined {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.getText();
    }
    if (ts.isMethodDeclaration(node) && node.name) {
      return node.name.getText();
    }
    if (ts.isClassDeclaration(node) && node.name) {
      return node.name.getText();
    }
    if (ts.isInterfaceDeclaration(node) && node.name) {
      return node.name.getText();
    }
    if (ts.isEnumDeclaration(node) && node.name) {
      return node.name.getText();
    }
    return undefined;
  }

  private calculateAstComplexity(node: ts.Node): number {
    let complexity = 1;

    const visitNode = (n: ts.Node) => {
      switch (n.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.SwitchStatement:
        case ts.SyntaxKind.TryStatement:
        case ts.SyntaxKind.CatchClause:
          complexity += 2;
          break;
        case ts.SyntaxKind.ConditionalExpression:
          complexity += 1;
          break;
        case ts.SyntaxKind.AmpersandAmpersandToken:
        case ts.SyntaxKind.BarBarToken:
          complexity += 1;
          break;
      }

      ts.forEachChild(n, visitNode);
    };

    visitNode(node);
    return Math.max(1, complexity);
  }

  private extractAstDependencies(node: ts.Node, _sourceFile: ts.SourceFile): string[] {
    const dependencies: Set<string> = new Set();

    const visitNode = (n: ts.Node) => {
      
      if (ts.isImportDeclaration(n)) {
        const moduleSpecifier = n.moduleSpecifier.getText().replace(/['"]/g, '');
        dependencies.add(moduleSpecifier);
      }

      if (ts.isCallExpression(n)) {
        const expression = n.expression;
        if (ts.isIdentifier(expression) && expression.text === 'require') {
          if (n.arguments.length > 0) {
            const arg = n.arguments[0];
            if (arg && ts.isStringLiteral(arg)) {
              dependencies.add(arg.text);
            }
          }
        }
      }

      ts.forEachChild(n, visitNode);
    };

    visitNode(node);
    return Array.from(dependencies);
  }

  private getNodeLineCount(node: ts.Node, sourceFile: ts.SourceFile): number {
    const startPos = node.getStart(sourceFile);
    const endPos = node.getEnd();

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(startPos);
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(endPos);

    return endLine - startLine + 1;
  }

  private chunkWithLines(
    content: string,
    filePath: string,
    language: string,
    options: ChunkingOptions = {}
  ): CodeChunk[] {
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
          language,
          startLine: chunkStart + 1,
          endLine: chunkEnd,
          chunkType: 'statement',
          complexityScore: this.calculateLineComplexity(chunkLines),
          filePath,
          dependencies: this.extractLineDependencies(chunkLines),
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

    return chunks;
  }

  private calculateLineComplexity(lines: string[]): number {
    let score = 0;
    const content = lines.join('\n');

    const controlStructures = (content.match(/\b(if|for|while|do|switch|try|catch)\b/g) || []).length;
    score += controlStructures * 2;

    const functions = (content.match(/\bfunction\b|\b=>\b|function\s*\(/g) || []).length;
    score += functions * 3;

    const operators = (content.match(/[\+\-\*\/\%\=\<\>\&\^\|\!\~\?]+/g) || []).length;
    score += Math.floor(operators / 3);

    return Math.max(1, score);
  }

  private extractLineDependencies(lines: string[]): string[] {
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
      line.trim().startsWith('/*')
    );
  }
}
