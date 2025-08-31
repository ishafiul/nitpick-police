import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import logger from '../utils/logger';

export interface CodeChunk {
  id: string;
  content: string;
  language: string;
  startLine: number;
  endLine: number;
  chunkType: 'function' | 'class' | 'method' | 'block' | 'file' | 'module';
  complexityScore?: number;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface ChunkingOptions {
  maxChunkSize?: number;
  overlapLines?: number;
  includeComments?: boolean;
  preserveContext?: boolean;
}

export class CodeChunker {
  private readonly defaultOptions: Required<ChunkingOptions> = {
    maxChunkSize: 100,
    overlapLines: 5,
    includeComments: true,
    preserveContext: true,
  };

  /**
   * Chunk code into logical units using AST parsing when possible
   */
  async chunkCode(
    content: string,
    filePath: string,
    options: ChunkingOptions = {}
  ): Promise<CodeChunk[]> {
    const opts = { ...this.defaultOptions, ...options };
    const language = this.detectLanguage(filePath, content);
    
    try {
      switch (language) {
        case 'javascript':
        case 'typescript':
        case 'jsx':
        case 'tsx':
          return this.chunkJavaScriptTypeScript(content, filePath, language, opts);
        case 'go':
          return this.chunkGo(content, filePath, opts);
        case 'rust':
          return this.chunkRust(content, filePath, opts);
        default:
          return this.chunkByLines(content, filePath, language, opts);
      }
    } catch (error) {
      logger.warn(`AST parsing failed for ${filePath}, falling back to line-based chunking`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        language,
      });
      return this.chunkByLines(content, filePath, language, opts);
    }
  }

  /**
   * Detect programming language from file extension and content
   */
  private detectLanguage(filePath: string, content: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'js':
        return 'javascript';
      case 'ts':
        return 'typescript';
      case 'jsx':
        return 'jsx';
      case 'tsx':
        return 'tsx';
      case 'go':
        return 'go';
      case 'rs':
        return 'rust';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp';
      case 'c':
        return 'c';
      case 'php':
        return 'php';
      case 'rb':
        return 'ruby';
      case 'cs':
        return 'csharp';
      case 'swift':
        return 'swift';
      case 'kt':
        return 'kotlin';
      case 'scala':
        return 'scala';
      default:
        // Try to detect from content
        if (content.includes('function') || content.includes('const') || content.includes('let')) {
          return 'javascript';
        }
        if (content.includes('package main') || content.includes('import "fmt"')) {
          return 'go';
        }
        if (content.includes('fn ') || content.includes('use ')) {
          return 'rust';
        }
        return 'unknown';
    }
  }

  /**
   * Chunk JavaScript/TypeScript code using Babel AST
   */
  private chunkJavaScriptTypeScript(
    content: string,
    filePath: string,
    language: string,
    _options: Required<ChunkingOptions>
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    
    try {
      // Parse with Babel
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'functionSent',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining',
        ],
        tokens: true,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
      });

      // Extract functions, classes, and modules
      traverse(ast, {
        FunctionDeclaration(path) {
          const node = path.node;
          if (node.loc) {
            const chunk: CodeChunk = {
              id: `${filePath}:${node.loc.start.line}`,
              content: lines.slice(node.loc.start.line - 1, node.loc.end.line).join('\n'),
              language,
              startLine: node.loc.start.line,
              endLine: node.loc.end.line,
              chunkType: 'function',
              complexityScore: CodeChunker.calculateComplexity(node),
              dependencies: CodeChunker.extractDependencies(node),
              metadata: {
                name: node.id?.name || 'anonymous',
                async: node.async,
                generator: node.generator,
                params: node.params.length,
              },
            };
            chunks.push(chunk);
          }
        },

        FunctionExpression(path) {
          const node = path.node;
          if (node.loc && path.parentPath?.isVariableDeclarator()) {
            const varDecl = path.parentPath.node as t.VariableDeclarator;
            const chunk: CodeChunk = {
              id: `${filePath}:${node.loc.start.line}`,
              content: lines.slice(node.loc.start.line - 1, node.loc.end.line).join('\n'),
              language,
              startLine: node.loc.start.line,
              endLine: node.loc.end.line,
              chunkType: 'function',
              complexityScore: CodeChunker.calculateComplexity(node),
              dependencies: CodeChunker.extractDependencies(node),
              metadata: {
                name: varDecl.id.type === 'Identifier' ? varDecl.id.name : 'anonymous',
                async: node.async,
                generator: node.generator,
                params: node.params.length,
              },
            };
            chunks.push(chunk);
          }
        },

        ClassDeclaration(path) {
          const node = path.node;
          if (node.loc) {
            const chunk: CodeChunk = {
              id: `${filePath}:${node.loc.start.line}`,
              content: lines.slice(node.loc.start.line - 1, node.loc.end.line).join('\n'),
              language,
              startLine: node.loc.start.line,
              endLine: node.loc.end.line,
              chunkType: 'class',
              complexityScore: CodeChunker.calculateComplexity(node),
              dependencies: CodeChunker.extractDependencies(node),
              metadata: {
                name: node.id?.name || 'anonymous',
                superClass: node.superClass ? 'has_super' : 'no_super',
                methods: node.body.body.filter(n => n.type === 'ClassMethod').length,
                properties: node.body.body.filter(n => n.type === 'ClassProperty').length,
              },
            };
            chunks.push(chunk);
          }
        },

        ClassMethod(path) {
          const node = path.node;
          if (node.loc && path.parentPath?.isClassBody()) {
            const chunk: CodeChunk = {
              id: `${filePath}:${node.loc.start.line}`,
              content: lines.slice(node.loc.start.line - 1, node.loc.end.line).join('\n'),
              language,
              startLine: node.loc.start.line,
              endLine: node.loc.end.line,
              chunkType: 'method',
              complexityScore: CodeChunker.calculateComplexity(node),
              dependencies: CodeChunker.extractDependencies(node),
              metadata: {
                name: node.key.type === 'Identifier' ? node.key.name : 'computed',
                kind: node.kind,
                static: node.static,
                async: node.async,
                generator: node.generator,
                params: node.params.length,
              },
            };
            chunks.push(chunk);
          }
        },

        ExportNamedDeclaration(path) {
          const node = path.node;
          if (node.loc && node.declaration) {
            const chunk: CodeChunk = {
              id: `${filePath}:${node.loc.start.line}`,
              content: lines.slice(node.loc.start.line - 1, node.loc.end.line).join('\n'),
              language,
              startLine: node.loc.start.line,
              endLine: node.loc.end.line,
              chunkType: 'module',
              complexityScore: CodeChunker.calculateComplexity(node),
              dependencies: CodeChunker.extractDependencies(node),
              metadata: {
                type: 'named_export',
                declarationType: node.declaration.type,
              },
            };
            chunks.push(chunk);
          }
        },

        ExportDefaultDeclaration(path) {
          const node = path.node;
          if (node.loc) {
            const chunk: CodeChunk = {
              id: `${filePath}:${node.loc.start.line}`,
              content: lines.slice(node.loc.start.line - 1, node.loc.end.line).join('\n'),
              language,
              startLine: node.loc.start.line,
              endLine: node.loc.end.line,
              chunkType: 'module',
              complexityScore: CodeChunker.calculateComplexity(node),
              dependencies: CodeChunker.extractDependencies(node),
              metadata: {
                type: 'default_export',
                declarationType: node.declaration.type,
              },
            };
            chunks.push(chunk);
          }
        },
      });

      // If no chunks found, create a file-level chunk
      if (chunks.length === 0) {
        chunks.push({
          id: `${filePath}:file`,
          content,
          language,
          startLine: 1,
          endLine: lines.length,
          chunkType: 'file',
          complexityScore: 1,
          dependencies: [],
          metadata: { type: 'file_level' },
        });
      }

      return chunks;
    } catch (error) {
      throw new Error(`Failed to parse ${language} code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Chunk Go code using basic pattern matching
   */
  private chunkGo(content: string, filePath: string, _options: Required<ChunkingOptions>): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    
    // Find function definitions
    const functionRegex = /^func\s+([^(]+)\(/;
    const methodRegex = /^func\s*\([^)]+\)\s+([^(]+)\(/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const funcMatch = functionRegex.exec(line);
      const methodMatch = methodRegex.exec(line);
      
      if (funcMatch || methodMatch) {
        const name = funcMatch ? funcMatch[1]?.trim() || 'anonymous' : methodMatch![1]?.trim() || 'anonymous';
        const startLine = i + 1;
        
        // Find the end of the function (basic implementation)
        let endLine = startLine;
        let braceCount = 0;
        let inFunction = false;
        
        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j];
          if (!currentLine) continue;
          
          if (currentLine.includes('{')) {
            braceCount++;
            inFunction = true;
          }
          if (currentLine.includes('}')) {
            braceCount--;
            if (inFunction && braceCount === 0) {
              endLine = j + 1;
              break;
            }
          }
        }
        
        const chunk: CodeChunk = {
          id: `${filePath}:${startLine}`,
          content: lines.slice(startLine - 1, endLine).join('\n'),
          language: 'go',
          startLine,
          endLine,
          chunkType: funcMatch ? 'function' : 'method',
          complexityScore: 1, // Basic complexity for now
          dependencies: [],
          metadata: {
            name,
            type: funcMatch ? 'function' : 'method',
          },
        };
        chunks.push(chunk);
      }
    }
    
    // If no chunks found, create a file-level chunk
    if (chunks.length === 0) {
      chunks.push({
        id: `${filePath}:file`,
        content,
        language: 'go',
        startLine: 1,
        endLine: lines.length,
        chunkType: 'file',
        complexityScore: 1,
        dependencies: [],
        metadata: { type: 'file_level' },
      });
    }
    
    return chunks;
  }

  /**
   * Chunk Rust code using basic pattern matching
   */
  private chunkRust(content: string, filePath: string, _options: Required<ChunkingOptions>): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    
    // Find function definitions
    const functionRegex = /^fn\s+([^(]+)\(/;
    const implRegex = /^impl\s+([^{]+)\s*{/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const funcMatch = functionRegex.exec(line);
      const implMatch = implRegex.exec(line);
      
      if (funcMatch) {
        const name = funcMatch[1]?.trim() || 'anonymous';
        const startLine = i + 1;
        
        // Find the end of the function (basic implementation)
        let endLine = startLine;
        let braceCount = 0;
        let inFunction = false;
        
        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j];
          if (!currentLine) continue;
          
          if (currentLine.includes('{')) {
            braceCount++;
            inFunction = true;
          }
          if (currentLine.includes('}')) {
            braceCount--;
            if (inFunction && braceCount === 0) {
              endLine = j + 1;
              break;
            }
          }
        }
        
        const chunk: CodeChunk = {
          id: `${filePath}:${startLine}`,
          content: lines.slice(startLine - 1, endLine).join('\n'),
          language: 'rust',
          startLine,
          endLine,
          chunkType: 'function',
          complexityScore: 1, // Basic complexity for now
          dependencies: [],
          metadata: {
            name,
            type: 'function',
          },
        };
        chunks.push(chunk);
      } else if (implMatch) {
        const name = implMatch[1]?.trim() || 'anonymous';
        const startLine = i + 1;
        
        // Find the end of the impl block
        let endLine = startLine;
        let braceCount = 0;
        let inImpl = false;
        
        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j];
          if (!currentLine) continue;
          
          if (currentLine.includes('{')) {
            braceCount++;
            inImpl = true;
          }
          if (currentLine.includes('}')) {
            braceCount--;
            if (inImpl && braceCount === 0) {
              endLine = j + 1;
              break;
            }
          }
        }
        
        const chunk: CodeChunk = {
          id: `${filePath}:${startLine}`,
          content: lines.slice(startLine - 1, endLine).join('\n'),
          language: 'rust',
          startLine,
          endLine,
          chunkType: 'class',
          complexityScore: 1, // Basic complexity for now
          dependencies: [],
          metadata: {
            name,
            type: 'impl',
          },
        };
        chunks.push(chunk);
      }
    }
    
    // If no chunks found, create a file-level chunk
    if (chunks.length === 0) {
      chunks.push({
        id: `${filePath}:file`,
        content,
        language: 'rust',
        startLine: 1,
        endLine: lines.length,
        chunkType: 'file',
        complexityScore: 1,
        dependencies: [],
        metadata: { type: 'file_level' },
      });
    }
    
    return chunks;
  }

  /**
   * Fallback chunking by lines for unsupported languages
   */
  private chunkByLines(
    content: string,
    filePath: string,
    language: string,
    options: Required<ChunkingOptions>
  ): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    
    // If content is empty or only whitespace, return a single file chunk
    if (!content.trim()) {
      chunks.push({
        id: `${filePath}:file`,
        content,
        language,
        startLine: 1,
        endLine: lines.length,
        chunkType: 'file',
        complexityScore: 1,
        dependencies: [],
        metadata: { type: 'file_level' },
      });
      return chunks;
    }
    
    for (let i = 0; i < lines.length; i += options.maxChunkSize) {
      const startLine = i + 1;
      const endLine = Math.min(i + options.maxChunkSize, lines.length);
      const chunkContent = lines.slice(i, endLine).join('\n');
      
      const chunk: CodeChunk = {
        id: `${filePath}:${startLine}`,
        content: chunkContent,
        language,
        startLine,
        endLine,
        chunkType: 'block',
        complexityScore: 1,
        dependencies: [],
        metadata: {
          type: 'line_based',
          lineCount: endLine - startLine + 1,
        },
      };
      chunks.push(chunk);
    }
    
    return chunks;
  }

  /**
   * Calculate cyclomatic complexity of a function/class
   */
  private static calculateComplexity(node: any): number {
    let complexity = 1; // Base complexity
    
    const countNodes = (n: any) => {
      if (!n) return;
      
      // Count decision points
      if (n.type === 'IfStatement' || n.type === 'SwitchCase' || 
          n.type === 'ForStatement' || n.type === 'WhileStatement' ||
          n.type === 'DoWhileStatement' || n.type === 'ForInStatement' ||
          n.type === 'ForOfStatement' || n.type === 'ConditionalExpression' ||
          n.type === 'LogicalExpression' || n.type === 'SwitchStatement') {
        complexity++;
      }
      
      // Count catch blocks
      if (n.type === 'CatchClause') {
        complexity++;
      }
      
      // Recursively check children
      for (const key in n) {
        if (n[key] && typeof n[key] === 'object') {
          if (Array.isArray(n[key])) {
            n[key].forEach(countNodes);
          } else {
            countNodes(n[key]);
          }
        }
      }
    };
    
    countNodes(node);
    return complexity;
  }

  /**
   * Extract dependencies from a code node
   */
  private static extractDependencies(node: any): string[] {
    const dependencies: string[] = [];
    
    const extractFromNode = (n: any) => {
      if (!n) return;
      
      if (n.type === 'ImportDeclaration') {
        if (n.source && n.source.value) {
          dependencies.push(n.source.value);
        }
      } else if (n.type === 'CallExpression' && n.callee) {
        if (n.callee.type === 'Identifier') {
          dependencies.push(n.callee.name);
        } else if (n.callee.type === 'MemberExpression' && n.callee.object) {
          if (n.callee.object.type === 'Identifier') {
            dependencies.push(n.callee.object.name);
          }
        }
      } else if (n.type === 'MemberExpression') {
        if (n.object && n.object.type === 'Identifier') {
          dependencies.push(n.object.name);
        }
      }
      
      // Recursively check children
      for (const key in n) {
        if (n[key] && typeof n[key] === 'object') {
          if (Array.isArray(n[key])) {
            n[key].forEach(extractFromNode);
          } else {
            extractFromNode(n[key]);
          }
        }
      }
    };
    
    extractFromNode(node);
    return [...new Set(dependencies)]; // Remove duplicates
  }
}
