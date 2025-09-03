import { Command } from 'commander';
import { RetrievalService } from '../../services/retrieval.service';
import { PromptComposer } from '../../services/prompt/composer';
import { GitChangeService } from '../../services/git/git-change.service';
import { BaseCommand, RetrievalCommandOptions } from './base-command';
import fs from 'fs';
import path from 'path';

export class PrepareCommand extends BaseCommand {
  private retrievalService?: RetrievalService;
  private promptComposer?: PromptComposer;
  private gitChangeService?: GitChangeService;

  async register(program: Command): Promise<void> {
    program
      .command('prepare')
      .description('Build review prompts without making cloud calls')
      .argument('[output-file]', 'File to save prepared prompt (optional)', 'prepared-prompt.json')
      .option('-f, --file <path>', 'Prepare prompt for specific file')
      .option('-s, --since <commit>', 'Prepare prompt for changes since commit')
      .option('-a, --all', 'Prepare prompt for all files in repository')
      .option('-k, --top-k <number>', 'Number of similar chunks to retrieve', parseInt, 5)
      .option('-b, --budget <number>', 'Token budget for the prompt', parseInt, 8000)
      .option('--include-diffs', 'Include git diffs in the prompt')
      .option('--include-insights', 'Include previous insights in the prompt')
      .option('--format <format>', 'Output format (json, text)', 'json')
      .action(async (outputFile: string, options: RetrievalCommandOptions & {
        file?: string;
        since?: string;
        all?: boolean;
        'top-k'?: number;
        'include-diffs'?: boolean;
        'include-insights'?: boolean;
        format?: string;
      }) => {
        await this.executeCommand(async () => {
          await this.handlePrepare(outputFile, options);
        }, 'Prompt Preparation');
      });
  }

  private async handlePrepare(outputFile: string, options: any): Promise<void> {
    await this.initialize();

    await this.validateGitRepository();

    this.info('Starting prompt preparation');

    this.retrievalService = new RetrievalService();
    await this.retrievalService.initialize();

    this.promptComposer = new PromptComposer();

    this.gitChangeService = new GitChangeService();
    await this.gitChangeService.initialize();

    let contextDescription = '';
    let filePaths: string[] | undefined;
    let commitRange: string | undefined;

    if (options.file) {
      
      contextDescription = `Prepare review for file: ${options.file}`;
      filePaths = [options.file];
    } else if (options.since) {
      
      contextDescription = `Prepare review for changes since commit: ${options.since}`;
      commitRange = options.since;

      const changes = await this.gitChangeService.detectChangesSinceCommit(options.since);
      filePaths = changes.changes.map(c => c.path);

      if (filePaths.length === 0) {
        this.warning(`No changes found since commit ${options.since}`);
        return;
      }

      this.info(`Found ${filePaths.length} changed files`);
    } else if (options.all) {
      
      contextDescription = 'Prepare review for all files in repository';
      
    } else {
      this.error('Please specify --file, --since, or --all option');
      return;
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

    this.info('Composing review prompt...');

    const compositionResult = await this.promptComposer.composePrompt(retrievalResult, compositionOptions);

    if (!compositionResult.success || !compositionResult.prompt) {
      this.error('Failed to compose prompt: ' + (compositionResult.errors?.[0]?.message || 'Unknown error'));
      return;
    }

    const composedPrompt = compositionResult.prompt;

    this.success('Prompt preparation completed', {
      tokenCount: composedPrompt.tokenCount,
      chunksIncluded: retrievalResult.chunks.length,
      filesAnalyzed: filePaths?.length || 'all',
    });

    const outputData = {
      metadata: {
        preparedAt: new Date().toISOString(),
        context: contextDescription,
        options: {
          file: options.file,
          since: options.since,
          all: options.all,
          topK: options['top-k'],
          budget: options.budget,
          includeDiffs: options['include-diffs'],
          includeInsights: options['include-insights'],
        },
        stats: {
          chunksRetrieved: retrievalResult.chunks.length,
          tokenCount: composedPrompt.tokenCount,
          filesAnalyzed: filePaths?.length || 'all',
        },
      },
      retrieval: {
        query: retrievalQuery,
        chunks: retrievalResult.chunks.map(chunk => ({
          id: chunk.id,
          filePath: chunk.metadata.file,
          startLine: chunk.metadata.startLine,
          endLine: chunk.metadata.endLine,
          content: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
          language: chunk.metadata.language,
          chunkType: chunk.metadata.chunkType,
          complexityScore: chunk.metadata.complexityScore,
        })),
      },
      prompt: {
        text: composedPrompt.text,
        tokenCount: composedPrompt.tokenCount,
        sections: composedPrompt.sections ? {
          preamble: composedPrompt.sections.preamble.substring(0, 100) + (composedPrompt.sections.preamble.length > 100 ? '...' : ''),
          context: composedPrompt.sections.context.substring(0, 100) + (composedPrompt.sections.context.length > 100 ? '...' : ''),
          diffs: composedPrompt.sections.diffs.substring(0, 100) + (composedPrompt.sections.diffs.length > 100 ? '...' : ''),
          insights: composedPrompt.sections.insights.substring(0, 100) + (composedPrompt.sections.insights.length > 100 ? '...' : ''),
          instructions: composedPrompt.sections.instructions.substring(0, 100) + (composedPrompt.sections.instructions.length > 100 ? '...' : ''),
        } : undefined,
      },
    };

    if (options.format === 'json' || outputFile !== 'prepared-prompt.json') {
      
      const outputPath = path.resolve(outputFile);
      const jsonContent = JSON.stringify(outputData, null, 2);

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, jsonContent, 'utf8');
      this.success(`Prepared prompt saved to: ${outputPath}`);

      console.log('\n📋 Preparation Summary:');
      console.log('─'.repeat(50));
      console.log(`Files Analyzed: ${filePaths?.length || 'all'}`);
      console.log(`Chunks Retrieved: ${retrievalResult.chunks.length}`);
      console.log(`Token Count: ${composedPrompt.tokenCount}`);
      console.log(`Output File: ${outputPath}`);

    } else {
      
      console.log('\n📋 Prepared Prompt:');
      console.log('─'.repeat(50));
      console.log(`Context: ${contextDescription}`);
      console.log(`Files: ${filePaths?.join(', ') || 'all'}`);
      console.log(`Chunks: ${retrievalResult.chunks.length}`);
      console.log(`Tokens: ${composedPrompt.tokenCount}`);

      console.log('\n📝 Prompt Preview:');
      console.log(composedPrompt.text.substring(0, 500) + (composedPrompt.text.length > 500 ? '\n...\n[Content truncated]' : ''));

      if (composedPrompt.sections) {
        console.log('\n📑 Sections:');
        const sectionNames = ['preamble', 'context', 'diffs', 'insights', 'instructions'];
        sectionNames.forEach((sectionName, index) => {
          const sectionContent = (composedPrompt.sections as any)[sectionName];
          if (sectionContent && sectionContent.trim()) {
            console.log(`  ${index + 1}. ${sectionName}: ${sectionContent.length} chars`);
          }
        });
      }
    }

    console.log('\n💡 Usage:');
    console.log('  code-review review --from-prepared prepared-prompt.json');
    console.log('  code-review review --cloud [other options]  # Single-shot review');
  }
}

export const prepareCommand = new PrepareCommand();
