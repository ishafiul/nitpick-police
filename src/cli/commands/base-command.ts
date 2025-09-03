import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from '../../config';
import logger from '../../utils/logger';

export abstract class BaseCommand {
  protected configManager: ConfigManager;
  protected isInitialized: boolean = false;

  constructor() {
    this.configManager = new ConfigManager();
  }

  protected async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.configManager.loadConfig();
      this.isInitialized = true;
      logger.debug(`${this.constructor.name} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.constructor.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  protected getConfig(): ConfigManager {
    return this.configManager;
  }

  protected async executeCommand<T>(
    commandFn: () => Promise<T>,
    commandName?: string
  ): Promise<T> {
    const name = commandName || this.constructor.name;

    try {
      logger.debug(`Starting ${name} execution`);
      const result = await commandFn();
      logger.debug(`${name} completed successfully`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`${name} failed`, { error: errorMessage });

      console.error(chalk.red(`❌ ${name} failed:`));
      console.error(chalk.gray(errorMessage));

      process.exit(1);
    }
  }

  protected async validateGitRepository(): Promise<void> {
    const fs = require('fs');
    const path = require('path');

    let currentDir = process.cwd();
    let found = false;

    while (currentDir !== path.parse(currentDir).root) {
      if (fs.existsSync(path.join(currentDir, '.git'))) {
        found = true;
        break;
      }
      currentDir = path.dirname(currentDir);
    }

    if (!found) {
      throw new Error('Not in a git repository. Please run this command from within a git repository.');
    }
  }

  protected success(message: string, data?: any): void {
    console.log(chalk.green(`✅ ${message}`));
    if (data && logger.level === 'debug') {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }

  protected info(message: string, data?: any): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
    if (data && logger.level === 'debug') {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }

  protected warning(message: string): void {
    console.log(chalk.yellow(`⚠️  ${message}`));
  }

  protected error(message: string): void {
    console.log(chalk.red(`❌ ${message}`));
  }

  protected table(data: any[], headers?: string[]): void {
    if (data.length === 0) {
      console.log(chalk.gray('No data to display'));
      return;
    }

    const keys = headers || Object.keys(data[0]);
    const colWidths: { [key: string]: number } = {};

    keys.forEach(key => {
      colWidths[key] = Math.max(key.length, ...data.map(row => String(row[key] || '').length));
    });

    const headerRow = keys.map(key => chalk.bold(key.padEnd(colWidths[key] || 0))).join(' │ ');
    console.log(headerRow);

    const separator = keys.map(key => '─'.repeat(colWidths[key] || 0)).join('─┼─');
    console.log(chalk.gray(separator));

    data.forEach(row => {
      const dataRow = keys.map(key => String(row[key] || '').padEnd(colWidths[key] || 0)).join(' │ ');
      console.log(dataRow);
    });
  }

  protected progress(current: number, total: number, item?: string): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    const itemText = item ? ` ${item}` : '';

    process.stdout.write(`\r${progressBar} ${percentage}% (${current}/${total})${itemText}`);
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  private createProgressBar(percentage: number, width: number = 30): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);

    return chalk.green(filledBar) + chalk.gray(emptyBar);
  }

  protected async confirmAction(message: string, defaultYes: boolean = false): Promise<boolean> {
    const readline = require('readline');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise(resolve => {
      const prompt = defaultYes ? `${message} (Y/n): ` : `${message} (y/N): `;
      rl.question(prompt, (answer: string) => {
        rl.close();
        const normalized = answer.toLowerCase().trim();
        if (normalized === '') {
          resolve(defaultYes);
        } else {
          resolve(normalized === 'y' || normalized === 'yes');
        }
      });
    });
  }

  protected formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  protected formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  abstract register(program: Command): void;
}

export interface CommonCommandOptions {
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
  'no-color'?: boolean;
}

export interface RepositoryCommandOptions extends CommonCommandOptions {
  'repository-path'?: string;
  force?: boolean;
}

export interface IndexCommandOptions extends RepositoryCommandOptions {
  'max-files'?: number;
  'batch-size'?: number;
  'skip-embeddings'?: boolean;
  'skip-storage'?: boolean;
  'dry-run'?: boolean;
  'no-incremental'?: boolean;
  since?: string;
  incremental?: boolean;
  maxFiles?: number;
  batchSize?: number;
  skipEmbeddings?: boolean;
  skipStorage?: boolean;
  dryRun?: boolean;
}

export interface RetrievalCommandOptions extends CommonCommandOptions {
  'top-k'?: number;
  'min-score'?: number;
  'include-metadata'?: boolean;
}

export interface ReviewCommandOptions extends RetrievalCommandOptions {
  model?: string;
  'max-tokens'?: number;
  temperature?: number;
  store?: boolean;
  'extract-insights'?: boolean;
  tags?: string;
  output?: string;
}

export interface SearchCommandOptions extends CommonCommandOptions {
  'collection'?: string;
  'limit'?: number;
  'score-threshold'?: number;
  'include-vectors'?: boolean;
}

export function createCommand(name: string, description: string): Command {
  return new Command(name)
    .description(description)
    .option('-v, --verbose', 'Enable verbose output')
    .option('-q, --quiet', 'Suppress non-essential output')
    .option('--json', 'Output in JSON format')
    .option('--no-color', 'Disable colored output');
}
