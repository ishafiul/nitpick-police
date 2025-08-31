import { AppStateType } from '../../models/state';

export interface Migration {
  readonly version: string;
  readonly description: string;
  
  /**
   * Apply migration to state
   */
  up(state: AppStateType): Promise<AppStateType>;
  
  /**
   * Rollback migration
   */
  down(state: AppStateType): Promise<AppStateType>;
  
  /**
   * Check if migration can be applied
   */
  canApply(state: AppStateType): boolean;
  
  /**
   * Check if migration can be rolled back
   */
  canRollback(state: AppStateType): boolean;
}

export abstract class BaseMigration implements Migration {
  abstract readonly version: string;
  abstract readonly description: string;
  
  abstract up(state: AppStateType): Promise<AppStateType>;
  abstract down(state: AppStateType): Promise<AppStateType>;
  
  canApply(_state: AppStateType): boolean {
    return true; // Override in subclasses if needed
  }
  
  canRollback(_state: AppStateType): boolean {
    return true; // Override in subclasses if needed
  }
  
  /**
   * Helper method to safely update state
   */
  protected updateState(state: AppStateType, updates: Partial<AppStateType>): AppStateType {
    return { ...state, ...updates };
  }
  
  /**
   * Helper method to validate state after migration
   */
  protected validateState(state: AppStateType): boolean {
    try {
      // Basic validation - ensure required fields exist
      return !!(state.version && state.schema_version && state.last_updated);
    } catch {
      return false;
    }
  }
}
