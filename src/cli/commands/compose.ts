import { Command } from 'commander';
import { RetrievalService, PromptComposer } from '../../services';
import { PromptOptions, DefaultPromptOptions } from '../../types/prompt';
import { RetrievalQuery } from '../../types/retrieval';
import { ConfigManager } from '../../config';
import logger from '../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';

export function registerComposeCommand(program: Command): void {
  program
    .command('compose')
    .description('Compose prompts for cloud LLM analysis based on retrieved context')
    .argument('<query>', 'Query text to search for relevant code')
    .option('-o, --output <file>', 'Save composed prompt to file')
    .option('--preview', 'Preview prompt composition without building it')
    .option('--dry-run', 'Show what would be composed without actually doing it')
    .option('-f, --file <file>', 'Search within specific file')
    .option('-d, --directory <dir>', 'Search within specific directory')
    .option('-l, --language <lang>', 'Filter by programming language')
    .option('-t, --type <type>', 'Filter by chunk type (function, class, method, etc.)')
    .option('-k, --top-k <number>', 'Number of chunks to retrieve', parseInt, 10)
    .option('--min-score <score>', 'Minimum similarity score', parseFloat, 0.0)
    .option('--token-budget <number>', 'Maximum token budget for prompt', parseInt, 8000)
    .option('--format <format>', 'Response format: json, markdown, text', 'json')
    .option('--max-issues <number>', 'Maximum number of issues to report', parseInt, 10)
    .option('--no-insights', 'Exclude review insights from prompt')
    .option('--no-diffs', 'Exclude code diffs from prompt')
    .option('--guidelines <file>', 'Load review guidelines from file')
    .option('--commit-from <hash>', 'Start commit for diff analysis')
    .option('--commit-to <hash>', 'End commit for diff analysis')
    .option('--verbose', 'Enable verbose logging')
    .option('--json', 'Output in JSON format')
    .action(async (queryText: string, options) => {
      try {
        if (options.verbose) {
          logger.level = 'debug';
        }

        const configManager = new ConfigManager();
        await configManager.loadConfig();

        const retrievalService = new RetrievalService();
        await retrievalService.initialize();

        const promptComposer = new PromptComposer();

        const retrievalQuery = buildRetrievalQuery(queryText, options);
        const promptOptions = await buildPromptOptions(options);

        console.log(`🔍 Retrieving context for: "${queryText}"`);
        console.log(`📝 Composing prompt with ${promptOptions.tokenBudget} token budget`);

        if (options.preview) {
          console.log('\n🔮 Preview Mode - Estimating composition...');
          const preview = await promptComposer.previewComposition(
            { query: retrievalQuery, chunks: [], insights: [] } as any,
            promptOptions
          );

          displayPreview(preview, promptOptions);

          if (!options.dryRun) {
            console.log('\n📋 Retrieving context...');
            const retrievalResult = await retrievalService.retrieve(retrievalQuery);
            console.log(`✅ Retrieved ${retrievalResult.chunks?.length || 0} chunks`);
            console.log(`💡 Found ${retrievalResult.insights?.length || 0} insights`);
            const result = await promptComposer.composePrompt(retrievalResult, promptOptions);
            displayCompositionResult(result, options);
          }
        } else {
          console.log('\n📋 Retrieving context...');
          const retrievalResult = await retrievalService.retrieve(retrievalQuery);
          console.log(`✅ Retrieved ${retrievalResult.chunks?.length || 0} chunks`);
          console.log(`💡 Found ${retrievalResult.insights?.length || 0} insights`);

          if (options.dryRun) {
            console.log('\n🔍 Dry run - would compose prompt with:');
            console.log(`  - ${retrievalResult.chunks?.length || 0} code chunks`);
            console.log(`  - ${retrievalResult.insights?.length || 0} review insights`);
            console.log(`  - ${promptOptions.tokenBudget} token budget`);
            console.log(`  - ${promptOptions.responseFormat} response format`);
            return;
          }

          const result = await promptComposer.composePrompt(retrievalResult, promptOptions);
          displayCompositionResult(result, options);

          if (options.output && result.success && result.prompt) {
            await savePromptToFile(result.prompt, options.output);
            console.log(`💾 Prompt saved to: ${options.output}`);
          }
        }
      } catch (error) {
        logger.error('Prompt composition failed', {
          queryText,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error('❌ Prompt composition failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

export const composePreviewCommand = new Command('compose-preview')
  .description('Preview prompt composition without retrieving context')
  .option('--token-budget <number>', 'Token budget for prompt', parseInt, 8000)
  .option('--format <format>', 'Response format: json, markdown, text', 'json')
  .option('--max-issues <number>', 'Maximum number of issues to report', parseInt, 10)
  .option('--guidelines <file>', 'Load review guidelines from file')
  .option('--verbose', 'Enable verbose logging')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      if (options.verbose) {
        logger.level = 'debug';
      }

      const promptComposer = new PromptComposer();
      const promptOptions = await buildPromptOptions(options);

      console.log('🔮 Previewing prompt composition structure...');
      console.log(`📊 Token budget: ${promptOptions.tokenBudget}`);
      console.log(`📝 Response format: ${promptOptions.responseFormat}`);
      console.log(`🎯 Max issues: ${promptOptions.maxIssues}`);

      const mockRetrieval = {
        query: { text: 'sample query' } as RetrievalQuery,
        chunks: [],
        insights: [],
      } as any;

      const preview = await promptComposer.previewComposition(mockRetrieval, promptOptions);
      displayPreview(preview, promptOptions);
    } catch (error) {
      logger.error('Preview failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('❌ Preview failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function buildRetrievalQuery(queryText: string, options: any): RetrievalQuery {
  const filter: any = {};

  if (options.file) {
    filter.files = [options.file];
  }

  if (options.directory) {
    const resolved = path.resolve(options.directory);
    filter.filePatterns = [resolved.endsWith('/') ? resolved + '**' : resolved + '/**'];
  }

  if (options.language) {
    filter.languages = [options.language];
  }

  if (options.type) {
    filter.chunkTypes = [options.type];
  }

  return {
    text: queryText,
    topK: options.topK || 10,
    minScore: options.minScore ?? 0.0,
    filter,
    includeInsights: options.noInsights ? false : true,
    includeMetadata: true,
    includeContent: true,
  } as RetrievalQuery;
}

async function buildPromptOptions(options: any): Promise<PromptOptions> {
  const promptOptions: PromptOptions = {
    ...DefaultPromptOptions,
    tokenBudget: options.tokenBudget || 8000,
    responseFormat: (options.format as 'json' | 'markdown' | 'text') || 'json',
    maxIssues: options.maxIssues,
    includeDiffs: !options.noDiffs,
    includeInsights: !options.noInsights,
  };

  if (options.guidelines) {
    try {
      const guidelinesPath = path.resolve(options.guidelines);
      const guidelines = await fs.readFile(guidelinesPath, 'utf-8');
      promptOptions.guidelines = guidelines;
      console.log(`📚 Loaded guidelines from: ${guidelinesPath}`);
    } catch (error) {
      console.warn(`⚠️  Could not load guidelines from ${options.guidelines}:`, error instanceof Error ? error.message : String(error));
    }
  }

  if (options.commitFrom || options.commitTo) {
    promptOptions.commitRange = {
      from: options.commitFrom || 'HEAD~1',
      to: options.commitTo || 'HEAD',
    };
  }

  return promptOptions;
}

function displayPreview(preview: any, options: PromptOptions): void {
  console.log('\n📊 Composition Preview:');
  console.log('='.repeat(50));
  console.log(`Estimated tokens: ${preview.estimatedTokenCount}`);
  console.log(`Budget utilization: ${preview.budgetUtilization.toFixed(1)}%`);
  console.log(`Token budget: ${options.tokenBudget}`);

  console.log('\n📋 Section Breakdown:');
  const table = new Table({
    head: [chalk.cyan('Section'), chalk.cyan('Tokens'), chalk.cyan('Percentage')],
    colWidths: [15, 10, 12],
  });

  const totalTokens = preview.estimatedTokenCount;
  for (const [section, tokens] of Object.entries(preview.sectionsBreakdown)) {
    const percentage = totalTokens > 0 ? (((tokens as number) / totalTokens) * 100).toFixed(1) : '0.0';
    table.push([section, (tokens as number).toString(), `${percentage}%`]);
  }

  console.log(table.toString());

  if (preview.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    preview.warnings.forEach((warning: string) => {
      console.log(`  • ${warning}`);
    });
  }

  const status = preview.budgetUtilization > 100 ? '❌ Over budget' : preview.budgetUtilization > 80 ? '⚠️  High utilization' : '✅ Within budget';
  console.log(`\n📊 Status: ${status}`);
}

function displayCompositionResult(result: any, options: any): void {
  if (!result.success) {
    console.log('\n❌ Composition failed:');
    result.errors?.forEach((error: any) => {
      console.log(`  • ${error.message}`);
      if (error.details) {
        console.log(`    Details: ${JSON.stringify(error.details, null, 2)}`);
      }
    });
    return;
  }

  const prompt = result.prompt!;
  console.log('\n✅ Composition successful!');
  console.log('='.repeat(50));
  console.log(`Final tokens: ${prompt.tokenCount}`);
  console.log(`Budget used: ${prompt.metadata.budgetUsed}`);
  console.log(`Budget remaining: ${prompt.metadata.budgetRemaining}`);

  if (prompt.metadata.truncated) {
    console.log(`⚠️  Prompt was truncated (original: ${prompt.metadata.originalTokenCount} tokens)`);
  }

  if (options.json) {
    console.log('\n📄 Composed Prompt (JSON):');
    console.log(JSON.stringify(prompt, null, 2));
  } else {
    console.log('\n📄 Composed Prompt Preview:');
    console.log('-'.repeat(30));

    const preview = prompt.text.length > 500 ? prompt.text.substring(0, 500) + '\n\n[...truncated for display...]' : prompt.text;

    console.log(preview);
    console.log('-'.repeat(30));

    console.log(`\n📊 Full prompt: ${prompt.text.length} characters, ${prompt.tokenCount} tokens`);
  }
}

async function savePromptToFile(prompt: any, filePath: string): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);
  await fs.mkdir(dir, { recursive: true });

  const data = {
    prompt: prompt.text,
    metadata: prompt.metadata,
    sections: prompt.sections,
    timestamp: new Date().toISOString(),
  };

  await fs.writeFile(resolvedPath, JSON.stringify(data, null, 2), 'utf-8');

  if (filePath.endsWith('.txt')) {
    await fs.writeFile(resolvedPath.replace('.txt', '.prompt.txt'), prompt.text, 'utf-8');
  }
}
