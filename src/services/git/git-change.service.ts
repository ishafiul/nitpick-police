import { GitManager } from '../../core/git-manager';
import { GitDiffInfo } from '../../models/git';
import logger from '../../utils/logger';

export interface FileChangeInfo {
  path: string;
  relativePath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string; 
  linesAdded: number;
  linesDeleted: number;
  isBinary: boolean;
  hash?: string; 
  size?: number | undefined; 
  language?: string; 
}

export interface ChangeDetectionOptions {
  sinceCommit?: string;
  untilCommit?: string;
  includeStaged?: boolean;
  includeUnstaged?: boolean;
  includeUntracked?: boolean;
  maxFiles?: number;
  includeBinaryFiles?: boolean;
}

export interface ChangeDetectionResult {
  changes: FileChangeInfo[];
  totalFiles: number;
  summary: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
  };
  commitRange?: {
    from: string;
    to: string;
    commitCount: number;
  };
}

export class GitChangeService {
  private gitManager: GitManager;
  private gitInitialized: boolean = false;

  constructor(repositoryPath?: string) {
    this.gitManager = new GitManager(repositoryPath);
  }

  async initialize(): Promise<void> {
    if (this.gitInitialized) {
      return;
    }

    try {
      await this.gitManager.initialize();
      this.gitInitialized = true;
      logger.info('GitChangeService: Initialized successfully');
    } catch (error) {
      logger.error('GitChangeService: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async detectChangesSinceCommit(
    commitHash: string,
    options: Omit<ChangeDetectionOptions, 'sinceCommit'> = {}
  ): Promise<ChangeDetectionResult> {
    await this.initialize();

    logger.debug('GitChangeService: Detecting changes since commit', {
      commitHash,
      options,
    });

    try {
      const [currentCommit, diffResult] = await Promise.all([
        this.getCurrentCommitHash(),
        this.getDiffChanges(commitHash, undefined, options),
      ]);

      const result: ChangeDetectionResult = {
        changes: diffResult.changes,
        totalFiles: diffResult.changes.length,
        summary: diffResult.summary,
        commitRange: {
          from: commitHash,
          to: currentCommit,
          commitCount: await this.getCommitCount(commitHash, currentCommit),
        },
      };

      logger.info('GitChangeService: Changes detected since commit', {
        commitHash,
        changesFound: result.totalFiles,
        summary: result.summary,
      });

      return result;

    } catch (error) {
      logger.error('GitChangeService: Failed to detect changes since commit', {
        commitHash,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async detectChangesBetweenCommits(
    fromCommit: string,
    toCommit: string,
    options: Omit<ChangeDetectionOptions, 'sinceCommit' | 'untilCommit'> = {}
  ): Promise<ChangeDetectionResult> {
    await this.initialize();

    logger.debug('GitChangeService: Detecting changes between commits', {
      fromCommit,
      toCommit,
      options,
    });

    try {
      const diffResult = await this.getDiffChanges(fromCommit, toCommit, options);

      const result: ChangeDetectionResult = {
        changes: diffResult.changes,
        totalFiles: diffResult.changes.length,
        summary: diffResult.summary,
        commitRange: {
          from: fromCommit,
          to: toCommit,
          commitCount: await this.getCommitCount(fromCommit, toCommit),
        },
      };

      logger.info('GitChangeService: Changes detected between commits', {
        fromCommit,
        toCommit,
        changesFound: result.totalFiles,
        summary: result.summary,
      });

      return result;

    } catch (error) {
      logger.error('GitChangeService: Failed to detect changes between commits', {
        fromCommit,
        toCommit,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async detectWorkingDirectoryChanges(
    options: Omit<ChangeDetectionOptions, 'sinceCommit' | 'untilCommit'> = {}
  ): Promise<ChangeDetectionResult> {
    await this.initialize();

    const {
      includeStaged = true,
      includeUnstaged = true,
      includeUntracked = true,
      maxFiles,
      includeBinaryFiles = false,
    } = options;

    logger.debug('GitChangeService: Detecting working directory changes', {
      includeStaged,
      includeUnstaged,
      includeUntracked,
      maxFiles,
    });

    try {
      const changes: FileChangeInfo[] = [];
      let totalAdded = 0, totalModified = 0, totalDeleted = 0, totalRenamed = 0;

      const status = await this.gitManager.getWorkingStatus();

      if (includeStaged) {
        const stagedDiff = await this.gitManager.getStagedDiff();
        const stagedChanges = await this.processDiffInfo(stagedDiff, 'staged', includeBinaryFiles);
        changes.push(...stagedChanges.changes);
        totalAdded += stagedChanges.summary.added;
        totalModified += stagedChanges.summary.modified;
        totalDeleted += stagedChanges.summary.deleted;
        totalRenamed += stagedChanges.summary.renamed;
      }

      if (includeUnstaged) {
        const unstagedDiff = await this.gitManager.getUnstagedDiff();
        const unstagedChanges = await this.processDiffInfo(unstagedDiff, 'unstaged', includeBinaryFiles);
        changes.push(...unstagedChanges.changes);
        totalAdded += unstagedChanges.summary.added;
        totalModified += unstagedChanges.summary.modified;
        totalDeleted += unstagedChanges.summary.deleted;
        totalRenamed += unstagedChanges.summary.renamed;
      }

      if (includeUntracked) {
        for (const file of status.untrackedFiles) {
          if (!includeBinaryFiles && await this.isBinaryFile(file)) {
            continue;
          }

          const changeInfo: FileChangeInfo = {
            path: file,
            relativePath: file,
            status: 'added',
            linesAdded: 0,
            linesDeleted: 0,
            isBinary: await this.isBinaryFile(file),
            size: await this.getFileSize(file),
            language: this.detectLanguage(file),
          };

          changes.push(changeInfo);
          totalAdded++;
        }
      }

      let filteredChanges = changes;
      if (maxFiles && changes.length > maxFiles) {
        filteredChanges = changes.slice(0, maxFiles);
        logger.debug('GitChangeService: Limited changes to maxFiles', {
          requested: maxFiles,
          actual: filteredChanges.length,
        });
      }

      const result: ChangeDetectionResult = {
        changes: filteredChanges,
        totalFiles: filteredChanges.length,
        summary: {
          added: totalAdded,
          modified: totalModified,
          deleted: totalDeleted,
          renamed: totalRenamed,
        },
      };

      logger.info('GitChangeService: Working directory changes detected', {
        changesFound: result.totalFiles,
        summary: result.summary,
      });

      return result;

    } catch (error) {
      logger.error('GitChangeService: Failed to detect working directory changes', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async getDiffChanges(
    fromCommit: string,
    toCommit?: string,
    options: ChangeDetectionOptions = {}
  ): Promise<{ changes: FileChangeInfo[]; summary: ChangeDetectionResult['summary'] }> {
    try {
      const diffInfo = await this.gitManager.getDiff(fromCommit, toCommit, {
        includeBinary: options.includeBinaryFiles || false,
      });

      return this.processDiffInfo(diffInfo, 'commit-diff', options.includeBinaryFiles || false);

    } catch (error) {
      logger.error('GitChangeService: Failed to get diff changes', {
        fromCommit,
        toCommit,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async processDiffInfo(
    diffInfo: GitDiffInfo[],
    source: string,
    includeBinaryFiles: boolean
  ): Promise<{ changes: FileChangeInfo[]; summary: ChangeDetectionResult['summary'] }> {
    const changes: FileChangeInfo[] = [];
    let added = 0, modified = 0, deleted = 0, renamed = 0;

    for (const diff of diffInfo) {
      if (!includeBinaryFiles && diff.isBinary) {
        continue;
      }

      const changeInfo: FileChangeInfo = {
        path: diff.file,
        relativePath: diff.file,
        status: this.determineChangeStatus(diff, source),
        linesAdded: this.calculateLinesAdded(diff),
        linesDeleted: this.calculateLinesDeleted(diff),
        isBinary: diff.isBinary,
        language: this.detectLanguage(diff.file),
        size: await this.getFileSize(diff.file),
      };

      changes.push(changeInfo);

      switch (changeInfo.status) {
        case 'added':
          added++;
          break;
        case 'modified':
          modified++;
          break;
        case 'deleted':
          deleted++;
          break;
        case 'renamed':
          renamed++;
          break;
      }
    }

    return {
      changes,
      summary: { added, modified, deleted, renamed },
    };
  }

  private determineChangeStatus(diff: GitDiffInfo, _source: string): FileChangeInfo['status'] {
    
    const hasAdditions = diff.hunks.some(hunk =>
      hunk.lines.some(line => line.type === 'addition')
    );
    const hasDeletions = diff.hunks.some(hunk =>
      hunk.lines.some(line => line.type === 'deletion')
    );

    if (hasAdditions && !hasDeletions) {
      return 'added';
    } else if (!hasAdditions && hasDeletions) {
      return 'deleted';
    } else if (hasAdditions && hasDeletions) {
      return 'modified';
    }

    return 'modified';
  }

  private calculateLinesAdded(diff: GitDiffInfo): number {
    let total = 0;
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'addition') {
          total++;
        }
      }
    }
    return total;
  }

  private calculateLinesDeleted(diff: GitDiffInfo): number {
    let total = 0;
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'deletion') {
          total++;
        }
      }
    }
    return total;
  }

  private async getCurrentCommitHash(): Promise<string> {
    try {
      const log = await this.gitManager.getSimpleGit().log({ maxCount: 1 });
      return log.latest?.hash || 'HEAD';
    } catch (error) {
      logger.warn('GitChangeService: Failed to get current commit hash, using HEAD', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 'HEAD';
    }
  }

  private async getCommitCount(fromCommit: string, toCommit: string): Promise<number> {
    try {
      const commits = await this.gitManager.getCommitsInRange(fromCommit, toCommit);
      return commits.length;
    } catch (error) {
      logger.warn('GitChangeService: Failed to get commit count', {
        fromCommit,
        toCommit,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const fs = require('fs').promises;
      const buffer = Buffer.alloc(512);
      const fd = await fs.open(filePath, 'r');
      const { bytesRead } = await fd.read(buffer, 0, 512, 0);
      await fd.close();

      if (bytesRead > 0) {
        
        for (let i = 0; i < Math.min(bytesRead, 100); i++) {
          if (buffer[i] === 0) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      
      return false;
    }
  }

  private async getFileSize(filePath: string): Promise<number | undefined> {
    try {
      const fs = require('fs').promises;
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return undefined;
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'ts':
        return 'typescript';
      case 'tsx':
        return 'tsx';
      case 'js':
        return 'javascript';
      case 'jsx':
        return 'jsx';
      case 'dart':
        return 'dart';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'cpp':
      case 'cc':
      case 'cxx':
      case 'c++':
        return 'cpp';
      case 'c':
        return 'c';
      case 'go':
        return 'go';
      case 'rs':
        return 'rust';
      case 'php':
        return 'php';
      case 'rb':
        return 'ruby';
      case 'cs':
        return 'csharp';
      case 'swift':
        return 'swift';
      case 'kt':
        return 'kotlin';
      case 'scala':
        return 'scala';
      default:
        return 'unknown';
    }
  }

  getRepositoryRoot(): string {
    return this.gitManager.getRepositoryRoot();
  }

  isInitialized(): boolean {
    return this.gitInitialized;
  }
}
