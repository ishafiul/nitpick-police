import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import logger from '../utils/logger';

export interface GitHookConfig {
  enabled: boolean;
  postCommit: boolean;
  preCommit: boolean;
  backgroundIndexing: boolean;
  criticalIssueBlocking: boolean;
  hookScriptPath?: string;
}

export interface HookInstallResult {
  success: boolean;
  hooksInstalled: string[];
  errors: string[];
  warnings: string[];
}

export interface HookStatus {
  installed: boolean;
  hooks: {
    preCommit?: boolean;
    postCommit?: boolean;
    postMerge?: boolean;
  };
  permissions: {
    readable: boolean;
    writable: boolean;
    executable: boolean;
  };
  lastModified?: Date;
}

export class GitHooksManager {
  private readonly hooksDir: string;
  private readonly projectRoot: string;
  private readonly config: GitHookConfig;

  constructor(projectRoot: string, config: GitHookConfig) {
    this.projectRoot = projectRoot;
    this.hooksDir = path.join(projectRoot, '.git', 'hooks');
    this.config = config;
  }

  /**
   * Install Git hooks based on configuration
   */
  async installHooks(): Promise<HookInstallResult> {
    const result: HookInstallResult = {
      success: false,
      hooksInstalled: [],
      errors: [],
      warnings: [],
    };

    try {
      // Check if this is a Git repository
      if (!this.isGitRepository()) {
        result.errors.push('Not a Git repository');
        return result;
      }

      // Ensure hooks directory exists
      if (!fs.existsSync(this.hooksDir)) {
        result.errors.push('Git hooks directory not found');
        return result;
      }

      const hooksToInstall: string[] = [];

      // Install post-commit hook for automatic indexing
      if (this.config.postCommit) {
        const postCommitResult = await this.installPostCommitHook();
        if (postCommitResult.success) {
          hooksToInstall.push('post-commit');
          result.hooksInstalled.push('post-commit');
        } else {
          result.errors.push(`Failed to install post-commit hook: ${postCommitResult.error}`);
        }
      }

      // Install pre-commit hook for blocking critical issues
      if (this.config.preCommit) {
        const preCommitResult = await this.installPreCommitHook();
        if (preCommitResult.success) {
          hooksToInstall.push('pre-commit');
          result.hooksInstalled.push('pre-commit');
        } else {
          result.errors.push(`Failed to install pre-commit hook: ${preCommitResult.error}`);
        }
      }

      // Install post-merge hook for handling merge commits
      const postMergeResult = await this.installPostMergeHook();
      if (postMergeResult.success) {
        hooksToInstall.push('post-merge');
        result.hooksInstalled.push('post-merge');
      } else {
        result.warnings.push(`Failed to install post-merge hook: ${postMergeResult.error}`);
      }

      result.success = result.hooksInstalled.length > 0;
      
      if (result.success) {
        logger.info(`Successfully installed Git hooks: ${result.hooksInstalled.join(', ')}`);
      }

    } catch (error) {
      result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error('Failed to install Git hooks:', error);
    }

    return result;
  }

  /**
   * Uninstall all Git hooks
   */
  async uninstallHooks(): Promise<HookInstallResult> {
    const result: HookInstallResult = {
      success: false,
      hooksInstalled: [],
      errors: [],
      warnings: [],
    };

    try {
      if (!this.isGitRepository()) {
        result.errors.push('Not a Git repository');
        return result;
      }

      const hooksToRemove = ['post-commit', 'pre-commit', 'post-merge'];
      const removedHooks: string[] = [];

      for (const hook of hooksToRemove) {
        const hookPath = path.join(this.hooksDir, hook);
        if (fs.existsSync(hookPath)) {
          try {
            fs.unlinkSync(hookPath);
            removedHooks.push(hook);
            logger.info(`Removed hook: ${hook}`);
          } catch (error) {
            result.errors.push(`Failed to remove ${hook} hook: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      result.success = removedHooks.length > 0;
      result.hooksInstalled = removedHooks;

      if (result.success) {
        logger.info(`Successfully uninstalled Git hooks: ${removedHooks.join(', ')}`);
      }

    } catch (error) {
      result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error('Failed to uninstall Git hooks:', error);
    }

    return result;
  }

  /**
   * Check the status of installed hooks
   */
  getHookStatus(): HookStatus {
    const status: HookStatus = {
      installed: false,
      hooks: {},
      permissions: {
        readable: false,
        writable: false,
        executable: false,
      },
    };

    try {
      if (!this.isGitRepository()) {
        return status;
      }

      // Check if hooks directory exists and is accessible
      if (!fs.existsSync(this.hooksDir)) {
        return status;
      }

      // Check permissions
      try {
        fs.accessSync(this.hooksDir, fs.constants.R_OK);
        status.permissions.readable = true;
      } catch {
        // Directory not readable
      }

      try {
        fs.accessSync(this.hooksDir, fs.constants.W_OK);
        status.permissions.writable = true;
      } catch {
        // Directory not writable
      }

      // Check individual hooks
      const hookFiles = ['pre-commit', 'post-commit', 'post-merge'];
      
      for (const hook of hookFiles) {
        const hookPath = path.join(this.hooksDir, hook);
        if (fs.existsSync(hookPath)) {
          status.hooks[hook as keyof typeof status.hooks] = true;
          status.installed = true;

          // Check if hook is executable
          try {
            fs.accessSync(hookPath, fs.constants.X_OK);
            status.permissions.executable = true;
          } catch {
            // Hook not executable
          }

          // Get last modified time
          try {
            const stats = fs.statSync(hookPath);
            status.lastModified = stats.mtime;
          } catch {
            // Could not get stats
          }
        }
      }

    } catch (error) {
      logger.error('Failed to check hook status:', error);
    }

    return status;
  }

  /**
   * Repair hooks if they're corrupted or have permission issues
   */
  async repairHooks(): Promise<HookInstallResult> {
    const result: HookInstallResult = {
      success: false,
      hooksInstalled: [],
      errors: [],
      warnings: [],
    };

    try {
      // First uninstall existing hooks
      const uninstallResult = await this.uninstallHooks();
      if (uninstallResult.errors.length > 0) {
        result.warnings.push(`Some hooks could not be uninstalled: ${uninstallResult.errors.join(', ')}`);
      }

      // Then reinstall hooks
      const installResult = await this.installHooks();
      
      result.success = installResult.success;
      result.hooksInstalled = installResult.hooksInstalled;
      result.errors.push(...installResult.errors);
      result.warnings.push(...installResult.warnings);

      if (result.success) {
        logger.info('Successfully repaired Git hooks');
      }

    } catch (error) {
      result.errors.push(`Failed to repair hooks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error('Failed to repair Git hooks:', error);
    }

    return result;
  }

  /**
   * Install post-commit hook for automatic indexing
   */
  private async installPostCommitHook(): Promise<{ success: boolean; error?: string }> {
    try {
      const hookPath = path.join(this.hooksDir, 'post-commit');
      const hookContent = this.generatePostCommitHook();
      
      fs.writeFileSync(hookPath, hookContent, 'utf8');
      
      // Make hook executable
      fs.chmodSync(hookPath, 0o755);
      
      logger.info('Installed post-commit hook for automatic indexing');
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to install post-commit hook:', error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Install pre-commit hook for blocking critical issues
   */
  private async installPreCommitHook(): Promise<{ success: boolean; error?: string }> {
    try {
      const hookPath = path.join(this.hooksDir, 'pre-commit');
      const hookContent = this.generatePreCommitHook();
      
      fs.writeFileSync(hookPath, hookContent, 'utf8');
      
      // Make hook executable
      fs.chmodSync(hookPath, 0o755);
      
      logger.info('Installed pre-commit hook for critical issue checking');
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to install pre-commit hook:', error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Install post-merge hook for handling merge commits
   */
  private async installPostMergeHook(): Promise<{ success: boolean; error?: string }> {
    try {
      const hookPath = path.join(this.hooksDir, 'post-merge');
      const hookContent = this.generatePostMergeHook();
      
      fs.writeFileSync(hookPath, hookContent, 'utf8');
      
      // Make hook executable
      fs.chmodSync(hookPath, 0o755);
      
      logger.info('Installed post-merge hook for merge commit handling');
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to install post-merge hook:', error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Generate post-commit hook script
   */
  private generatePostCommitHook(): string {
    const scriptPath = this.config.hookScriptPath || path.join(this.projectRoot, 'scripts', 'post-commit.js');
    
    return `#!/bin/sh
# Post-commit hook for automatic commit indexing
# Generated by Code Review CLI

# Get the commit SHA
COMMIT_SHA=\$(git rev-parse HEAD)

# Run indexing in background to avoid slowing down commits
if command -v node >/dev/null 2>&1; then
  cd "${this.projectRoot}"
  nohup node "${scriptPath}" "\$COMMIT_SHA" >/dev/null 2>&1 &
  echo "Started background indexing for commit \$COMMIT_SHA"
else
  echo "Warning: Node.js not found, skipping automatic indexing"
fi
`;
  }

  /**
   * Generate pre-commit hook script
   */
  private generatePreCommitHook(): string {
    const scriptPath = this.config.hookScriptPath || path.join(this.projectRoot, 'scripts', 'pre-commit.js');
    
    return `#!/bin/sh
# Pre-commit hook for critical issue checking
# Generated by Code Review CLI

# Get staged files
STAGED_FILES=\$(git diff --cached --name-only)

if [ -z "\$STAGED_FILES" ]; then
  echo "No staged files, skipping pre-commit checks"
  exit 0
fi

# Run critical issue check
if command -v node >/dev/null 2>&1; then
  cd "${this.projectRoot}"
  if node "${scriptPath}" "\$STAGED_FILES"; then
    echo "Pre-commit checks passed"
    exit 0
  else
    echo "Pre-commit checks failed - critical issues found"
    exit 1
  fi
else
  echo "Warning: Node.js not found, skipping pre-commit checks"
  exit 0
fi
`;
  }

  /**
   * Generate post-merge hook script
   */
  private generatePostMergeHook(): string {
    const scriptPath = this.config.hookScriptPath || path.join(this.projectRoot, 'scripts', 'post-merge.js');
    
    return `#!/bin/sh
# Post-merge hook for handling merge commits
# Generated by Code Review CLI

# Get the merge commit SHA
MERGE_SHA=\$(git rev-parse HEAD)

# Run indexing in background for merge commits
if command -v node >/dev/null 2>&1; then
  cd "${this.projectRoot}"
  nohup node "${scriptPath}" "\$MERGE_SHA" >/dev/null 2>&1 &
  echo "Started background indexing for merge commit \$MERGE_SHA"
else
  echo "Warning: Node.js not found, skipping merge commit indexing"
fi
`;
  }

  /**
   * Check if current directory is a Git repository
   */
  private isGitRepository(): boolean {
    try {
      const gitDir = path.join(this.projectRoot, '.git');
      return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Execute a hook script with proper error handling
   */
  async executeHook(hookName: string, args: string[] = []): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const hookPath = path.join(this.hooksDir, hookName);
      
      if (!fs.existsSync(hookPath)) {
        resolve({ success: false, output: '', error: `Hook ${hookName} not found` });
        return;
      }

      // Check if hook is executable
      try {
        fs.accessSync(hookPath, fs.constants.X_OK);
      } catch {
        resolve({ success: false, output: '', error: `Hook ${hookName} is not executable` });
        return;
      }

      const child = spawn(hookPath, args, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          const result: { success: boolean; output: string; error?: string } = { success: true, output };
          if (errorOutput) result.error = errorOutput;
          resolve(result);
        } else {
          resolve({ success: false, output, error: errorOutput || `Hook exited with code ${code}` });
        }
      });

      child.on('error', (error) => {
        resolve({ success: false, output, error: error.message });
      });
    });
  }
}
