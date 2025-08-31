import { AppStateType } from '../../models/state';
import { Migration } from './base-migration';
import { V1_0_1_Migration } from './v1-0-1-migration';

export class MigrationManagerError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'MigrationManagerError';
  }
}

export class MigrationManager {
  private migrations: Migration[] = [];
  private currentVersion: string;

  constructor() {
    // Register available migrations
    this.migrations = [
      new V1_0_1_Migration(),
      // Add more migrations here as they are created
    ];

    // Sort migrations by version
    this.migrations.sort((a, b) => this.compareVersions(a.version, b.version));
    
    this.currentVersion = '1.0.0'; // Default version
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Get all available migrations
   */
  getMigrations(): Migration[] {
    return [...this.migrations];
  }

  /**
   * Get pending migrations for a given state
   */
  getPendingMigrations(state: AppStateType): Migration[] {
    const currentVersion = state.schema_version;
    return this.migrations.filter(migration => 
      this.compareVersions(migration.version, currentVersion) > 0
    );
  }

  /**
   * Check if state needs migration
   */
  needsMigration(state: AppStateType): boolean {
    return this.getPendingMigrations(state).length > 0;
  }

  /**
   * Apply all pending migrations to state
   */
  async migrateUp(state: AppStateType): Promise<AppStateType> {
    const pendingMigrations = this.getPendingMigrations(state);
    
    if (pendingMigrations.length === 0) {
      return state; // No migration needed
    }

    let currentState = { ...state };
    
    for (const migration of pendingMigrations) {
      try {
        if (!migration.canApply(currentState)) {
          throw new MigrationManagerError(
            `Migration ${migration.version} cannot be applied to current state`
          );
        }

        currentState = await migration.up(currentState);
        console.log(`Applied migration: ${migration.version} - ${migration.description}`);
      } catch (error) {
        throw new MigrationManagerError(
          `Failed to apply migration ${migration.version}: ${migration.description}`,
          error as Error
        );
      }
    }

    return currentState;
  }

  /**
   * Rollback to a specific version
   */
  async migrateDown(state: AppStateType, targetVersion: string): Promise<AppStateType> {
    const currentVersion = state.schema_version;
    
    if (this.compareVersions(targetVersion, currentVersion) >= 0) {
      throw new MigrationManagerError(
        `Target version ${targetVersion} is not lower than current version ${currentVersion}`
      );
    }

    // Get migrations to rollback (in reverse order)
    const migrationsToRollback = this.migrations
      .filter(migration => 
        this.compareVersions(migration.version, currentVersion) <= 0 &&
        this.compareVersions(migration.version, targetVersion) > 0
      )
      .reverse();

    let currentState = { ...state };
    
    for (const migration of migrationsToRollback) {
      try {
        if (!migration.canRollback(currentState)) {
          throw new MigrationManagerError(
            `Migration ${migration.version} cannot be rolled back`
          );
        }

        currentState = await migration.down(currentState);
        console.log(`Rolled back migration: ${migration.version} - ${migration.description}`);
      } catch (error) {
        throw new MigrationManagerError(
          `Failed to rollback migration ${migration.version}: ${migration.description}`,
          error as Error
        );
      }
    }

    return currentState;
  }

  /**
   * Get migration history for a state
   */
  getMigrationHistory(state: AppStateType): Array<{
    version: string;
    description: string;
    applied: boolean;
    canRollback: boolean;
  }> {
    return this.migrations.map(migration => ({
      version: migration.version,
      description: migration.description,
      applied: this.compareVersions(migration.version, state.schema_version) <= 0,
      canRollback: migration.canRollback(state),
    }));
  }

  /**
   * Validate migration chain
   */
  validateMigrationChain(): boolean {
    if (this.migrations.length === 0) {
      return true;
    }

    // Check for duplicate versions
    const versions = this.migrations.map(m => m.version);
    const uniqueVersions = new Set(versions);
    if (versions.length !== uniqueVersions.size) {
      return false;
    }

    // Check for gaps in version sequence (optional, depends on your versioning strategy)
    return true;
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }
    
    return 0;
  }

  /**
   * Get latest available version
   */
  getLatestVersion(): string {
    if (this.migrations.length === 0) {
      return this.currentVersion;
    }
    
    const lastMigration = this.migrations[this.migrations.length - 1];
    return lastMigration ? lastMigration.version : this.currentVersion;
  }

  /**
   * Check if a specific migration can be applied
   */
  canApplyMigration(version: string, state: AppStateType): boolean {
    const migration = this.migrations.find(m => m.version === version);
    if (!migration) {
      return false;
    }
    
    return migration.canApply(state);
  }

  /**
   * Check if a specific migration can be rolled back
   */
  canRollbackMigration(version: string, state: AppStateType): boolean {
    const migration = this.migrations.find(m => m.version === version);
    if (!migration) {
      return false;
    }
    
    return migration.canRollback(state);
  }
}
