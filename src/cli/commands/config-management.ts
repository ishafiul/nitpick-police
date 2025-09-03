import { Command } from 'commander';
import { BaseCommand } from './base-command';
import { MigrationResult } from '../../config/migrations';
import fs from 'fs';

export class ConfigManagementCommand extends BaseCommand {
  constructor() {
    super();
  }

  override register(program: Command): void {
    const configCmd = program
      .command('config-mgmt')
      .description('Configuration management and migration tools');

    configCmd
      .command('show')
      .description('Show current configuration')
      .option('--section <section>', 'Show specific configuration section')
      .option('--format <format>', 'Output format (json, yaml)', 'json')
      .action(async (options) => {
        await this.executeCommand(async () => {
          await this.handleShowConfig(options);
        }, 'Show Configuration');
      });

    configCmd
      .command('check-migration')
      .description('Check if configuration needs migration')
      .action(async () => {
        await this.executeCommand(async () => {
          await this.handleCheckMigration();
        }, 'Check Migration');
      });

    configCmd
      .command('migrate')
      .description('Migrate configuration to latest version')
      .option('--dry-run', 'Show what would be migrated without making changes')
      .option('--create-backup', 'Create backup before migration')
      .option('--backup-dir <dir>', 'Backup directory', '.code_review/backups')
      .action(async (options) => {
        await this.executeCommand(async () => {
          await this.handleMigrateConfig(options);
        }, 'Migrate Configuration');
      });

    configCmd
      .command('recommendations')
      .description('Get migration recommendations')
      .action(async () => {
        await this.executeCommand(async () => {
          await this.handleMigrationRecommendations();
        }, 'Migration Recommendations');
      });

    configCmd
      .command('validate')
      .description('Validate current configuration')
      .action(async () => {
        await this.executeCommand(async () => {
          await this.handleValidateConfig();
        }, 'Validate Configuration');
      });

    configCmd
      .command('list-migrations')
      .description('List available migration versions')
      .action(async () => {
        await this.executeCommand(async () => {
          await this.handleListMigrations();
        }, 'List Migrations');
      });

    configCmd
      .command('init')
      .description('Create default configuration file')
      .option('--force', 'Overwrite existing configuration')
      .action(async (options) => {
        await this.executeCommand(async () => {
          await this.handleInitConfig(options);
        }, 'Initialize Configuration');
      });
  }

  private async handleShowConfig(options: any): Promise<void> {
    await this.initialize();

    if (!this.getConfig().isLoaded()) {
      this.error('Configuration not loaded');
      return;
    }

    const config = this.getConfig().getConfig();

    if (options.section) {
      const sectionData = this.getConfig().get(options.section);
      if (sectionData === undefined) {
        this.error(`Configuration section '${options.section}' not found`);
        return;
      }

      if (options.format === 'json') {
        console.log(JSON.stringify({ [options.section]: sectionData }, null, 2));
      } else {
        console.log(`${options.section}:`);
        console.log(JSON.stringify(sectionData, null, 2));
      }
    } else {
      if (options.format === 'json') {
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log('Current Configuration:');
        console.log('─'.repeat(50));
        console.log(`Version: ${config.version || 'N/A'}`);
        console.log(`Schema Version: ${config.schema_version || 'N/A'}`);
        console.log(`Environment: ${config.environment || 'N/A'}`);
        console.log(`Cloud Enabled: ${config.cloudEnabled || false}`);

        if (config.local_llm) {
          console.log('\nLocal LLM:');
          console.log(`  Provider: ${config.local_llm.provider}`);
          console.log(`  Model: ${config.local_llm.model}`);
        }

        if (config.cloud_llm) {
          console.log('\nCloud LLM:');
          console.log(`  Provider: ${config.cloud_llm.provider}`);
          console.log(`  Model: ${config.cloud_llm.model}`);
        }

        if (config.qdrant) {
          console.log('\nQdrant:');
          console.log(`  URL: ${config.qdrant.url}`);
          console.log(`  Collections: ${Object.keys(config.qdrant.collections || {}).length}`);
        }
      }
    }

    this.success('Configuration displayed successfully');
  }

  private async handleCheckMigration(): Promise<void> {
    await this.initialize();

    if (!this.getConfig().isLoaded()) {
      this.error('Configuration not loaded');
      return;
    }

    const needsMigration = this.getConfig().needsMigration();

    if (needsMigration) {
      this.warning('Configuration needs migration to latest version');

      const recommendations = this.getConfig().getMigrationRecommendations();
      if (recommendations.length > 0) {
        console.log('\nMigration Recommendations:');
        recommendations.forEach((rec, index) => {
          console.log(`  ${index + 1}. ${rec}`);
        });
      }

      console.log('\nRun: code-review config-mgmt migrate');
    } else {
      this.success('Configuration is up to date');
    }
  }

  private async handleMigrateConfig(options: any): Promise<void> {
    await this.initialize();

    if (!this.getConfig().isLoaded()) {
      this.error('Configuration not loaded');
      return;
    }

    this.info('Starting configuration migration...');

    try {
      const result: MigrationResult = await this.getConfig().migrateConfiguration({
        dryRun: options['dry-run'],
        createBackup: options['create-backup'],
        backupDir: options['backup-dir'],
      });

      if (options['dry-run']) {
        console.log('\n📋 Migration Preview:');
        console.log('─'.repeat(40));
        console.log(`From: ${result.fromVersion}`);
        console.log(`To: ${result.toVersion}`);

        if (result.changes && result.changes.length > 0) {
          console.log('\nChanges:');
          result.changes.forEach(change => console.log(`  ✓ ${change}`));
        }

        if (result.warnings.length > 0) {
          console.log('\nWarnings:');
          result.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
        }

        this.success('Migration preview completed');
      } else {
        if (result.success) {
          this.success(`Configuration migrated from ${result.fromVersion} to ${result.toVersion}`);

          if (result.changes && result.changes.length > 0) {
            console.log('\nChanges Applied:');
            result.changes.forEach(change => console.log(`  ✓ ${change}`));
          }
        } else {
          this.error('Migration failed');
          result.errors.forEach(error => console.log(`  ❌ ${error}`));
        }
      }
    } catch (error) {
      this.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleMigrationRecommendations(): Promise<void> {
    await this.initialize();

    if (!this.getConfig().isLoaded()) {
      this.error('Configuration not loaded');
      return;
    }

    const recommendations = this.getConfig().getMigrationRecommendations();

    if (recommendations.length === 0) {
      this.success('No migration recommendations - configuration is current');
    } else {
      console.log('Migration Recommendations:');
      console.log('─'.repeat(40));
      recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });

      console.log('\nTo apply migrations:');
      console.log('  code-review config-mgmt migrate');
      console.log('  code-review config-mgmt migrate --dry-run  # Preview changes');
    }
  }

  private async handleValidateConfig(): Promise<void> {
    await this.initialize();

    if (!this.getConfig().isLoaded()) {
      this.error('Configuration not loaded');
      return;
    }

    try {
      const compatibility = await this.getConfig().getCompatibilityInfo();

      if (compatibility.compatible) {
        this.success('Configuration is valid and compatible');
      } else {
        this.warning('Configuration compatibility issues found:');
        const issues: string[] = (compatibility as any).issues || compatibility.warnings || [];
        issues.forEach((issue: string) => {
          console.log(`  ⚠️  ${issue}`);
        });
      }
    } catch (error) {
      this.error(`Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleListMigrations(): Promise<void> {
    const migrations = this.getConfig().getMigrationInfo();

    if (migrations.length === 0) {
      this.info('No migrations available');
      return;
    }

    console.log('Available Migrations:');
    console.log('─'.repeat(40));

    this.table(migrations, ['version', 'description']);
  }

  private async handleInitConfig(options: any): Promise<void> {
    const configPaths = this.getConfig().getConfigPaths();
    const configPath = configPaths.project;

    if (fs.existsSync(configPath) && !options.force) {
      this.warning(`Configuration file already exists: ${configPath}`);
      console.log('Use --force to overwrite existing configuration');
      return;
    }

    const defaultConfig = (this.getConfig() as any)['createDefaultConfigObject']?.() || this.getConfig().getConfig();
    await this.getConfig().saveConfig(defaultConfig, configPath);
    this.success(`Default configuration written to ${configPath}`);
  }
}
