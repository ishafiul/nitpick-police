import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { QdrantService } from '../../services';
import { logInfo, logWarn } from '../../utils';
import { BaseCommand } from './base-command';

export class CleanCommand extends BaseCommand {
  private qdrantService: QdrantService;

  constructor() {
    super();
    this.qdrantService = new QdrantService();
  }

  async register(program: Command): Promise<void> {
    program
      .command('clean')
      .description('Clean all Qdrant data and local files for this repository')
      .option('--force', 'Skip confirmation prompt')
      .option('--keep-config', 'Keep configuration files (only clean data)')
      .option('--dry-run', 'Show what would be cleaned without actually cleaning')
      .action(async (options: any) => {
        await this.executeCommand(async () => {
          await this.cleanRepository(options);
        }, 'Clean');
      });
  }

  private async cleanRepository(options: any): Promise<void> {
    await this.initialize();
    await this.validateGitRepository();

    const repoPath = process.cwd();
    const configDir = path.join(repoPath, '.code_review');
    
    // Check if repository is initialized
    if (!fs.existsSync(configDir)) {
      logWarn('Repository not initialized. Nothing to clean.');
      return;
    }

    const configManager = this.configManager;
    const config = configManager.getConfig();

    if (!config) {
      logWarn('No configuration found. Nothing to clean.');
      return;
    }

    // Show what will be cleaned
    const cleanPlan = await this.getCleanPlan(configDir, config);
    
    if (options.dryRun) {
      this.showCleanPlan(cleanPlan);
      return;
    }

    // Confirm action unless --force
    if (!options.force) {
      this.showCleanPlan(cleanPlan);
      const confirmed = await this.confirmAction(
        'Are you sure you want to clean all data for this repository?',
        false
      );
      
      if (!confirmed) {
        logInfo('Clean operation cancelled.');
        return;
      }
    }

    // Execute cleaning
    await this.executeClean(cleanPlan, options);
  }

  private async getCleanPlan(configDir: string, config: any): Promise<{
    localFiles: string[];
    qdrantCollections: string[];
    totalSize: number;
  }> {
    const localFiles: string[] = [];
    const qdrantCollections: string[] = [];
    let totalSize = 0;

    // Check local files
    const reviewsDir = path.join(configDir, 'reviews');
    const logsDir = path.join(configDir, 'logs');
    const promptsDir = path.join(configDir, 'prompts');

    if (fs.existsSync(reviewsDir)) {
      const files = fs.readdirSync(reviewsDir);
      files.forEach(file => {
        const filePath = path.join(reviewsDir, file);
        const stats = fs.statSync(filePath);
        localFiles.push(filePath);
        totalSize += stats.size;
      });
    }

    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir);
      files.forEach(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        localFiles.push(filePath);
        totalSize += stats.size;
      });
    }

    if (fs.existsSync(promptsDir)) {
      const files = fs.readdirSync(promptsDir);
      files.forEach(file => {
        const filePath = path.join(promptsDir, file);
        const stats = fs.statSync(filePath);
        localFiles.push(filePath);
        totalSize += stats.size;
      });
    }

    // Check Qdrant collections
    try {
      await this.qdrantService.initialize();
      
      const collections = config.qdrant?.collections || {};
      for (const [, collectionName] of Object.entries(collections)) {
        try {
          const stats = await this.qdrantService.getCollectionStats(collectionName as string);
          if (stats.count > 0) {
            qdrantCollections.push(collectionName as string);
          }
        } catch (error: any) {
          // Collection might not exist (404/Not Found) or other error
          if (error?.message?.includes('Not Found') || error?.status === 404) {
            // Collection doesn't exist, that's fine - nothing to clean
            continue;
          }
          // Log other errors but continue
          logWarn(`Could not check collection ${collectionName}:`, error?.message || error);
        }
      }
    } catch (error: any) {
      logWarn('Could not connect to Qdrant to check collections:', error?.message || error);
    }

    return { localFiles, qdrantCollections, totalSize };
  }

  private showCleanPlan(plan: { localFiles: string[]; qdrantCollections: string[]; totalSize: number }): void {
    console.log(chalk.yellow('\n🧹 Clean Plan:'));
    console.log(chalk.gray('─'.repeat(50)));

    if (plan.localFiles.length > 0) {
      console.log(chalk.blue(`📁 Local Files (${plan.localFiles.length} files, ${this.formatFileSize(plan.totalSize)}):`));
      plan.localFiles.forEach(file => {
        const relativePath = path.relative(process.cwd(), file);
        console.log(chalk.gray(`  • ${relativePath}`));
      });
    } else {
      console.log(chalk.gray('📁 No local files to clean'));
    }

    if (plan.qdrantCollections.length > 0) {
      console.log(chalk.blue(`🗄️  Qdrant Collections (${plan.qdrantCollections.length} collections):`));
      plan.qdrantCollections.forEach(collection => {
        console.log(chalk.gray(`  • ${collection}`));
      });
    } else {
      console.log(chalk.gray('🗄️  No Qdrant collections to clean'));
    }

    if (plan.localFiles.length === 0 && plan.qdrantCollections.length === 0) {
      console.log(chalk.green('✨ Nothing to clean - repository is already clean!'));
    }
  }

  private async executeClean(plan: { localFiles: string[]; qdrantCollections: string[]; totalSize: number }, options: any): Promise<void> {
    let cleanedFiles = 0;
    let cleanedCollections = 0;

    // Clean local files
    if (plan.localFiles.length > 0) {
      logInfo(chalk.blue('🧹 Cleaning local files...'));
      
      for (const file of plan.localFiles) {
        try {
          fs.unlinkSync(file);
          cleanedFiles++;
        } catch (error) {
          logWarn(`Failed to delete ${file}:`, error);
        }
      }

      // Remove empty directories
      const dirsToCheck = ['.code_review/reviews', '.code_review/logs', '.code_review/prompts'];
      for (const dir of dirsToCheck) {
        const fullPath = path.join(process.cwd(), dir);
        if (fs.existsSync(fullPath)) {
          try {
            const files = fs.readdirSync(fullPath);
            if (files.length === 0) {
              fs.rmdirSync(fullPath);
            }
          } catch (error) {
            // Directory not empty or other error, ignore
          }
        }
      }
    }

    // Clean Qdrant collections
    if (plan.qdrantCollections.length > 0) {
      logInfo(chalk.blue('🗄️  Cleaning Qdrant collections...'));
      
      try {
        await this.qdrantService.initialize();
        
        for (const collection of plan.qdrantCollections) {
          try {
            // Delete all points in the collection
            await this.qdrantService.getQdrantManager().deleteCollection(collection);
            cleanedCollections++;
            logInfo(chalk.green(`  ✅ Cleaned collection: ${collection}`));
          } catch (error: any) {
            if (error?.message?.includes('Not Found') || error?.status === 404) {
              // Collection doesn't exist, that's fine
              logInfo(chalk.gray(`  ⚪ Collection ${collection} doesn't exist (already clean)`));
            } else {
              logWarn(`Failed to clean collection ${collection}:`, error?.message || error);
            }
          }
        }
      } catch (error) {
        logWarn('Failed to connect to Qdrant:', error);
      }
    }

    // Remove config if not keeping it
    if (!options.keepConfig) {
      const configDir = path.join(process.cwd(), '.code_review');
      if (fs.existsSync(configDir)) {
        try {
          fs.rmSync(configDir, { recursive: true, force: true });
          logInfo(chalk.green('🗑️  Removed configuration directory'));
        } catch (error) {
          logWarn('Failed to remove configuration directory:', error);
        }
      }
    }

    // Summary
    console.log(chalk.green('\n✨ Clean completed!'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(chalk.green(`📁 Cleaned ${cleanedFiles} local files`));
    console.log(chalk.green(`🗄️  Cleaned ${cleanedCollections} Qdrant collections`));
    
    if (!options.keepConfig) {
      console.log(chalk.green('🗑️  Removed configuration'));
      console.log(chalk.yellow('💡 Run "np init" to reinitialize the repository'));
    } else {
      console.log(chalk.blue('⚙️  Configuration preserved'));
    }
  }

  protected override formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

export function registerCleanCommand(program: Command): void {
  const cleanCommand = new CleanCommand();
  cleanCommand.register(program);
}
