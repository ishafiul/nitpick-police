import { Command } from 'commander';
import { RetrievalService } from '../../services';
import { RetrievalQuery } from '../../types/retrieval';
import { ConfigManager } from '../../config';
import logger from '../../utils/logger';
import * as path from 'path';
import Table from 'cli-table3';
import chalk from 'chalk';

export function registerSearchCommand(program: Command): void {
  program
    .command('search')
    .description('Search and retrieve code chunks using semantic similarity and hybrid scoring')
    .argument('<query>', 'Search query text')
    .option('-f, --file <file>', 'Search within specific file')
    .option('-d, --directory <dir>', 'Search within specific directory')
    .option('-l, --language <lang>', 'Filter by programming language')
    .option('-t, --type <type>', 'Filter by chunk type (function, class, method, etc.)')
    .option('-k, --top-k <number>', 'Number of results to return', parseInt, 10)
    .option('--min-score <score>', 'Minimum similarity score (0.0-1.0)', parseFloat, 0.0)
    .option('--max-results <number>', 'Maximum results to search (before ranking)', parseInt)
    .option('--no-insights', 'Exclude review insights from results')
    .option('--no-metadata', 'Exclude metadata from results')
    .option('--no-content', 'Exclude content from results')
    .option('--commit <hash>', 'Search within specific commit')
    .option('--author <name>', 'Filter by author')
    .option('--created-after <date>', 'Filter by creation date (ISO format)')
    .option('--created-before <date>', 'Filter by creation date (ISO format)')
    .option('--semantic-weight <weight>', 'Semantic similarity weight (0.0-1.0)', parseFloat)
    .option('--recency-weight <weight>', 'Recency weight (0.0-1.0)', parseFloat)
    .option('--file-weight <weight>', 'File importance weight (0.0-1.0)', parseFloat)
    .option('--page <number>', 'Results page (1-based)', parseInt, 1)
    .option('--page-size <number>', 'Rows per page for display', parseInt, 10)
    .option('--max-tokens <number>', 'Token budget for retrieved content (overrides config)', parseInt)
    .option('--dry-run', 'Show the built retrieval query without executing')
    .option('--explain-scoring', 'Show detailed scoring explanation')
    .option('--verbose', 'Enable verbose logging')
    .option('--json', 'Output results in JSON format')
    .action(async (queryText: string, options) => {
      try {
        if (options.verbose) {
          logger.level = 'debug';
        }

        const configManager = new ConfigManager();
        await configManager.loadConfig();

        const budgetFromConfig = (configManager.get('retrieval.max_retrieval_tokens') ?? configManager.get('qdrant.max_retrieval_tokens')) ?? 4000;
        const tokenBudget = options.maxTokens || budgetFromConfig;

        const retrievalService = new RetrievalService();
        await retrievalService.initialize();

        const query = buildRetrievalQuery(queryText, options);
        // For downstream awareness; not used by service but useful for dry-run and docs
        (query as any).maxTokens = tokenBudget;

        if (options.dryRun) {
          console.log('🔍 Retrieval Query (dry-run):');
          console.log(JSON.stringify(query, null, 2));
          console.log(`Token budget: ${tokenBudget}`);
          return;
        }

        console.log(`🔍 Searching for: "${queryText}"`);
        console.log(`⚙️  Options: ${JSON.stringify({ ...options, maxTokens: tokenBudget }, null, 2)}\n`);

        const result = await retrievalService.retrieve(query);

        // Enforce token budget on the client by trimming chunks if needed
        const trimmed = trimToBudget(result.chunks, tokenBudget, retrievalService.getConfig().tokenEstimationBuffer);
        const effectiveEstimated = estimateTokens(trimmed, retrievalService.getConfig().tokenEstimationBuffer);
        const budgetNote = effectiveEstimated > tokenBudget ? ' (over budget)' : effectiveEstimated === 0 ? '' : '';

        const total = trimmed.length;
        const page = Math.max(1, parseInt(String(options.page || 1), 10));
        const pageSize = Math.max(1, parseInt(String(options.pageSize || 10), 10));
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const pageStart = Math.min((page - 1) * pageSize, Math.max(0, (totalPages - 1) * pageSize));
        const pageEnd = Math.min(pageStart + pageSize, total);
        const pageRows = trimmed.slice(pageStart, pageEnd);

        const pagedResult = {
          ...result,
          chunks: pageRows,
          totalChunks: total,
          estimatedTokens: effectiveEstimated,
          budget: tokenBudget,
          page,
          pageSize,
          totalPages,
        };

        if (options.json) {
          displayJsonResults(pagedResult);
        } else {
          displayFormattedResults(pagedResult, options);
          console.log(`\n📄 Showing ${pageStart + 1}-${pageEnd} of ${total} (page ${page}/${totalPages})`);
          console.log(`🔢 Estimated tokens: ${effectiveEstimated}/${tokenBudget}${budgetNote}`);
        }
      } catch (error) {
        logger.error('Semantic search failed', {
          queryText,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error('❌ Semantic search failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  program
    .command('search-file')
    .description('Search within a specific file')
    .argument('<file>', 'File path to search within')
    .argument('[query]', 'Optional search query (if not provided, returns all chunks)')
    .option('-k, --top-k <number>', 'Number of results to return', parseInt, 20)
    .option('--verbose', 'Enable verbose logging')
    .option('--json', 'Output results in JSON format')
    .action(async (filePath: string, queryText: string, options) => {
      try {
        if (options.verbose) {
          logger.level = 'debug';
        }

        const resolvedPath = path.resolve(filePath);

        const configManager = new ConfigManager();
        await configManager.loadConfig();

        const retrievalService = new RetrievalService();
        await retrievalService.initialize();

        const query: RetrievalQuery = {
          text: queryText || '',
          filter: {
            files: [resolvedPath],
          },
          topK: options.topK,
          includeInsights: true,
          includeMetadata: true,
          includeContent: true,
        };

        console.log(`📄 Searching in file: ${resolvedPath}`);
        if (queryText) {
          console.log(`🔍 Query: "${queryText}"`);
        }
        console.log(`📊 Max results: ${options.topK}\n`);

        const result = await retrievalService.retrieve(query);

        if (options.json) {
          displayJsonResults(result);
        } else {
          displayFileResults(result, resolvedPath);
        }
      } catch (error) {
        logger.error('File search failed', {
          filePath,
          queryText,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error('❌ File search failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  program
    .command('search-stats')
    .description('Show retrieval system statistics')
    .option('--verbose', 'Show detailed statistics')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager();
        await configManager.loadConfig();

        const retrievalService = new RetrievalService();
        await retrievalService.initialize();

        const stats = await retrievalService.getStats();

        console.log('📊 Retrieval System Statistics');
        console.log('='.repeat(50));
        console.log(`Qdrant Health: ${stats.qdrantHealth ? '✅ Connected' : '❌ Disconnected'}`);
        console.log('');

        console.log('📚 Collections:');
        for (const [collection, info] of Object.entries(stats.collections)) {
          const status = info.status === 'green' ? '✅' : info.status === 'yellow' ? '⚠️' : '❌';
          console.log(`  ${collection}: ${info.count.toLocaleString()} points (${status} ${info.status})`);
        }

        if (options.verbose) {
          console.log('');
          console.log('🔧 Service Configuration:');
          const config = retrievalService.getConfig();
          console.log(`  Max Concurrent Searches: ${config.maxConcurrentSearches}`);
          console.log(`  Token Estimation Buffer: ${(config.tokenEstimationBuffer * 100).toFixed(0)}%`);
          console.log(`  Default Top-K: ${config.defaultTopK}`);
          console.log(`  Default Min Score: ${config.defaultMinScore}`);
          console.log(`  Insights Integration: ${config.enableInsightsIntegration ? '✅' : '❌'}`);
          console.log(`  Insights Boost Factor: ${config.insightsBoostFactor}`);
        }
      } catch (error) {
        logger.error('Failed to get search statistics', {
          error: error instanceof Error ? error.message : String(error),
        });
        console.error('❌ Failed to get search statistics:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function buildRetrievalQuery(queryText: string, options: any): RetrievalQuery {
  const filter: any = {};

  if (options.file) {
    filter.files = [options.file];
  }

  if (options.directory) {
    const resolved = path.resolve(options.directory);
    filter.filePatterns = [resolved.endsWith('/') ? resolved + '**' : resolved + '/**'];
  }

  if ((options as any).language) {
    filter.languages = [options.language];
  }

  if ((options as any).type) {
    filter.chunkTypes = [options.type];
  }

  return {
    text: queryText,
    topK: options.topK || 10,
    minScore: options.minScore ?? 0.0,
    filter,
    includeInsights: options.noInsights ? false : true,
    includeMetadata: options.noMetadata ? false : true,
    includeContent: options.noContent ? false : true,
  } as RetrievalQuery;
}

function displayJsonResults(result: any): void {
  console.log(JSON.stringify(result, null, 2));
}

function displayFormattedResults(result: any, options: any): void {
  console.log('🔍 Search Results');
  console.log('='.repeat(50));

  const status = result.success !== false ? '✅ Success' : '❌ Completed with errors';
  console.log(`Status: ${status}`);
  console.log(`Query: "${result.query?.text || 'vector-only'}"`);
  console.log(`Results (this page): ${result.chunks?.length || 0}`);
  console.log(`Total results: ${(result.totalChunks ?? result.chunks?.length ?? 0)}`);
  console.log(`Estimated tokens: ${result.estimatedTokens || 0}`);
  console.log(`Processing time: ${result.processingTime || 0}ms`);

  if (result.appliedFilters && String(result.appliedFilters).length > 0) {
    console.log('\n🔧 Applied Filters:');
    (Array.isArray(result.appliedFilters) ? result.appliedFilters : String(result.appliedFilters).split(',')).forEach((filter: string) => {
      const f = (filter || '').trim();
      if (f) console.log(`  • ${f}`);
    });
  }

  if (result.chunks?.length > 0) {
    console.log('\n📋 Top Results:');
    displayChunkTable(result.chunks, options.explainScoring);
  }

  if (result.insights?.length > 0) {
    console.log('\n💡 Review Insights:');
    result.insights.forEach((insight: any) => {
      console.log(`  📄 ${insight.file}: ${insight.totalInsights} insights`);
      if (Object.keys(insight.categories).length > 0) {
        const categories = Object.entries(insight.categories)
          .map(([cat, count]) => `${cat}: ${count}`)
          .join(', ');
        console.log(`     Categories: ${categories}`);
      }
    });
  }

  if (result.warnings?.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach((warning: string) => {
      console.log(`  • ${warning}`);
    });
  }
}

function displayFileResults(result: any, filePath: string): void {
  console.log('📄 File Search Results');
  console.log('='.repeat(50));

  console.log(`File: ${filePath}`);
  console.log(`Chunks found: ${result.chunks?.length || 0}`);
  console.log(`Processing time: ${result.processingTime || 0}ms`);

  if (result.chunks?.length > 0) {
    console.log('\n📋 Chunks:');
    const table = new Table({
      head: [
        chalk.cyan('Line'),
        chalk.cyan('Type'),
        chalk.cyan('Score'),
        chalk.cyan('Content Preview'),
      ],
      colWidths: [8, 12, 8, 60],
      wordWrap: true,
    });

    result.chunks.forEach((chunk: any) => {
      const preview = chunk.content
        .replace(/\n/g, ' ')
        .substring(0, 50)
        .trim();

      table.push([
        `${chunk.metadata.startLine}-${chunk.metadata.endLine}`,
        chunk.metadata.chunkType,
        (chunk.score || 0).toFixed(3),
        preview + (chunk.content.length > 50 ? '...' : ''),
      ]);
    });

    console.log(table.toString());
  } else {
    console.log('\n📭 No chunks found in this file.');
  }
}

function displayChunkTable(chunks: any[], explainScoring: boolean = false): void {
  const table = new Table({
    head: [
      chalk.cyan('Rank'),
      chalk.cyan('File'),
      chalk.cyan('Line'),
      chalk.cyan('Type'),
      chalk.cyan('Score'),
      chalk.cyan('Insights'),
      chalk.cyan('Content Preview'),
    ],
    colWidths: [5, 30, 8, 10, 8, 8, 40],
    wordWrap: true,
  });

  chunks.forEach((chunk, index) => {
    const fileName = path.basename(chunk.metadata.file);
    const preview = chunk.content
      .replace(/\n/g, ' ')
      .substring(0, 35)
      .trim();

    table.push([
      (index + 1).toString(),
      fileName,
      `${chunk.metadata.startLine}-${chunk.metadata.endLine}`,
      chunk.metadata.chunkType,
      (chunk.score || 0).toFixed(3),
      chunk.insights?.length || 0,
      preview + (chunk.content.length > 35 ? '...' : ''),
    ]);
  });

  console.log(table.toString());

  if (explainScoring && chunks.length > 0) {
    console.log('\n📊 Scoring Explanation (Top Result):');
    const topChunk = chunks[0];
    console.log(`File: ${topChunk.metadata.file}`);
    console.log(`Score: ${(topChunk.score || 0).toFixed(3)}`);
    console.log(`Semantic: ${topChunk.semanticScore?.toFixed(3) || 'N/A'}`);
    console.log(`Hybrid: ${topChunk.hybridScore?.toFixed(3) || 'N/A'}`);
  }
}

function estimateTokens(chunks: any[], buffer: number): number {
  const totalChars = chunks.reduce((sum, c) => sum + (c.content?.length || 0), 0);
  return Math.ceil((totalChars / 4) * (buffer || 1));
}

function trimToBudget(chunks: any[], budget: number, buffer: number): any[] {
  if (!budget || budget <= 0) return chunks;
  let lo = 0;
  let hi = chunks.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const tokens = estimateTokens(chunks.slice(0, mid), buffer);
    if (tokens <= budget) lo = mid; else hi = mid - 1;
  }
  return chunks.slice(0, lo);
}
