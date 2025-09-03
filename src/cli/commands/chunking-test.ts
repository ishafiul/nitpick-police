import { Command } from 'commander';
import { ChunkingService } from '../../services';
import { ConfigManager } from '../../config';
import logger from '../../utils/logger';
import fs from 'fs';
import path from 'path';

export const chunkingTestCommand = new Command('chunking-test')
  .description('Test chunking strategies on files or directories')
  .argument('[files...]', 'Files or directories to test chunking on')
  .option('-r, --recursive', 'Recursively process directories', false)
  .option('-l, --language <language>', 'Force specific language detection')
  .option('-s, --strategy <strategy>', 'Force specific chunking strategy')
  .option('--max-files <number>', 'Maximum number of files to process', parseInt, 10)
  .option('--batch-size <number>', 'Batch size for processing', parseInt, 5)
  .option('--show-content', 'Show chunk content in output', false)
  .option('--output-json', 'Output results as JSON', false)
  .option('--verbose', 'Enable verbose logging', false)
  .action(async (files: string[], options) => {
    try {
      
      if (options.verbose) {
        logger.level = 'debug';
      }

      logger.info('Starting chunking test', { files, options });

      const configManager = new ConfigManager();
      await configManager.loadConfig();

      const chunkingService = new ChunkingService();
      await chunkingService.initialize();

      let filesToProcess: string[] = [];

      if (files.length === 0) {
        
        filesToProcess = await findCodeFiles(process.cwd(), options.recursive, options.maxFiles);
        logger.info('Auto-discovered files', { count: filesToProcess.length });
      } else {
        
        for (const file of files) {
          if (fs.existsSync(file)) {
            const stat = fs.statSync(file);
            if (stat.isDirectory()) {
              const dirFiles = await findCodeFiles(file, options.recursive, options.maxFiles);
              filesToProcess.push(...dirFiles);
            } else {
              filesToProcess.push(file);
            }
          } else {
            logger.warn('File not found', { file });
          }
        }
      }

      if (options.maxFiles && filesToProcess.length > options.maxFiles) {
        filesToProcess = filesToProcess.slice(0, options.maxFiles);
        logger.info('Limited files to process', { limit: options.maxFiles });
      }

      if (filesToProcess.length === 0) {
        console.log('No files found to process. Try specifying files or running in a directory with code files.');
        return;
      }

      console.log(`📁 Found ${filesToProcess.length} files to process\n`);

    const results: Array<{
      file: string;
      success: boolean;
      chunks: number;
      strategy: string;
      processingTime: number;
      error?: string;
      language: string;
      totalLines: number;
      avgChunkSize: number;
    }> = [];

      for (let i = 0; i < filesToProcess.length; i += options.batchSize) {
        const batch = filesToProcess.slice(i, i + options.batchSize);

        console.log(`🔄 Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(filesToProcess.length / options.batchSize)} (${batch.length} files)`);

        const batchPromises = batch.map(async (filePath) => {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const language = options.language || detectLanguageFromPath(filePath);

            console.log(`  📄 Processing: ${path.relative(process.cwd(), filePath)} (${language})`);

            const result = await chunkingService.testChunking(filePath, content, {
              strategy: options.strategy,
            });

            const totalLines = content.split('\n').length;
            const avgChunkSize = result.chunks.length > 0
              ? result.chunks.reduce((sum, chunk) => sum + (chunk.endLine - chunk.startLine + 1), 0) / result.chunks.length
              : 0;

            if (result.success) {
              console.log(`    ✅ Success: ${result.chunks.length} chunks, ${result.processingTime}ms`);
              if (options.verbose) {
                console.log(`       Strategy: ${result.strategy}`);
                console.log(`       Lines: ${totalLines}, Avg chunk size: ${avgChunkSize.toFixed(1)}`);
                console.log(`       Chunk types: ${getChunkTypeSummary(result.chunks)}`);
              }
            } else {
              console.log(`    ❌ Failed: ${result.error}`);
            }

            return {
              file: filePath,
              success: result.success,
              chunks: result.chunks.length,
              strategy: result.strategy,
              processingTime: result.processingTime,
              error: result.error,
              language,
              totalLines,
              avgChunkSize,
            };

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`    ❌ Error: ${errorMessage}`);

            return {
              file: filePath,
              success: false,
              chunks: 0,
              strategy: 'unknown',
              processingTime: 0,
              error: errorMessage as string | undefined,
              language: options.language || 'unknown',
              totalLines: 0,
              avgChunkSize: 0,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...(batchResults as typeof results));

        console.log(''); 
      }

      printSummary(results, options);

      if (options.outputJson) {
        console.log('\n📄 JSON Output:');
        console.log(JSON.stringify(results, null, 2));
      }

    } catch (error) {
      logger.error('Chunking test failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('❌ Chunking test failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function findCodeFiles(
  dirPath: string,
  recursive: boolean = false,
  maxFiles?: number
): Promise<string[]> {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.dart', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb'
  ];

  const files: string[] = [];

  function scanDirectory(currentPath: string): void {
    if (maxFiles && files.length >= maxFiles) {
      return;
    }

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (maxFiles && files.length >= maxFiles) {
          return;
        }

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          if (!recursive || ['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            continue;
          }
          scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (codeExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to scan directory', { path: currentPath, error: String(error) });
    }
  }

  scanDirectory(dirPath);
  return files;
}

function detectLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
      return 'javascript';
    case '.jsx':
      return 'jsx';
    case '.dart':
      return 'dart';
    case '.py':
      return 'python';
    case '.java':
      return 'java';
    case '.cpp':
    case '.cc':
    case '.cxx':
      return 'cpp';
    case '.c':
      return 'c';
    case '.cs':
      return 'csharp';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.php':
      return 'php';
    case '.rb':
      return 'ruby';
    default:
      return 'unknown';
  }
}

function getChunkTypeSummary(chunks: any[]): string {
  const typeCount: Record<string, number> = {};

  chunks.forEach(chunk => {
    typeCount[chunk.chunkType] = (typeCount[chunk.chunkType] || 0) + 1;
  });

  return Object.entries(typeCount)
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');
}

function printSummary(
  results: Array<{
    file: string;
    success: boolean;
    chunks: number;
    strategy: string;
    processingTime: number;
    error?: string;
    language: string;
    totalLines: number;
    avgChunkSize: number;
  }>,
  _options: any
): void {
  const totalFiles = results.length;
  const successfulFiles = results.filter(r => r.success).length;
  const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);
  const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
  const totalLines = results.reduce((sum, r) => sum + r.totalLines, 0);

  console.log('📊 Chunking Test Summary');
  console.log('=' .repeat(50));
  console.log(`📁 Files processed: ${totalFiles}`);
  console.log(`✅ Successful: ${successfulFiles} (${((successfulFiles / totalFiles) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${totalFiles - successfulFiles}`);
  console.log(`📄 Total chunks: ${totalChunks}`);
  console.log(`📏 Total lines: ${totalLines}`);
  console.log(`⏱️  Total processing time: ${totalProcessingTime}ms`);
  console.log(`🏃 Avg processing time per file: ${(totalProcessingTime / totalFiles).toFixed(1)}ms`);

  if (successfulFiles > 0) {
    const avgChunksPerFile = totalChunks / successfulFiles;
    const avgLinesPerChunk = totalLines / totalChunks;
    console.log(`📦 Avg chunks per file: ${avgChunksPerFile.toFixed(1)}`);
    console.log(`📏 Avg lines per chunk: ${avgLinesPerChunk.toFixed(1)}`);
  }

  const strategyCount: Record<string, number> = {};
  results.forEach(r => {
    strategyCount[r.strategy] = (strategyCount[r.strategy] || 0) + 1;
  });

  console.log('\n🎯 Strategy Usage:');
  Object.entries(strategyCount).forEach(([strategy, count]) => {
    console.log(`  ${strategy}: ${count} files`);
  });

  const languageCount: Record<string, number> = {};
  results.forEach(r => {
    languageCount[r.language] = (languageCount[r.language] || 0) + 1;
  });

  console.log('\n🌍 Language Breakdown:');
  Object.entries(languageCount).forEach(([language, count]) => {
    console.log(`  ${language}: ${count} files`);
  });

  const failures = results.filter(r => !r.success);
  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    failures.forEach(failure => {
      console.log(`  ${path.relative(process.cwd(), failure.file)}: ${failure.error}`);
    });
  }
}
