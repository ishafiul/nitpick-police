import { CodeVectorStore, CodeChunkDocument, CommitSummaryDocument } from './code-vector-store';
import { OllamaService } from './ollama-service';
import { CodeChunker, CodeChunk } from './code-chunker';
import { ReviewCommentType, CommentSeverityType, CommentCategoryType } from '../models/state';
import logger from '../utils/logger';

export interface ReviewContext {
  similarChunks: CodeChunkDocument[];
  commitHistory: CommitSummaryDocument[];
  fileContext: string;
  language: string;
}

export interface ReviewOptions {
  reviewTypes: ('security' | 'performance' | 'style' | 'bug' | 'complexity')[];
  maxSimilarChunks: number;
  maxCommitHistory: number;
  temperature: number;
  includeExamples: boolean;
}

export interface ReviewResult {
  comments: ReviewCommentType[];
  qualityScore: number;
  confidenceScore: number;
  contextRelevance: number;
  processingTime: number;
}

export interface PromptTemplate {
  name: string;
  systemPrompt: string;
  userPrompt: string;
  examples: Array<{
    input: string;
    output: string;
  }>;
}

export class ReviewEngine {
  private codeVectorStore: CodeVectorStore;
  private ollamaService: OllamaService;
  private codeChunker: CodeChunker;
  private promptTemplates: Map<string, PromptTemplate>;

  constructor(
    codeVectorStore: CodeVectorStore,
    ollamaService: OllamaService,
    codeChunker: CodeChunker
  ) {
    this.codeVectorStore = codeVectorStore;
    this.ollamaService = ollamaService;
    this.codeChunker = codeChunker;
    this.promptTemplates = new Map();
    this.initializePromptTemplates();
  }

  /**
   * Initialize prompt templates for different review types
   */
  private initializePromptTemplates(): void {
    // Security review template
    this.promptTemplates.set('security', {
      name: 'Security Review',
      systemPrompt: `You are a security expert code reviewer. Analyze code for security vulnerabilities, 
      including but not limited to: SQL injection, XSS, CSRF, authentication bypass, authorization flaws, 
      input validation issues, and insecure dependencies. Provide specific, actionable feedback with 
      severity levels and remediation steps.`,
      userPrompt: `Review the following code for security vulnerabilities:

Code:
{code}

Context:
- Language: {language}
- Similar code patterns: {similarPatterns}
- Recent security issues: {recentIssues}

Provide security review comments in JSON format:
{
  "comments": [
    {
      "line_number": <line>,
      "severity": "<low|medium|high|critical>",
      "category": "security",
      "message": "<detailed message>",
      "suggestion": "<remediation suggestion>"
    }
  ]
}`,
      examples: [
        {
          input: `function getUserData(userId) {
  const query = "SELECT * FROM users WHERE id = " + userId;
  return db.execute(query);
}`,
          output: `{
  "comments": [
    {
      "line_number": 2,
      "severity": "critical",
      "category": "security",
      "message": "SQL injection vulnerability: user input concatenated directly into SQL query",
      "suggestion": "Use parameterized queries or prepared statements to prevent SQL injection"
    }
  ]
}`
        }
      ]
    });

    // Performance review template
    this.promptTemplates.set('performance', {
      name: 'Performance Review',
      systemPrompt: `You are a performance optimization expert. Analyze code for performance issues 
      including: inefficient algorithms, memory leaks, unnecessary computations, blocking operations, 
      and scalability concerns. Provide specific recommendations with expected impact.`,
      userPrompt: `Review the following code for performance issues:

Code:
{code}

Context:
- Language: {language}
- Similar code patterns: {similarPatterns}
- Performance characteristics: {performanceContext}

Provide performance review comments in JSON format:
{
  "comments": [
    {
      "line_number": <line>,
      "severity": "<low|medium|high|critical>",
      "category": "performance",
      "message": "<detailed message>",
      "suggestion": "<optimization suggestion>",
      "expected_impact": "<performance improvement estimate>"
    }
  ]
}`,
      examples: [
        {
          input: `function findUser(users, targetId) {
  for (let i = 0; i < users.length; i++) {
    if (users[i].id === targetId) {
      return users[i];
    }
  }
  return null;
}`,
          output: `{
  "comments": [
    {
      "line_number": 1,
      "severity": "medium",
      "category": "performance",
      "message": "Linear search through array could be optimized for large datasets",
      "suggestion": "Consider using Map or Set for O(1) lookup, or sort array for binary search",
      "expected_impact": "O(n) to O(1) or O(log n) lookup time"
    }
  ]
}`
        }
      ]
    });

    // Style review template
    this.promptTemplates.set('style', {
      name: 'Style Review',
      systemPrompt: `You are a code style and best practices expert. Review code for consistency, 
      readability, maintainability, and adherence to language-specific conventions. Focus on naming, 
      structure, documentation, and code organization.`,
      userPrompt: `Review the following code for style and best practices:

Code:
{code}

Context:
- Language: {language}
- Similar code patterns: {similarPatterns}
- Style guidelines: {styleGuidelines}

Provide style review comments in JSON format:
{
  "comments": [
    {
      "line_number": <line>,
      "severity": "<low|medium|high|critical>",
      "category": "style",
      "message": "<detailed message>",
      "suggestion": "<improvement suggestion>"
    }
  ]
}`,
      examples: [
        {
          input: `function getdata() {
  var x = 10;
  if(x>5) {
    console.log("big");
  }
}`,
          output: `{
  "comments": [
    {
      "line_number": 1,
      "severity": "medium",
      "category": "style",
      "message": "Function name should use camelCase: getdata -> getData",
      "suggestion": "Rename function to follow camelCase convention"
    },
    {
      "line_number": 2,
      "severity": "low",
      "category": "style",
      "message": "Use const instead of var for immutable values",
      "suggestion": "Replace 'var x = 10' with 'const x = 10'"
    },
    {
      "line_number": 3,
      "severity": "low",
      "category": "style",
      "message": "Missing spaces around operator",
      "suggestion": "Add spaces: 'x > 5' instead of 'x>5'"
    }
  ]
}`
        }
      ]
    });
  }

  /**
   * Generate review for a code file
   */
  async generateReview(
    filePath: string,
    code: string,
    commitSha: string,
    options: Partial<ReviewOptions> = {}
  ): Promise<ReviewResult> {
    const startTime = Date.now();
    const reviewOptions: ReviewOptions = {
      reviewTypes: ['security', 'performance', 'style'],
      maxSimilarChunks: 5,
      maxCommitHistory: 3,
      temperature: 0.3,
      includeExamples: true,
      ...options
    };

    try {
      logger.info('Starting code review generation', {
        filePath,
        commitSha,
        reviewTypes: reviewOptions.reviewTypes
      });

      // Step 1: Chunk the code
      const chunks = await this.codeChunker.chunkCode(code, filePath, { maxChunkSize: 1000 });
      
      // Step 2: Build context from vector store
      const context = await this.buildReviewContext(
        filePath,
        chunks,
        commitSha,
        reviewOptions
      );

      // Step 3: Generate reviews for each chunk
      const allComments: ReviewCommentType[] = [];
      let totalQualityScore = 0;
      let totalConfidenceScore = 0;
      let totalContextRelevance = 0;

      for (const chunk of chunks) {
        const chunkResult = await this.reviewCodeChunk(
          chunk,
          context,
          reviewOptions
        );

        allComments.push(...chunkResult.comments);
        totalQualityScore += chunkResult.qualityScore;
        totalConfidenceScore += chunkResult.confidenceScore;
        totalContextRelevance += chunkResult.contextRelevance;
      }

      // Step 4: Deduplicate comments
      const deduplicatedComments = this.deduplicateComments(allComments);

      // Step 5: Calculate overall scores
      const avgQualityScore = totalQualityScore / chunks.length;
      const avgConfidenceScore = totalConfidenceScore / chunks.length;
      const avgContextRelevance = totalContextRelevance / chunks.length;

      const processingTime = Date.now() - startTime;

      logger.info('Code review generation completed', {
        filePath,
        commitSha,
        commentsGenerated: allComments.length,
        commentsAfterDeduplication: deduplicatedComments.length,
        processingTime
      });

      return {
        comments: deduplicatedComments,
        qualityScore: avgQualityScore,
        confidenceScore: avgConfidenceScore,
        contextRelevance: avgContextRelevance,
        processingTime
      };

    } catch (error) {
      logger.error('Failed to generate code review', {
        filePath,
        commitSha,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Build review context from vector store
   */
  private async buildReviewContext(
    filePath: string,
    chunks: CodeChunk[],
    commitSha: string,
    options: ReviewOptions
  ): Promise<ReviewContext> {
    try {
      // Find similar code chunks using the generic search method
      const similarChunks: CodeChunkDocument[] = [];
      for (const chunk of chunks) {
        // Generate embedding for the chunk content
        const embedding = await this.codeVectorStore.generateEmbedding(chunk.content);
        
        // Search for similar chunks in the code_chunks collection
        const searchResults = await this.codeVectorStore.search(
          'code_chunks',
          embedding,
          options.maxSimilarChunks,
          0.7, // score threshold
          true, // with payload
          false // without vector
        );

        // Filter out results from the same commit
        const filteredResults = searchResults.filter(result => 
          result.payload['commit_sha'] !== commitSha
        );

        // Convert to CodeChunkDocument format
        const chunkDocuments = filteredResults.map(result => ({
          id: result.id,
          payload: {
            file_path: result.payload['file_path'] || 'unknown',
            chunk_id: result.payload['chunk_id'] || result.id,
            content: result.payload['content'] || '',
            language: result.payload['language'] || 'unknown',
            start_line: result.payload['start_line'] || 0,
            end_line: result.payload['end_line'] || 0,
            commit_sha: result.payload['commit_sha'] || '',
            chunk_type: result.payload['chunk_type'] || 'block',
            complexity_score: result.payload['complexity_score'],
            dependencies: result.payload['dependencies'] || []
          },
          vector: embedding,
          score: result.score
        }));

        similarChunks.push(...chunkDocuments);
      }

      // Get commit history for context
      const commitEmbedding = await this.codeVectorStore.generateEmbedding(`file changes in ${filePath}`);
      const commitHistoryResults = await this.codeVectorStore.search(
        'commit_summaries',
        commitEmbedding,
        options.maxCommitHistory,
        0.6, // score threshold
        true, // with payload
        false // without vector
      );

      // Convert to CommitSummaryDocument format
      const commitHistory = commitHistoryResults.map(result => ({
        id: result.id,
        payload: {
          commit_sha: result.payload['commit_sha'] || result.id,
          summary: result.payload['summary'] || '',
          author: result.payload['author'] || 'Unknown',
          author_email: result.payload['author_email'] || '',
          commit_date: result.payload['commit_date'] || new Date().toISOString(),
          files_changed: result.payload['files_changed'] || [],
          lines_added: result.payload['lines_added'] || 0,
          lines_deleted: result.payload['lines_deleted'] || 0,
          message: result.payload['message'] || result.payload['summary'] || '',
          branch: result.payload['branch'] || 'main'
        },
        vector: commitEmbedding,
        score: result.score
      }));

      // Extract language from file path
      const language = this.detectLanguageFromPath(filePath);

      return {
        similarChunks,
        commitHistory,
        fileContext: this.buildFileContext(chunks),
        language
      };

    } catch (error) {
      logger.warn('Failed to build complete review context, using fallback', {
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return minimal context
      return {
        similarChunks: [],
        commitHistory: [],
        fileContext: this.buildFileContext(chunks),
        language: this.detectLanguageFromPath(filePath)
      };
    }
  }

  /**
   * Review a single code chunk
   */
  private async reviewCodeChunk(
    chunk: CodeChunk,
    context: ReviewContext,
    options: ReviewOptions
  ): Promise<{
    comments: ReviewCommentType[];
    qualityScore: number;
    confidenceScore: number;
    contextRelevance: number;
  }> {
    const comments: ReviewCommentType[] = [];
    let totalQualityScore = 0;
    let totalConfidenceScore = 0;
    let totalContextRelevance = 0;
    let reviewCount = 0;

    for (const reviewType of options.reviewTypes) {
      try {
        const template = this.promptTemplates.get(reviewType);
        if (!template) continue;

        const prompt = this.buildPrompt(template, chunk, context, options);
        const response = await this.ollamaService.generate({
          model: 'codellama:7b', // Default model, can be configurable
          prompt,
          options: {
            temperature: options.temperature,
            stop: ['```', '---']
          }
        });

        const parsedComments = this.parseReviewResponse(
          response.response,
          chunk,
          reviewType
        );

        comments.push(...parsedComments);

        // Calculate scores for this review type
        const scores = this.calculateReviewScores(
          parsedComments,
          context,
          chunk
        );

        totalQualityScore += scores.qualityScore;
        totalConfidenceScore += scores.confidenceScore;
        totalContextRelevance += scores.contextRelevance;
        reviewCount++;

      } catch (error) {
        logger.warn(`Failed to generate ${reviewType} review for chunk`, {
          chunkId: chunk.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Calculate averages
    const avgQualityScore = reviewCount > 0 ? totalQualityScore / reviewCount : 0;
    const avgConfidenceScore = reviewCount > 0 ? totalConfidenceScore / reviewCount : 0;
    const avgContextRelevance = reviewCount > 0 ? totalContextRelevance / reviewCount : 0;

    return {
      comments,
      qualityScore: avgQualityScore,
      confidenceScore: avgConfidenceScore,
      contextRelevance: avgContextRelevance
    };
  }

  /**
   * Build prompt from template
   */
  private buildPrompt(
    template: PromptTemplate,
    chunk: CodeChunk,
    context: ReviewContext,
    options: ReviewOptions
  ): string {
    let prompt = template.systemPrompt + '\n\n';

    if (options.includeExamples && template.examples.length > 0) {
      prompt += 'Examples:\n';
      for (const example of template.examples) {
        prompt += `Input:\n${example.input}\n\nOutput:\n${example.output}\n\n`;
      }
    }

    prompt += template.userPrompt
      .replace('{code}', chunk.content)
      .replace('{language}', context.language)
      .replace('{similarPatterns}', this.formatSimilarPatterns(context.similarChunks))
      .replace('{recentIssues}', this.formatRecentIssues(context.commitHistory))
      .replace('{performanceContext}', this.formatPerformanceContext(context.similarChunks))
      .replace('{styleGuidelines}', this.formatStyleGuidelines(context.language));

    return prompt;
  }

  /**
   * Parse review response from LLM
   */
  private parseReviewResponse(
    response: string,
    chunk: CodeChunk,
    reviewType: string
  ): ReviewCommentType[] {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in review response', { response });
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.comments || !Array.isArray(parsed.comments)) {
        return [];
      }

      return parsed.comments
        .filter((comment: any) => comment.line_number && comment.message)
        .map((comment: any) => ({
          id: this.generateCommentId(),
          file_path: chunk.language || 'unknown',
          line_number: Math.max(1, Math.min(comment.line_number, chunk.endLine)),
          severity: this.parseSeverity(comment.severity),
          category: this.parseCategory(comment.category || reviewType),
          message: comment.message,
          status: 'open' as const,
          created_at: new Date(),
          updated_at: new Date(),
          resolved_at: undefined
        }));

    } catch (error) {
      logger.warn('Failed to parse review response', {
        response,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Deduplicate comments based on similarity
   */
  private deduplicateComments(comments: ReviewCommentType[]): ReviewCommentType[] {
    const uniqueComments: ReviewCommentType[] = [];
    const seenPatterns = new Set<string>();

    for (const comment of comments) {
      const pattern = this.generateCommentPattern(comment);
      if (!seenPatterns.has(pattern)) {
        seenPatterns.add(pattern);
        uniqueComments.push(comment);
      }
    }

    return uniqueComments;
  }

  /**
   * Calculate review quality scores
   */
  private calculateReviewScores(
    comments: ReviewCommentType[],
    context: ReviewContext,
    _chunk: CodeChunk
  ): {
    qualityScore: number;
    confidenceScore: number;
    contextRelevance: number;
  } {
    // Quality score based on comment specificity and actionability
    const qualityScore = comments.reduce((score, comment) => {
      let commentScore = 0.5; // Base score
      
      if (comment.message.length > 50) commentScore += 0.2; // Detailed message
      if (comment.severity === 'critical' || comment.severity === 'high') commentScore += 0.2; // Important issues
      if (comment.message.includes('suggestion') || comment.message.includes('should')) commentScore += 0.1; // Actionable
      
      return score + commentScore;
    }, 0) / Math.max(comments.length, 1);

    // Confidence score based on context availability
    const contextRelevance = Math.min(
      (context.similarChunks.length / 5) * 0.4 + 
      (context.commitHistory.length / 3) * 0.3 + 
      0.3, // Base confidence
      1.0
    );

    // Overall confidence
    const confidenceScore = (qualityScore + contextRelevance) / 2;

    return {
      qualityScore: Math.min(qualityScore, 1.0),
      confidenceScore: Math.min(confidenceScore, 1.0),
      contextRelevance: Math.min(contextRelevance, 1.0)
    };
  }

  /**
   * Helper methods
   */
  private detectLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'go': 'go',
      'rs': 'rust',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c'
    };
    return languageMap[ext] || 'unknown';
  }

  private buildFileContext(chunks: CodeChunk[]): string {
    return chunks.map(chunk => 
      `${chunk.chunkType} (lines ${chunk.startLine}-${chunk.endLine}): ${chunk.content.substring(0, 100)}...`
    ).join('\n');
  }

  private formatSimilarPatterns(similarChunks: CodeChunkDocument[]): string {
    if (similarChunks.length === 0) return 'None found';
    return similarChunks
      .slice(0, 3)
      .map(chunk => `${chunk.payload.chunk_type} in ${chunk.payload.file_path}`)
      .join(', ');
  }

  private formatRecentIssues(commitHistory: CommitSummaryDocument[]): string {
    if (commitHistory.length === 0) return 'None found';
    return commitHistory
      .slice(0, 2)
      .map(commit => commit.payload.message)
      .join('; ');
  }

  private formatPerformanceContext(similarChunks: CodeChunkDocument[]): string {
    if (similarChunks.length === 0) return 'None found';
    const performanceChunks = similarChunks.filter(chunk => 
      chunk.payload.complexity_score && chunk.payload.complexity_score > 5
    );
    return performanceChunks.length > 0 
      ? `${performanceChunks.length} complex patterns found`
      : 'No performance concerns in similar code';
  }

  private formatStyleGuidelines(language: string): string {
    const guidelines: Record<string, string> = {
      'javascript': 'ESLint, Prettier, camelCase naming',
      'typescript': 'ESLint, Prettier, camelCase naming, type safety',
      'go': 'gofmt, golint, snake_case naming',
      'rust': 'rustfmt, clippy, snake_case naming'
    };
    return guidelines[language] || 'Standard language conventions';
  }

  private generateCommentId(): string {
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCommentPattern(comment: ReviewCommentType): string {
    return `${comment.file_path}:${comment.line_number}:${comment.category}:${comment.message.substring(0, 50)}`;
  }

  private parseSeverity(severity: string): CommentSeverityType {
    const validSeverities: CommentSeverityType[] = ['low', 'medium', 'high', 'critical'];
    return validSeverities.includes(severity as CommentSeverityType) 
      ? (severity as CommentSeverityType) 
      : 'medium';
  }

  private parseCategory(category: string): CommentCategoryType {
    const validCategories: CommentCategoryType[] = ['security', 'performance', 'style', 'bug', 'complexity'];
    return validCategories.includes(category as CommentCategoryType) 
      ? (category as CommentCategoryType) 
      : 'style';
  }
}
