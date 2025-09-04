import { Command } from 'commander';
import fs from 'fs';
import { BaseCommand, ReviewCommandOptions } from './base-command';
import { CloudReviewService } from '../../services/cloud-review.service';
import { PromptComposer } from '../../services/prompt/composer';
import { RetrievalService } from '../../services/retrieval.service';
import { GitChangeService } from '../../services/git/git-change.service';
import { ReviewStorageService } from '../../services/review-storage.service';
import { QdrantReviewStorageService } from '../../services/qdrant-review-storage.service';
import { InsightExtractionService } from '../../services/insight-extraction.service';
import logger from '../../utils/logger';

export class ReviewCommand extends BaseCommand {
  private cloudReviewService?: CloudReviewService;
  private retrievalService?: RetrievalService;
  private promptComposer?: PromptComposer;
  private gitChangeService?: GitChangeService;
  private reviewStorageService?: ReviewStorageService;
  private qdrantStorageService?: QdrantReviewStorageService;
  private insightExtractionService?: InsightExtractionService;

  async register(program: Command): Promise<void> {
    program
      .command('review')
      .description('Generate code review using prepared prompts or direct cloud workflow')
      .option('-p, --from-prepared <file>', 'Use prepared prompt from file')
      .option('-f, --file <path>', 'Review specific file (direct workflow)')
      .option('-s, --since <commit>', 'Review changes since commit (direct workflow)')
      .option('-a, --all', 'Review all files (direct workflow)')
      .option('-k, --top-k <number>', 'Number of chunks to retrieve (direct workflow)', parseInt, 5)
      .option('-b, --budget <number>', 'Token budget for prompt (direct workflow)', (value) => {
        const parsed = parseInt(value, 10);
        logger.debug('EnhancedReview: Parsing budget option', { value, parsed });
        return parsed;
      }, 8000)
      .option('-m, --model <model>', 'AI model to use', 'claude-3-5-haiku-20241022')
      .option('-t, --temperature <temp>', 'Model temperature (0.0-2.0)', parseFloat, 0.1)
      .option('--max-tokens <tokens>', 'Maximum tokens for response', parseInt, 4096)
      .option('--system-prompt <prompt>', 'Custom system prompt')
      .option('--format <format>', 'Output format (text, json, table)', 'text')
      .option('--output <path>', 'Save review to file')
      .option('--dry-run', 'Show what would be reviewed without calling API')
      .option('--store', 'Store review results locally and in Qdrant')
      .option('--extract-insights', 'Extract and store insights from the review')
      .option('--tags <tags>', 'Comma-separated tags for the stored review')
      .option('--include-diffs', 'Include git diffs in prompt (direct workflow)')
      .option('--include-insights', 'Include previous insights in prompt (direct workflow)')
      .action(async (options: ReviewCommandOptions & {
        'from-prepared'?: string;
        file?: string;
        since?: string;
        all?: boolean;
        'top-k'?: number;
        budget?: number;
        model?: string;
        temperature?: number;
        'max-tokens'?: number;
        'system-prompt'?: string;
        format?: string;
        output?: string;
        'dry-run'?: boolean;
        store?: boolean;
        'extract-insights'?: boolean;
        tags?: string;
        'include-diffs'?: boolean;
        'include-insights'?: boolean;
      }) => {
        await this.executeCommand(async () => {
          await this.handleReview(options);
        }, 'Code Review');
      });
  }

  private async handleReview(options: any): Promise<void> {
    await this.initialize();

    await this.validateGitRepository();

    logger.debug('EnhancedReview: Received options', {
      budget: options.budget,
      all: options.all,
      file: options.file,
      since: options.since,
      model: options.model,
      temperature: options.temperature,
    });

    this.info('Starting code review');

    this.cloudReviewService = new CloudReviewService();
    await this.cloudReviewService.initialize();

    if (options['from-prepared']) {
      
      await this.handlePreparedReview(options);
    } else {
      
      await this.handleDirectReview(options);
    }
  }

  private async handlePreparedReview(options: any): Promise<void> {
    const preparedFile = options['from-prepared'];

    this.info(`Loading prepared prompt from: ${preparedFile}`);

    if (!fs.existsSync(preparedFile)) {
      this.error(`Prepared prompt file not found: ${preparedFile}`);
      return;
    }

    let preparedData;
    try {
      const fileContent = fs.readFileSync(preparedFile, 'utf8');
      preparedData = JSON.parse(fileContent);
    } catch (error) {
      this.error(`Failed to parse prepared prompt file: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if (!preparedData.prompt || !preparedData.prompt.text) {
      this.error('Invalid prepared prompt file - missing prompt.text');
      return;
    }

    const promptText = preparedData.prompt.text;
    const tokenCount = preparedData.prompt.tokenCount || promptText.length / 4; 

    this.info(`Loaded prepared prompt with ${tokenCount} tokens`);

    if (preparedData.metadata) {
      console.log('\n📋 Prepared Prompt Info:');
      console.log('─'.repeat(40));
      console.log(`Context: ${preparedData.metadata.context}`);
      console.log(`Prepared: ${new Date(preparedData.metadata.preparedAt).toLocaleString()}`);
      console.log(`Files: ${preparedData.metadata.stats?.filesAnalyzed || 'N/A'}`);
      console.log(`Chunks: ${preparedData.metadata.stats?.chunksRetrieved || 0}`);
      console.log(`Tokens: ${preparedData.metadata.stats?.tokenCount || 'N/A'}`);
    }

    await this.executeReviewWithPrompt({
      promptText,
      tokenCount,
      model: options.model || 'claude-3-5-haiku-20241022',
      temperature: options.temperature || 0.1,
      maxTokens: options['max-tokens'] || 4096,
      systemPrompt: options['system-prompt'],
      format: options.format || 'text',
      output: options.output,
      dryRun: options['dry-run'],
      store: options.store,
      extractInsights: options['extract-insights'],
      tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined,
      preparedMetadata: preparedData.metadata,
    });
  }

  private async handleDirectReview(options: any): Promise<void> {
    this.info('Starting direct cloud review workflow');

    if (!options.file && !options.since && !options.all) {
      this.error('Please specify --file, --since, or --all for direct review');
      return;
    }

    this.retrievalService = new RetrievalService();
    await this.retrievalService.initialize();

    this.promptComposer = new PromptComposer();

    this.gitChangeService = new GitChangeService();
    await this.gitChangeService.initialize();

    let contextDescription = '';
    let filePaths: string[] | undefined;
    let commitRange: string | undefined;

    if (options.file) {
      contextDescription = `Review file: ${options.file}`;
      filePaths = [options.file];
    } else if (options.since) {
      contextDescription = `Review changes since commit: ${options.since}`;
      commitRange = options.since;

      const changes = await this.gitChangeService.detectChangesSinceCommit(options.since);
      filePaths = changes.changes.map(c => c.path);

      if (filePaths.length === 0) {
        this.warning(`No changes found since commit ${options.since}`);
        return;
      }

      this.info(`Found ${filePaths.length} changed files`);
    } else if (options.all) {
      contextDescription = 'Review all files in repository';
      
    }

    const retrievalQuery = {
      text: contextDescription,
      filePaths: filePaths,
      commitRange: commitRange,
      limit: options['top-k'] || 5,
    };

    this.info(`Retrieving relevant code context (${retrievalQuery.limit} chunks)...`);

    const retrievalResult = await this.retrievalService.retrieve(retrievalQuery);

    if (retrievalResult.chunks.length === 0) {
      this.warning('No relevant code context found');
      return;
    }

    this.info(`Found ${retrievalResult.chunks.length} relevant code chunks`);

    const compositionOptions = {
      tokenBudget: options.budget || 8000,
      includeDiffs: options['include-diffs'] || false,
      includeInsights: options['include-insights'] || false,
      responseFormat: 'json' as const,
    };

    logger.debug('EnhancedReview: Composition options', {
      budget: options.budget,
      tokenBudget: compositionOptions.tokenBudget,
      includeDiffs: compositionOptions.includeDiffs,
      includeInsights: compositionOptions.includeInsights,
    });

    this.info('Composing review prompt...');

    const compositionResult = await this.promptComposer.composePrompt(retrievalResult, compositionOptions);

    if (!compositionResult.success || !compositionResult.prompt) {
      this.error('Failed to compose prompt: ' + (compositionResult.errors?.[0]?.message || 'Unknown error'));
      return;
    }

    const composedPrompt = compositionResult.prompt;

    this.success('Prompt composition completed', {
      tokenCount: composedPrompt.tokenCount,
      chunksIncluded: retrievalResult.chunks.length,
      filesAnalyzed: filePaths?.length || 'all',
    });

    await this.executeReviewWithPrompt({
      promptText: composedPrompt.text,
      tokenCount: composedPrompt.tokenCount,
      model: options.model || 'claude-3-5-haiku-20241022',
      temperature: options.temperature || 0.1,
      maxTokens: options['max-tokens'] || 4096,
      systemPrompt: options['system-prompt'],
      format: options.format || 'text',
      output: options.output,
      dryRun: options['dry-run'],
      store: options.store,
      extractInsights: options['extract-insights'],
      tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined,
      retrievalMetadata: {
        query: retrievalQuery,
        chunksRetrieved: retrievalResult.chunks.length,
        filesAnalyzed: filePaths?.length || 'all',
      },
    });
  }

  private async executeReviewWithPrompt(params: {
    promptText: string;
    tokenCount: number;
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt?: string;
    format: string;
    output?: string;
    dryRun: boolean;
    store?: boolean;
    extractInsights?: boolean;
    tags?: string[];
    preparedMetadata?: any;
    retrievalMetadata?: any;
  }): Promise<void> {
    const {
      promptText,
      tokenCount,
      model,
      temperature,
      maxTokens,
      systemPrompt,
      format,
      output,
      dryRun,
      store,
      extractInsights,
      tags,
      preparedMetadata,
      retrievalMetadata,
    } = params;

    console.log('\n🔧 Review Configuration:');
    console.log('─'.repeat(40));
    console.log(`Model: ${model}`);
    console.log(`Temperature: ${temperature}`);
    console.log(`Max Tokens: ${maxTokens}`);
    console.log(`Prompt Tokens: ${tokenCount}`);
    console.log(`Format: ${format}`);
    console.log(`Dry Run: ${dryRun ? 'Yes' : 'No'}`);
    console.log(`Store Results: ${store ? 'Yes' : 'No'}`);
    console.log(`Extract Insights: ${extractInsights ? 'Yes' : 'No'}`);

    if (dryRun) {
      console.log('\n📝 Prompt Preview (Dry Run):');
      console.log('─'.repeat(40));
      console.log(promptText.substring(0, 1000) + (promptText.length > 1000 ? '\n...\n[Content truncated in dry run]' : ''));
      this.success('Dry run completed - no API call made');
      return;
    }

    this.info('Calling cloud LLM for review...');

    const reviewOptions = {
      model,
      temperature,
      maxTokens,
      systemPrompt: systemPrompt || 'You are an expert code reviewer. Analyze the provided code and return your findings in the EXACT JSON format specified in the instructions. Pay special attention to the required fields: summary, severity, category, and issues array with title and description for each issue.',
      prompt: promptText,
      format: format as 'text' | 'json' | 'table',
    };

    const composedPrompt = {
      text: promptText,
      tokenCount: tokenCount,
      sections: {
        preamble: systemPrompt || 'You are an expert code reviewer. Analyze the provided code and return your findings in the EXACT JSON format specified in the instructions. Pay special attention to the required fields: summary, severity, category, and issues array with title and description for each issue.',
        context: promptText,
        diffs: '',
        insights: '',
        instructions: '',
      },
      metadata: {
        truncated: false,
        originalTokenCount: tokenCount,
        budgetUsed: tokenCount,
        budgetRemaining: maxTokens - tokenCount,
        timestamp: new Date().toISOString(),
        allocations: {
          preamble: 100,
          context: 8000,
          diffs: 0,
          insights: 0,
          instructions: 100,
        },
      },
    };

    const reviewResult = await this.cloudReviewService!.reviewCode(composedPrompt, reviewOptions);

    if (!reviewResult.review) {
      this.error('Review failed: No review result returned');
      return;
    }

    await this.displayReviewResults(reviewResult.review, format);

    if (output) {
      await this.saveReviewToFile(reviewResult.review, output, format);
    }

    if (store) {
      await this.storeReviewResults(reviewResult, {
        preparedMetadata,
        retrievalMetadata,
        tags: tags || [],
        extractInsights: extractInsights || false,
      });
    }

    this.success('Review completed successfully');
  }

  private async displayReviewResults(review: any, format: string): Promise<void> {
    console.log('\n📋 Review Results:');
    console.log('─'.repeat(40));

    switch (format) {
      case 'json':
        console.log(JSON.stringify(review, null, 2));
        break;

      case 'table':
        
        if (review.issues && Array.isArray(review.issues)) {
          this.table(review.issues, ['severity', 'category', 'description']);
        } else {
          console.log(review.content || review);
        }
        break;

      default: 
        console.log(review.content || review);
        break;
    }

    if (review.metadata) {
      console.log('\n📊 Review Metadata:');
      console.log(`Processing Time: ${review.metadata.processingTime || 'N/A'}ms`);
      console.log(`Model: ${review.metadata.model || 'N/A'}`);
      console.log(`Token Usage: ${review.metadata.tokenUsage?.total || 'N/A'}`);
    }
  }

  private async saveReviewToFile(review: any, outputPath: string, format: string): Promise<void> {
    try {
      const outputDir = require('path').dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      let content: string;
      if (format === 'json') {
        content = JSON.stringify(review, null, 2);
      } else {
        content = review.content || String(review);
      }

      fs.writeFileSync(outputPath, content, 'utf8');
      this.success(`Review saved to: ${outputPath}`);
    } catch (error) {
      this.error(`Failed to save review: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async storeReviewResults(reviewResult: any, options: {
    preparedMetadata?: any;
    retrievalMetadata?: any;
    tags?: string[];
    extractInsights?: boolean;
  }): Promise<void> {
    try {
      
      if (!this.reviewStorageService) {
        this.reviewStorageService = new ReviewStorageService();
      }

      if (!this.qdrantStorageService) {
        this.qdrantStorageService = new QdrantReviewStorageService();
        await this.qdrantStorageService.initialize();
      }

      if (!this.insightExtractionService && options.extractInsights) {
        this.insightExtractionService = new InsightExtractionService();
        await this.insightExtractionService.initialize();
      }

      const sourceInfo = {
        title: `Code Review ${new Date().toISOString().split('T')[0]}`,
        description: options.preparedMetadata?.context || options.retrievalMetadata?.query?.text || 'Code review',
        source: (options.preparedMetadata ? 'file' : 'repository') as 'file' | 'repository',
        sourcePath: options.preparedMetadata?.context || undefined,
        tags: options.tags || [],
      };

      const storedReview = await this.reviewStorageService.storeReview(reviewResult, sourceInfo);
      this.info('Review stored locally');

      try {
        
        const mockEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5);
        await this.qdrantStorageService.storeReview(reviewResult, storedReview.metadata, mockEmbedding);
        this.info('Review stored in Qdrant');
      } catch (qdrantError) {
        this.warning('Failed to store in Qdrant (continuing): ' +
          (qdrantError instanceof Error ? qdrantError.message : String(qdrantError)));
      }

      if (options.extractInsights && this.insightExtractionService) {
        try {
          this.info('Extracting insights from review...');
          const insights = await this.insightExtractionService.extractInsights(reviewResult, storedReview.metadata.id);
          await this.insightExtractionService.generateEmbeddings(insights.insights, storedReview.metadata.id);

          this.info(`Extracted ${insights.insights.length} insights with embeddings`);
        } catch (insightError) {
          this.warning('Failed to extract insights (continuing): ' +
            (insightError instanceof Error ? insightError.message : String(insightError)));
        }
      }

      this.success('Review storage completed');

    } catch (error) {
      this.error(`Failed to store review: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const enhancedReviewCommand = new ReviewCommand();
