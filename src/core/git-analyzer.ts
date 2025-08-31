import { GitManager } from './git-manager';
import { StateManager } from './state-manager';
import {
  GitCommitInfo,
  GitOptions,
  GitError,
  GitErrorType
} from '../models/git';
import { CommitIndexType } from '../models/state';

export class GitAnalyzer {
  private gitManager: GitManager;
  private stateManager: StateManager;

  constructor(gitManager: GitManager, stateManager: StateManager) {
    this.gitManager = gitManager;
    this.stateManager = stateManager;
  }

  /**
   * Analyze and index commits since a specific date or commit
   */
  async analyzeCommitsSince(since: string | Date, options: GitOptions = {}): Promise<CommitIndexType[]> {
    try {
      const sinceStr = since instanceof Date ? since.toISOString() : since;
      const commits = await this.gitManager.getCommitsInRange(sinceStr, 'HEAD', options);
      
      const commitIndexes: CommitIndexType[] = [];
      for (const commit of commits) {
        const commitIndex = await this.createCommitIndex(commit);
        commitIndexes.push(commitIndex);
      }

      return commitIndexes;
    } catch (error) {
      throw new GitError(
        `Failed to analyze commits since ${since}: ${error instanceof Error ? error.message : String(error)}`,
        GitErrorType.UNKNOWN_ERROR,
        error as Error
      );
    }
  }

  /**
   * Analyze and index a specific commit range
   */
  async analyzeCommitRange(from: string, to: string, options: GitOptions = {}): Promise<CommitIndexType[]> {
    try {
      const range = await this.gitManager.analyzeCommitRange(from, to, options);
      
      const commitIndexes: CommitIndexType[] = [];
      for (const commit of range.commits) {
        const commitIndex = await this.createCommitIndex(commit);
        commitIndexes.push(commitIndex);
      }

      return commitIndexes;
    } catch (error) {
      throw new GitError(
        `Failed to analyze commit range ${from}..${to}: ${error instanceof Error ? error.message : String(error)}`,
        GitErrorType.UNKNOWN_ERROR,
        error as Error
      );
    }
  }

  /**
   * Analyze and index the latest commit
   */
  async analyzeLatestCommit(): Promise<CommitIndexType | null> {
    try {
      const repoInfo = await this.gitManager.getRepositoryInfo();
      if (!repoInfo.lastCommit) {
        return null;
      }

      const commit = await this.gitManager.getCommitInfo(repoInfo.lastCommit);
      return await this.createCommitIndex(commit);
    } catch (error) {
      throw new GitError(
        `Failed to analyze latest commit: ${error instanceof Error ? error.message : String(error)}`,
        GitErrorType.UNKNOWN_ERROR,
        error as Error
      );
    }
  }

  /**
   * Analyze working directory changes
   */
  async analyzeWorkingDirectory(): Promise<{
    stagedChanges: CommitIndexType | null;
    unstagedChanges: CommitIndexType | null;
  }> {
    try {
      const workingStatus = await this.gitManager.getWorkingStatus();
      
      let stagedChanges: CommitIndexType | null = null;
      let unstagedChanges: CommitIndexType | null = null;

      if (workingStatus.stagedFiles.length > 0) {
        stagedChanges = await this.createWorkingDirectoryIndex(workingStatus.stagedFiles, 'staged');
      }

      if (workingStatus.unstagedFiles.length > 0) {
        unstagedChanges = await this.createWorkingDirectoryIndex(workingStatus.unstagedFiles, 'unstaged');
      }

      return { stagedChanges, unstagedChanges };
    } catch (error) {
      throw new GitError(
        `Failed to analyze working directory: ${error instanceof Error ? error.message : String(error)}`,
        GitErrorType.UNKNOWN_ERROR,
        error as Error
      );
    }
  }

  /**
   * Get commit statistics for a date range
   */
  async getCommitStats(since: Date, until: Date): Promise<{
    totalCommits: number;
    totalFilesChanged: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
    commitsByAuthor: Record<string, number>;
    filesByType: Record<string, number>;
  }> {
    try {
      const sinceStr = since.toISOString();
      const untilStr = until.toISOString();
      
      const commits = await this.gitManager.getCommitsInRange(sinceStr, untilStr);
      
      const stats = {
        totalCommits: commits.length,
        totalFilesChanged: 0,
        totalLinesAdded: 0,
        totalLinesDeleted: 0,
        commitsByAuthor: {} as Record<string, number>,
        filesByType: {} as Record<string, number>
      };

      for (const commit of commits) {
        // Count commits by author
        stats.commitsByAuthor[commit.author] = (stats.commitsByAuthor[commit.author] || 0) + 1;
        
        // Count lines and files
        stats.totalLinesAdded += commit.linesAdded;
        stats.totalLinesDeleted += commit.linesDeleted;
        
        // Count files by type
        for (const file of commit.files) {
          const ext = this.getFileExtension(file);
          stats.filesByType[ext] = (stats.filesByType[ext] || 0) + 1;
        }
        
        stats.totalFilesChanged += commit.files.length;
      }

      return stats;
    } catch (error) {
      throw new GitError(
        `Failed to get commit stats: ${error instanceof Error ? error.message : String(error)}`,
        GitErrorType.UNKNOWN_ERROR,
        error as Error
      );
    }
  }

  /**
   * Find commits by content or message pattern
   */
  async findCommitsByPattern(pattern: string): Promise<CommitIndexType[]> {
    try {
      // Use git log with grep to search commit messages
      const git = this.gitManager.getSimpleGit();
      const result = await git.raw(['log', '--grep', pattern, '--oneline', '--all']);
      
      const commitHashes = result
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          const parts = line.split(' ');
          return parts[0] || '';
        })
        .filter(hash => hash && hash.length > 0);

      const commitIndexes: CommitIndexType[] = [];
      for (const hash of commitHashes) {
        try {
          const commit = await this.gitManager.getCommitInfo(hash);
          const commitIndex = await this.createCommitIndex(commit);
          commitIndexes.push(commitIndex);
        } catch (error) {
          // Skip commits that can't be analyzed
          console.warn(`Skipping commit ${hash}: ${error}`);
        }
      }

      return commitIndexes;
    } catch (error) {
      throw new GitError(
        `Failed to find commits by pattern: ${error instanceof Error ? error.message : String(error)}`,
        GitErrorType.UNKNOWN_ERROR,
        error as Error
      );
    }
  }

  /**
   * Create a commit index from Git commit info
   */
  private async createCommitIndex(commit: GitCommitInfo): Promise<CommitIndexType> {
    const commitIndex: CommitIndexType = {
      id: this.generateId(),
      sha: commit.hash,
      indexed_at: new Date(),
      summary: commit.message,
      created_at: new Date(),
      updated_at: new Date(),
    };

    return commitIndex;
  }

  /**
   * Create a working directory index for staged/unstaged changes
   */
  private async createWorkingDirectoryIndex(_files: any[], status: string): Promise<CommitIndexType> {
    const commitIndex: CommitIndexType = {
      id: this.generateId(),
      sha: `working-${status}-${Date.now()}`,
      indexed_at: new Date(),
      summary: `${status} changes in working directory`,
      created_at: new Date(),
      updated_at: new Date(),
    };

    return commitIndex;
  }

  /**
   * Get file extension from file path
   */
  private getFileExtension(filePath: string): string {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) return 'no-extension';
    
    const ext = filePath.substring(lastDotIndex + 1).toLowerCase();
    return ext || 'no-extension';
  }

  /**
   * Generate a unique ID for commit indexes
   */
  private generateId(): string {
    return `commit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the underlying Git manager
   */
  getGitManager(): GitManager {
    return this.gitManager;
  }

  /**
   * Get the underlying state manager
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }
}
