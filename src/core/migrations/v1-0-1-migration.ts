import { BaseMigration } from './base-migration';
import { AppStateType } from '../../models/state';

/**
 * Sample migration: v1.0.1 - Add new settings field
 * This demonstrates how migrations work
 */
export class V1_0_1_Migration extends BaseMigration {
  readonly version = '1.0.1';
  readonly description = 'Add new settings field for enhanced backup options';

  override canApply(state: AppStateType): boolean {
    // Only apply if current version is 1.0.0
    return state.schema_version === '1.0.0';
  }

  override canRollback(state: AppStateType): boolean {
    // Can rollback if current version is 1.0.1
    return state.schema_version === '1.0.1';
  }

  async up(state: AppStateType): Promise<AppStateType> {
    const updatedState = this.updateState(state, {
      schema_version: '1.0.1',
      settings: {
        ...state.settings,
        // Add new settings fields
        enhanced_backup: true,
        backup_compression: false,
      } as any // Type assertion for demonstration
    });

    if (!this.validateState(updatedState)) {
      throw new Error('State validation failed after migration');
    }

    return updatedState;
  }

  async down(state: AppStateType): Promise<AppStateType> {
    // Remove the new fields we added
    const { ...restSettings } = state.settings;
    
    const updatedState = this.updateState(state, {
      schema_version: '1.0.0',
      settings: restSettings
    });

    if (!this.validateState(updatedState)) {
      throw new Error('State validation failed after rollback');
    }

    return updatedState;
  }
}
