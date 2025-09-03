import { QdrantManager } from '../../services/qdrant';
import { QdrantMigration, QdrantMigrationContext } from './base-migration';
import { V1_0_0_QdrantCollectionsInitMigration } from './v1-0-0-collections-init';
import logger from '../../utils/logger';

export class QdrantMigrationManagerError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'QdrantMigrationManagerError';
  }
}

export interface QdrantMigrationState {
  schema_version: string;
  applied_migrations: string[];
  last_migration_at: string;
}

export class QdrantMigrationManager {
  private migrations: QdrantMigration[] = [];
  private currentVersion: string;
  private state: QdrantMigrationState;

  constructor(private qdrantManager: QdrantManager) {
    
    this.migrations = [
      new V1_0_0_QdrantCollectionsInitMigration(),
      
    ];

    this.migrations.sort((a, b) => this.compareVersions(a.version, b.version));

    this.currentVersion = '0.0.0'; 
    this.state = {
      schema_version: '0.0.0',
      applied_migrations: [],
      last_migration_at: new Date().toISOString(),
    };
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  getMigrations(): QdrantMigration[] {
    return [...this.migrations];
  }

  getPendingMigrations(): QdrantMigration[] {
    return this.migrations.filter(migration =>
      this.compareVersions(migration.version, this.currentVersion) > 0
    );
  }

  getAppliedMigrations(): string[] {
    return [...this.state.applied_migrations];
  }

  async applyAllMigrations(): Promise<void> {
    const pendingMigrations = this.getPendingMigrations();

    if (pendingMigrations.length === 0) {
      logger.info('QdrantMigrationManager: No pending migrations to apply');
      return;
    }

    logger.info(`QdrantMigrationManager: Applying ${pendingMigrations.length} pending migrations...`);

    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }

    logger.info('QdrantMigrationManager: All migrations applied successfully');
  }

  async applyMigration(migration: QdrantMigration): Promise<void> {
    const context = await this.createMigrationContext();

    const canApply = await migration.canApply(context);
    if (!canApply) {
      logger.warn(`QdrantMigrationManager: Migration ${migration.version} cannot be applied`);
      return;
    }

    try {
      logger.info(`QdrantMigrationManager: Applying migration ${migration.version}: ${migration.description}`);

      await migration.up(context);

      this.state.applied_migrations.push(migration.version);
      this.state.schema_version = migration.version;
      this.state.last_migration_at = new Date().toISOString();
      this.currentVersion = migration.version;

      logger.info(`QdrantMigrationManager: Migration ${migration.version} applied successfully`);

    } catch (error) {
      logger.error(`QdrantMigrationManager: Failed to apply migration ${migration.version}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new QdrantMigrationManagerError(
        `Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async rollbackLastMigration(): Promise<void> {
    if (this.state.applied_migrations.length === 0) {
      logger.warn('QdrantMigrationManager: No migrations to rollback');
      return;
    }

    const lastMigrationVersion = this.state.applied_migrations[this.state.applied_migrations.length - 1];
    const migration = this.migrations.find(m => m.version === lastMigrationVersion);

    if (!migration) {
      throw new QdrantMigrationManagerError(`Migration ${lastMigrationVersion} not found`);
    }

    const context = await this.createMigrationContext();

    const canRollback = await migration.canRollback(context);
    if (!canRollback) {
      logger.warn(`QdrantMigrationManager: Migration ${migration.version} cannot be rolled back`);
      return;
    }

    try {
      logger.info(`QdrantMigrationManager: Rolling back migration ${migration.version}: ${migration.description}`);

      await migration.down(context);

      this.state.applied_migrations.pop();
      const previousVersion = this.state.applied_migrations.length > 0
        ? this.state.applied_migrations[this.state.applied_migrations.length - 1]
        : '0.0.0';
      this.state.schema_version = previousVersion || '0.0.0';
      this.state.last_migration_at = new Date().toISOString();
      this.currentVersion = previousVersion || '0.0.0';

      logger.info(`QdrantMigrationManager: Migration ${migration.version} rolled back successfully`);

    } catch (error) {
      logger.error(`QdrantMigrationManager: Failed to rollback migration ${migration.version}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new QdrantMigrationManagerError(
        `Migration rollback ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async isUpToDate(): Promise<boolean> {
    const pendingMigrations = this.getPendingMigrations();
    return pendingMigrations.length === 0;
  }

  getStatus(): {
    currentVersion: string;
    pendingMigrations: number;
    appliedMigrations: number;
    lastMigrationAt: string;
  } {
    return {
      currentVersion: this.currentVersion,
      pendingMigrations: this.getPendingMigrations().length,
      appliedMigrations: this.state.applied_migrations.length,
      lastMigrationAt: this.state.last_migration_at,
    };
  }

  private async createMigrationContext(): Promise<QdrantMigrationContext> {

    return {
      qdrantManager: this.qdrantManager,
      collectionNames: {
        code_chunks: 'code_chunks',
        review_insights: 'review_insights',
        prompts: 'prompts',
        cloud_responses: 'cloud_responses',
      },
      config: {
        vectorDimension: 768,
        distanceMetric: 'cosine',
        embeddingModel: 'nomic-embed-text:v1.5',
      },
    };
  }

  private compareVersions(version1: string, version2: string): number {
    const parts1 = version1.split('.').map(Number);
    const parts2 = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }

    return 0;
  }
}
