import { OllamaService } from './ollama-service';
import { GitManager } from '../core';
import { CodeChunker } from './code-chunker';
import { logInfo } from '../utils';

type ReviewOptions = {
  sinceCommit?: string;
  allChanges?: boolean;
  specificFile?: string;
  deepAnalysis?: boolean;
  forceEscalate?: boolean;
};

type ReviewResult = {
  summary: string;
  filesCount: number;
  issuesCount: number;
  suggestionsCount: number;
  complexity: 'low' | 'medium' | 'high';
  details: ReviewDetail[];
};

type ReviewDetail = {
  file: string;
  line: number;
  category: 'security' | 'performance' | 'style' | 'bug' | 'complexity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  comment: string;
  suggestion?: string;
};

export class ReviewGenerator {
  private ollamaService: OllamaService;
  private gitManager: GitManager;
  private codeChunker: CodeChunker;

  constructor() {
    this.ollamaService = new OllamaService();
    this.gitManager = new GitManager();
    this.codeChunker = new CodeChunker();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.gitManager) {
      throw new Error('GitManager not available');
    }
    await this.gitManager.initialize();
  }

  async generateReview(options: ReviewOptions): Promise<ReviewResult> {
    logInfo('🔍 Gathering changes for review...');

    // Ensure Git manager is initialized
    await this.ensureInitialized();

    // Get changes from git - use working status for now
    const workingStatus = await this.gitManager.getWorkingStatus();

    if (!workingStatus.unstagedFiles.length && !workingStatus.stagedFiles.length && !workingStatus.untrackedFiles.length) {
      return {
        summary: 'No changes found to review',
        filesCount: 0,
        issuesCount: 0,
        suggestionsCount: 0,
        complexity: 'low',
        details: []
      };
    }

    const modifiedFiles = [
      ...workingStatus.unstagedFiles.map(f => f.file),
      ...workingStatus.stagedFiles.map(f => f.file),
      ...workingStatus.untrackedFiles
    ];
    const targetFiles = options.specificFile ? [options.specificFile] : modifiedFiles;

    logInfo(`📊 Found ${targetFiles.length} files with changes`);

    // Process each file and create chunks
    const allChunks: any[] = [];
    for (const filePath of targetFiles) {
      try {
        const fileContent = await this.gitManager.getDiff('HEAD', undefined, { contextLines: 3 });
        if (fileContent.length > 0 && fileContent[0]) {
          // Get content from diff hunks
          const content = fileContent[0].hunks.map(hunk =>
            hunk.lines.map(line => line.content).join('\n')
          ).join('\n');
          const chunks = await this.codeChunker.chunkCode(content, filePath);
          // Convert CodeChunk to ReviewChunk format
          const reviewChunks = chunks.map(chunk => ({
            ...chunk,
            file: chunk.metadata?.['file'] || filePath
          }));
          allChunks.push(...reviewChunks);
        }
      } catch (error) {
        logInfo(`⚠️ Could not process file ${filePath}: ${error}`);
      }
    }

    logInfo(`🧩 Split changes into ${allChunks.length} chunks for analysis`);

    // Generate review using LLM
    logInfo('🤖 Generating review with LLM...');
    const review = await this.ollamaService.generateReview(allChunks, {
      deep: options.deepAnalysis || false,
      escalate: options.forceEscalate || false
    });

    // Calculate complexity based on issues
    const complexity = this.calculateComplexity(review.details);

    return {
      ...review,
      filesCount: targetFiles.length,
      complexity
    };
  }

  private calculateComplexity(details: ReviewDetail[]): 'low' | 'medium' | 'high' {
    const criticalCount = details.filter(d => 
      d.severity === 'critical' || d.severity === 'high'
    ).length;

    if (criticalCount > 5) return 'high';
    if (criticalCount > 2) return 'medium';
    return 'low';
  }
}
