import { promises as fs } from 'fs';
import path from 'path';
import { AppStateType, validateAppState, serializeState, deserializeState } from '../models/state';
import { MigrationManager } from './migrations';

export class StateManagerError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'StateManagerError';
  }
}

export class StateManager {
  private readonly stateDir: string;
  private readonly stateFile: string;
  private readonly backupDir: string;
  private state: AppStateType;
  private isInitialized = false;
  private migrationManager: MigrationManager;

  constructor(projectRoot: string = process.cwd()) {
    this.stateDir = path.join(projectRoot, '.code_review');
    this.stateFile = path.join(this.stateDir, 'state.json');
    this.backupDir = path.join(this.stateDir, 'backups');
    this.migrationManager = new MigrationManager();
    
    // Initialize with default state
    this.state = this.createDefaultState();
  }

  private createDefaultState(): AppStateType {
    return {
      version: '1.0.0',
      schema_version: '1.0.0',
      last_updated: new Date(),
      reviews: [],
      commits: [],
      settings: {
        backup_enabled: true,
        max_backups: 5,
        auto_backup: true,
        backup_interval_hours: 24,
      },
    };
  }

  /**
   * Initialize the state manager and load existing state
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Try to load existing state
      if (await this.stateFileExists()) {
        await this.loadState();
        
        // Check if migration is needed
        if (this.migrationManager.needsMigration(this.state)) {
          console.log('State migration required, applying pending migrations...');
          await this.applyMigrations();
        }
      } else {
        // Create initial state file
        await this.saveState();
      }
      
      this.isInitialized = true;
    } catch (error) {
      // Try to recover from backup if available
      if (await this.attemptRecovery()) {
        this.isInitialized = true;
        return;
      }
      
      throw new StateManagerError('Failed to initialize state manager', error as Error);
    }
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      throw new StateManagerError('Failed to create required directories', error as Error);
    }
  }

  /**
   * Check if state file exists
   */
  private async stateFileExists(): Promise<boolean> {
    try {
      await fs.access(this.stateFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load state from file with validation and recovery
   */
  async loadState(): Promise<AppStateType> {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      const parsed = deserializeState(data);
      this.state = parsed;
      return this.state;
    } catch (error) {
      // Try to recover from backup
      if (await this.attemptRecovery()) {
        return this.state;
      }
      
      if (error instanceof Error && error.message.includes('JSON')) {
        throw new StateManagerError('State file contains invalid JSON', error);
      }
      throw new StateManagerError('Failed to load state', error as Error);
    }
  }

  /**
   * Save state to file with atomic write
   */
  async saveState(): Promise<void> {
    if (!this.isInitialized) {
      throw new StateManagerError('State manager not initialized. Call initialize() first.');
    }

    try {
      // Update timestamp
      this.state.last_updated = new Date();
      
      // Create temporary file
      const tempFile = `${this.stateFile}.tmp.${Date.now()}`;
      const serialized = serializeState(this.state);
      
      // Write to temporary file
      await fs.writeFile(tempFile, serialized, 'utf-8');
      
      // Atomic move operation
      await fs.rename(tempFile, this.stateFile);
      
      // Create backup if enabled
      if (this.state.settings.auto_backup) {
        await this.createBackup();
      }
    } catch (error) {
      throw new StateManagerError('Failed to save state', error as Error);
    }
  }

  /**
   * Update state with new data
   */
  async updateState(updates: Partial<AppStateType>): Promise<void> {
    this.state = { ...this.state, ...updates };
    await this.saveState();
  }

  /**
   * Get current state
   */
  getState(): AppStateType {
    if (!this.isInitialized) {
      throw new StateManagerError('State manager not initialized. Call initialize() first.');
    }
    return { ...this.state };
  }

  /**
   * Apply pending migrations
   */
  private async applyMigrations(): Promise<void> {
    try {
      this.state = await this.migrationManager.migrateUp(this.state);
      await this.saveState();
      console.log('Migrations applied successfully');
    } catch (error) {
      throw new StateManagerError('Failed to apply migrations', error as Error);
    }
  }

  /**
   * Attempt recovery from backup
   */
  private async attemptRecovery(): Promise<boolean> {
    try {
      const backups = await this.listBackups();
      if (backups.length === 0) {
        return false;
      }

      // Try the most recent backup
      const latestBackup = backups[0];
      if (!latestBackup) {
        return false;
      }
      
      console.log(`Attempting recovery from backup: ${latestBackup.timestamp}`);
      
      await this.restoreFromBackup(latestBackup.timestamp);
      console.log('Recovery successful');
      return true;
    } catch (error) {
      console.warn('Recovery attempt failed:', error);
      return false;
    }
  }

  /**
   * Create backup of current state
   */
  private async createBackup(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `state.json.backup.${timestamp}`);
      
      const serialized = serializeState(this.state);
      await fs.writeFile(backupFile, serialized, 'utf-8');
      
      // Rotate backups
      await this.rotateBackups();
      
      return backupFile;
    } catch (error) {
      throw new StateManagerError('Failed to create backup', error as Error);
    }
  }

  /**
   * Rotate backups to keep only the last N versions
   */
  private async rotateBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('state.json.backup.'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          time: file.replace('state.json.backup.', '')
        }))
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      // Remove old backups beyond max_backups limit
      const maxBackups = this.state.settings.max_backups;
      if (backupFiles.length > maxBackups) {
        const filesToRemove = backupFiles.slice(maxBackups);
        for (const file of filesToRemove) {
          try {
            await fs.unlink(file.path);
          } catch (error) {
            // Log but don't fail the rotation
            console.warn(`Failed to remove old backup: ${file.name}`, error);
          }
        }
      }
    } catch (error) {
      throw new StateManagerError('Failed to rotate backups', error as Error);
    }
  }

  /**
   * Restore state from a specific backup
   */
  async restoreFromBackup(backupTimestamp: string): Promise<void> {
    try {
      const backupFile = path.join(this.backupDir, `state.json.backup.${backupTimestamp}`);
      
      // Verify backup exists
      await fs.access(backupFile);
      
      // Read and validate backup
      const data = await fs.readFile(backupFile, 'utf-8');
      const restoredState = deserializeState(data);
      
      // Update current state
      this.state = restoredState;
      
      // Save restored state
      await this.saveState();
    } catch (error) {
      throw new StateManagerError(`Failed to restore from backup: ${backupTimestamp}`, error as Error);
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<Array<{ timestamp: string; size: number; created: Date }>> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];
      
      for (const file of files) {
        if (file.startsWith('state.json.backup.')) {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          const timestamp = file.replace('state.json.backup.', '');
          
          backups.push({
            timestamp,
            size: stats.size,
            created: stats.birthtime,
          });
        }
      }
      
      return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      throw new StateManagerError('Failed to list backups', error as Error);
    }
  }

  /**
   * Validate current state
   */
  validateState(): boolean {
    try {
      validateAppState(this.state);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset state to default
   */
  async resetState(): Promise<void> {
    this.state = this.createDefaultState();
    await this.saveState();
  }

  /**
   * Get state file path
   */
  getStateFilePath(): string {
    return this.stateFile;
  }

  /**
   * Get backup directory path
   */
  getBackupDirPath(): string {
    return this.backupDir;
  }

  /**
   * Get migration manager
   */
  getMigrationManager(): MigrationManager {
    return this.migrationManager;
  }

  /**
   * Check if migration is needed
   */
  needsMigration(): boolean {
    return this.migrationManager.needsMigration(this.state);
  }

  /**
   * Get migration history
   */
  getMigrationHistory() {
    return this.migrationManager.getMigrationHistory(this.state);
  }
}
