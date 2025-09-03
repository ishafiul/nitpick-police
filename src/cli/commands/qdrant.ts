import { Command } from 'commander';
import chalk from 'chalk';
import { QdrantManager, QdrantCollectionManager } from '../../services/qdrant';
import { QdrantMigrationManager } from '../../migrations/qdrant';
import { validateQdrantEnvironment } from '../../utils';

export function qdrantCommand(program: Command): void {
  const qdrantCmd = program
    .command('qdrant')
    .description('Manage Qdrant vector database collections and migrations');

  qdrantCmd
    .command('init-collections')
    .description('Initialize all required Qdrant collections with proper schemas')
    .option('--force', 'Force recreation of existing collections')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🚀 Initializing Qdrant collections...'));

        const validationResult = await validateQdrantEnvironment();
        if (!validationResult.isValid) {
          console.log(chalk.red('❌ Qdrant environment validation failed:'));
          validationResult.errors.forEach(error => console.log(chalk.red(`   ${error}`)));
          process.exit(1);
        }

        const qdrantManager = new QdrantManager();
        await qdrantManager.connect();

        const collectionManager = new QdrantCollectionManager(qdrantManager);

        if (options.force) {
          console.log(chalk.yellow('⚠️  Force mode: Recreating existing collections...'));

        }

        await collectionManager.initializeCollections();

        console.log(chalk.green('✅ Qdrant collections initialized successfully!'));

        const collections = await collectionManager.getAllCollectionsInfo();
        console.log(chalk.blue('\n📊 Collection Status:'));
        collections.forEach(collection => {
          const statusColor = collection.status === 'green' ? chalk.green :
                             collection.status === 'yellow' ? chalk.yellow : chalk.red;
          console.log(`  ${statusColor(collection.status)} ${collection.name}: ${collection.pointsCount} points`);
        });

      } catch (error) {
        console.error(chalk.red('❌ Failed to initialize Qdrant collections:'), error);
        console.log(chalk.blue('\n🔧 Troubleshooting:'));
        console.log(chalk.gray('1. Ensure Qdrant is running: docker ps | grep qdrant'));
        console.log(chalk.gray('2. Check Qdrant connection: code-review qdrant-test'));
        console.log(chalk.gray('3. Verify config: code-review config show'));
        process.exit(1);
      }
    });

  qdrantCmd
    .command('migrate')
    .description('Run pending Qdrant migrations')
    .option('--dry-run', 'Show what migrations would be applied without running them')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🔄 Running Qdrant migrations...'));

        const validationResult = await validateQdrantEnvironment();
        if (!validationResult.isValid) {
          console.log(chalk.red('❌ Qdrant environment validation failed:'));
          validationResult.errors.forEach(error => console.log(chalk.red(`   ${error}`)));
          process.exit(1);
        }

        const qdrantManager = new QdrantManager();
        await qdrantManager.connect();

        const migrationManager = new QdrantMigrationManager(qdrantManager);

        const status = migrationManager.getStatus();
        console.log(chalk.gray(`Current version: ${status.currentVersion}`));
        console.log(chalk.gray(`Applied migrations: ${status.appliedMigrations}`));
        console.log(chalk.gray(`Pending migrations: ${status.pendingMigrations}`));

        if (options.dryRun) {
          const pendingMigrations = migrationManager.getPendingMigrations();
          if (pendingMigrations.length === 0) {
            console.log(chalk.green('✅ No pending migrations'));
            return;
          }

          console.log(chalk.blue('\n📋 Pending migrations (dry run):'));
          pendingMigrations.forEach(migration => {
            console.log(`  ${chalk.cyan(migration.version)}: ${migration.description}`);
          });
          return;
        }

        await migrationManager.applyAllMigrations();

        const finalStatus = migrationManager.getStatus();
        console.log(chalk.green('✅ Migrations completed successfully!'));
        console.log(chalk.gray(`New version: ${finalStatus.currentVersion}`));

      } catch (error) {
        console.error(chalk.red('❌ Migration failed:'), error);
        process.exit(1);
      }
    });

  qdrantCmd
    .command('rollback')
    .description('Rollback the last applied Qdrant migration')
    .option('--dry-run', 'Show what would be rolled back without executing')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🔄 Rolling back last Qdrant migration...'));

        const validationResult = await validateQdrantEnvironment();
        if (!validationResult.isValid) {
          console.log(chalk.red('❌ Qdrant environment validation failed:'));
          validationResult.errors.forEach(error => console.log(chalk.red(`   ${error}`)));
          process.exit(1);
        }

        const qdrantManager = new QdrantManager();
        await qdrantManager.connect();

        const migrationManager = new QdrantMigrationManager(qdrantManager);

        const status = migrationManager.getStatus();
        console.log(chalk.gray(`Current version: ${status.currentVersion}`));
        console.log(chalk.gray(`Applied migrations: ${status.appliedMigrations}`));

        if (status.appliedMigrations === 0) {
          console.log(chalk.yellow('⚠️  No migrations to rollback'));
          return;
        }

        if (options.dryRun) {
          const appliedMigrations = migrationManager.getAppliedMigrations();
          const lastMigration = appliedMigrations[appliedMigrations.length - 1];
          console.log(chalk.blue('\n📋 Would rollback migration:'));
          console.log(`  ${chalk.cyan(lastMigration)}`);
          return;
        }

        await migrationManager.rollbackLastMigration();

        const finalStatus = migrationManager.getStatus();
        console.log(chalk.green('✅ Rollback completed successfully!'));
        console.log(chalk.gray(`New version: ${finalStatus.currentVersion}`));

      } catch (error) {
        console.error(chalk.red('❌ Rollback failed:'), error);
        process.exit(1);
      }
    });

  qdrantCmd
    .command('list-collections')
    .description('List all Qdrant collections with status information')
    .action(async () => {
      try {
        console.log(chalk.blue('📋 Listing Qdrant collections...'));

        const validationResult = await validateQdrantEnvironment();
        if (!validationResult.isValid) {
          console.log(chalk.red('❌ Qdrant environment validation failed:'));
          validationResult.errors.forEach(error => console.log(chalk.red(`   ${error}`)));
          process.exit(1);
        }

        const qdrantManager = new QdrantManager();
        await qdrantManager.connect();

        const collectionManager = new QdrantCollectionManager(qdrantManager);

        const collections = await collectionManager.getAllCollectionsInfo();

        if (collections.length === 0) {
          console.log(chalk.yellow('⚠️  No collections found'));
          console.log(chalk.gray('Run "code-review qdrant init-collections" to create collections'));
          return;
        }

        console.log(chalk.blue('\n📊 Collections:'));
        console.log(chalk.gray('─'.repeat(70)));
        console.log(chalk.gray('Name'.padEnd(25) + 'Status'.padEnd(10) + 'Points'.padEnd(10) + 'Vectors'));
        console.log(chalk.gray('─'.repeat(70)));

        collections.forEach(collection => {
          const statusColor = collection.status === 'green' ? chalk.green :
                             collection.status === 'yellow' ? chalk.yellow : chalk.red;
          const name = collection.name.padEnd(25);
          const status = collection.status.padEnd(10);
          const points = String(collection.pointsCount).padEnd(10);
          const vectors = String(collection.vectorCount);

          console.log(`${name}${statusColor(status)}${points}${vectors}`);
        });

      } catch (error) {
        console.error(chalk.red('❌ Failed to list collections:'), error);
        process.exit(1);
      }
    });

  qdrantCmd
    .command('collection-info <name>')
    .description('Get detailed information about a specific collection')
    .action(async (collectionName) => {
      try {
        console.log(chalk.blue(`📊 Getting info for collection: ${collectionName}`));

        const validationResult = await validateQdrantEnvironment();
        if (!validationResult.isValid) {
          console.log(chalk.red('❌ Qdrant environment validation failed:'));
          validationResult.errors.forEach(error => console.log(chalk.red(`   ${error}`)));
          process.exit(1);
        }

        const qdrantManager = new QdrantManager();
        await qdrantManager.connect();

        const collectionManager = new QdrantCollectionManager(qdrantManager);

        const collectionInfo = await collectionManager.getCollectionInfo(collectionName);

        if (!collectionInfo) {
          console.log(chalk.red(`❌ Collection '${collectionName}' not found`));
          process.exit(1);
        }

        console.log(chalk.blue('\n📋 Collection Details:'));
        console.log(chalk.gray(`Name: ${collectionInfo.name}`));
        console.log(chalk.gray(`Status: ${collectionInfo.status}`));
        console.log(chalk.gray(`Points: ${collectionInfo.pointsCount}`));
        console.log(chalk.gray(`Indexed Vectors: ${collectionInfo.indexedVectorCount}`));
        console.log(chalk.gray(`Vectors: ${collectionInfo.vectorCount}`));

        if (collectionInfo.config) {
          console.log(chalk.blue('\n⚙️  Configuration:'));
          console.log(JSON.stringify(collectionInfo.config, null, 2));
        }

      } catch (error) {
        console.error(chalk.red('❌ Failed to get collection info:'), error);
        process.exit(1);
      }
    });

  qdrantCmd
    .command('migration-status')
    .description('Show Qdrant migration status')
    .action(async () => {
      try {
        console.log(chalk.blue('📊 Qdrant Migration Status'));

        const validationResult = await validateQdrantEnvironment();
        if (!validationResult.isValid) {
          console.log(chalk.red('❌ Qdrant environment validation failed:'));
          validationResult.errors.forEach(error => console.log(chalk.red(`   ${error}`)));
          process.exit(1);
        }

        const qdrantManager = new QdrantManager();
        await qdrantManager.connect();

        const migrationManager = new QdrantMigrationManager(qdrantManager);

        const status = migrationManager.getStatus();
        const isUpToDate = await migrationManager.isUpToDate();

        console.log(chalk.gray(`\nCurrent Version: ${status.currentVersion}`));
        console.log(chalk.gray(`Applied Migrations: ${status.appliedMigrations}`));
        console.log(chalk.gray(`Pending Migrations: ${status.pendingMigrations}`));
        console.log(chalk.gray(`Last Migration: ${status.lastMigrationAt}`));

        if (isUpToDate) {
          console.log(chalk.green('\n✅ Migrations are up to date'));
        } else {
          console.log(chalk.yellow('\n⚠️  Migrations are pending'));
          console.log(chalk.gray('Run "code-review qdrant migrate" to apply them'));
        }

        const appliedMigrations = migrationManager.getAppliedMigrations();
        if (appliedMigrations.length > 0) {
          console.log(chalk.blue('\n📋 Applied Migrations:'));
          appliedMigrations.forEach(version => {
            const migration = migrationManager.getMigrations().find(m => m.version === version);
            if (migration) {
              console.log(`  ${chalk.green(version)}: ${migration.description}`);
            }
          });
        }

        const pendingMigrations = migrationManager.getPendingMigrations();
        if (pendingMigrations.length > 0) {
          console.log(chalk.blue('\n📋 Pending Migrations:'));
          pendingMigrations.forEach(migration => {
            console.log(`  ${chalk.yellow(migration.version)}: ${migration.description}`);
          });
        }

      } catch (error) {
        console.error(chalk.red('❌ Failed to get migration status:'), error);
        process.exit(1);
      }
    });
}
