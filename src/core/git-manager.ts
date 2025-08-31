import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import path from 'path';
import {
  GitRepositoryInfo,
  GitCommitInfo,
  GitFileChange,
  GitDiffInfo,
  GitDiffHunk,
  GitDiffLine,
  GitWorkingStatus,
  GitCommitRange,
  GitOptions,
  GitError,
  GitErrorType,
  isGitRepositoryInfo,
  isGitCommitInfo,
  isGitWorkingStatus,
  parseGitDate,
  formatGitHash,
  isBinaryFile,
  sanitizeGitPath
} from '../models/git';

export class GitManager {
  private git: SimpleGit;
  private repositoryRoot: string;
  private isInitialized = false;

  constructor(repositoryPath: string = process.cwd()) {
    this.repositoryRoot = path.resolve(repositoryPath);
    
    const options: SimpleGitOptions = {
      baseDir: this.repositoryRoot,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: false,
      config: []
    };
    
    this.git = simpleGit(options);
  }

  /**
   * Initialize the Git manager and verify repository
   */
  async initialize(): Promise<void> {
    try {
      // Check if the directory is a Git repository
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new GitError(
          `Directory is not a Git repository: ${this.repositoryRoot}`,
          GitErrorType.NOT_A_REPOSITORY
        );
      }

      // Test basic Git operations
      await this.git.status();
      this.isInitialized = true;
    } catch (error) {
      if (error instanceof GitError) {
        throw error;
      }
      
      // Check for specific Git errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not a git repository')) {
        throw new GitError(
          `Directory is not a Git repository: ${this.repositoryRoot}`,
          GitErrorType.NOT_A_REPOSITORY
        );
      } else if (errorMessage.includes('corrupted')) {
        throw new GitError(
          `Git repository appears to be corrupted: ${this.repositoryRoot}`,
          GitErrorType.CORRUPTED_REPOSITORY,
          error as Error
        );
      } else {
        throw new GitError(
          `Failed to initialize Git manager: ${errorMessage}`,
          GitErrorType.UNKNOWN_ERROR,
          error as Error
        );
      }
    }
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(): Promise<GitRepositoryInfo> {
    this.ensureInitialized();

    try {
      const [status, branch, remote] = await Promise.all([
        this.git.status(),
        this.git.branch(),
        this.git.getRemotes(true)
      ]);

      const info: GitRepositoryInfo = {
        root: this.repositoryRoot,
        isRepository: true,
        currentBranch: branch.current,
        remoteUrl: remote.length > 0 ? remote[0]?.refs?.fetch : undefined,
        lastCommit: undefined,
        isClean: status.isClean()
      };

      if (!isGitRepositoryInfo(info)) {
        throw new GitError('Invalid repository info structure', GitErrorType.UNKNOWN_ERROR);
      }

      return info;
    } catch (error) {
      throw this.handleGitError(error, 'Failed to get repository info');
    }
  }

  /**
   * Get commit information for a specific commit
   */
  async getCommitInfo(commitHash: string): Promise<GitCommitInfo> {
    this.ensureInitialized();

    try {
      const [log, diff] = await Promise.all([
        this.git.log({ from: commitHash, to: commitHash, maxCount: 1 }),
        this.git.diff([commitHash + '^', commitHash, '--stat'])
      ]);

      if (log.latest === undefined) {
        throw new GitError(
          `Commit not found: ${commitHash}`,
          GitErrorType.INVALID_COMMIT
        );
      }

      const commit = log.latest;
      if (!commit) {
        throw new GitError(
          `Commit not found: ${commitHash}`,
          GitErrorType.INVALID_COMMIT
        );
      }

      const diffStats = this.parseDiffStats(diff);

      // Get parent hashes using git show
      const showResult = await this.git.raw(['show', '--format=%P', '--no-patch', commitHash]);
      const parentHashes = showResult.trim().split(/\s+/).filter(hash => hash.length > 0);

      const commitInfo: GitCommitInfo = {
        hash: commit.hash,
        shortHash: formatGitHash(commit.hash, true),
        author: commit.author_name,
        authorEmail: commit.author_email,
        date: parseGitDate(commit.date),
        message: commit.message,
        body: commit.body,
        files: diffStats.files,
        linesAdded: diffStats.linesAdded,
        linesDeleted: diffStats.linesDeleted,
        isMerge: parentHashes.length > 1,
        parentHashes: parentHashes,
        tags: await this.getCommitTags(commit.hash)
      };

      if (!isGitCommitInfo(commitInfo)) {
        throw new GitError('Invalid commit info structure', GitErrorType.UNKNOWN_ERROR);
      }

      return commitInfo;
    } catch (error) {
      throw this.handleGitError(error, `Failed to get commit info for ${commitHash}`);
    }
  }

  /**
   * Get commits in a range
   */
  async getCommitsInRange(from: string, to: string, options: GitOptions = {}): Promise<GitCommitInfo[]> {
    this.ensureInitialized();

    try {
      const logOptions: any = {
        from: from,
        to: to,
        maxCount: options.maxCount || 100,
        skip: options.skip || 0
      };

      if (options.author) {
        logOptions.author = options.author;
      }

      const log = await this.git.log(logOptions);
      
      const commits: GitCommitInfo[] = [];
      for (const commit of log.all) {
        const commitInfo = await this.getCommitInfo(commit.hash);
        commits.push(commitInfo);
      }

      return commits;
    } catch (error) {
      throw this.handleGitError(error, `Failed to get commits in range ${from}..${to}`);
    }
  }

  /**
   * Analyze commit range with summary
   */
  async analyzeCommitRange(from: string, to: string, options: GitOptions = {}): Promise<GitCommitRange> {
    this.ensureInitialized();

    try {
      const commits = await this.getCommitsInRange(from, to, options);
      
      // Get diff stats for the entire range
      const diff = await this.git.diff([from, to, '--stat']);
      const diffStats = this.parseDiffStats(diff);

      const range: GitCommitRange = {
        from,
        to,
        commits,
        filesChanged: diffStats.files,
        totalLinesAdded: diffStats.linesAdded,
        totalLinesDeleted: diffStats.linesDeleted,
        summary: this.generateCommitRangeSummary(commits, diffStats)
      };

      return range;
    } catch (error) {
      throw this.handleGitError(error, `Failed to analyze commit range ${from}..${to}`);
    }
  }

  /**
   * Get working directory status
   */
  async getWorkingStatus(): Promise<GitWorkingStatus> {
    this.ensureInitialized();

    try {
      const status = await this.git.status();
      
      const workingStatus: GitWorkingStatus = {
        isClean: status.isClean(),
        stagedFiles: this.parseStatusFiles(status.staged, 'added'),
        unstagedFiles: this.parseStatusFiles(status.modified, 'modified'),
        untrackedFiles: status.not_added,
        conflicts: status.conflicted
      };

      // Add deleted files
      workingStatus.stagedFiles.push(...this.parseStatusFiles(status.deleted, 'deleted'));
      workingStatus.unstagedFiles.push(...this.parseStatusFiles(status.deleted, 'deleted'));

      if (!isGitWorkingStatus(workingStatus)) {
        throw new GitError('Invalid working status structure', GitErrorType.UNKNOWN_ERROR);
      }

      return workingStatus;
    } catch (error) {
      throw this.handleGitError(error, 'Failed to get working status');
    }
  }

  /**
   * Get diff for a specific commit or range
   */
  async getDiff(from: string, to?: string, options: GitOptions = {}): Promise<GitDiffInfo[]> {
    this.ensureInitialized();

    try {
      const diffArgs = to ? [from, to] : [from + '^', from];
      
      if (options.contextLines !== undefined) {
        diffArgs.push(`-U${options.contextLines}`);
      }
      
      if (options.ignoreWhitespace) {
        diffArgs.push('--ignore-all-space');
      }

      const diff = await this.git.diff(diffArgs);
      return this.parseDiffOutput(diff, options);
    } catch (error) {
      throw this.handleGitError(error, `Failed to get diff for ${from}${to ? `..${to}` : ''}`);
    }
  }

  /**
   * Get staged changes diff
   */
  async getStagedDiff(options: GitOptions = {}): Promise<GitDiffInfo[]> {
    this.ensureInitialized();

    try {
      const diff = await this.git.diff(['--cached']);
      return this.parseDiffOutput(diff, options);
    } catch (error) {
      throw this.handleGitError(error, 'Failed to get staged diff');
    }
  }

  /**
   * Get unstaged changes diff
   */
  async getUnstagedDiff(options: GitOptions = {}): Promise<GitDiffInfo[]> {
    this.ensureInitialized();

    try {
      const diff = await this.git.diff();
      return this.parseDiffOutput(diff, options);
    } catch (error) {
      throw this.handleGitError(error, 'Failed to get unstaged diff');
    }
  }

  /**
   * Check if a file is ignored by .gitignore
   */
  async isIgnored(filePath: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const result = await this.git.checkIgnore(filePath);
      return result.length > 0;
    } catch (error) {
      // If check-ignore fails, assume not ignored
      return false;
    }
  }

  /**
   * Get all ignored files
   */
  async getIgnoredFiles(): Promise<string[]> {
    this.ensureInitialized();

    try {
      const result = await this.git.raw(['ls-files', '--others', '--ignored', '--exclude-standard']);
      return result.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      throw this.handleGitError(error, 'Failed to get ignored files');
    }
  }

  /**
   * Get commit tags
   */
  private async getCommitTags(commitHash: string): Promise<string[]> {
    try {
      const result = await this.git.raw(['tag', '--points-at', commitHash]);
      return result.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      // If tags command fails, return empty array
      return [];
    }
  }

  /**
   * Parse diff statistics from git diff --stat output
   */
  private parseDiffStats(diffOutput: string): { files: string[]; linesAdded: number; linesDeleted: number } {
    const files: string[] = [];
    let linesAdded = 0;
    let linesDeleted = 0;

    const lines = diffOutput.split('\n');
    for (const line of lines) {
      // Look for lines like " 2 files changed, 4 insertions(+), 2 deletions(-)"
      if (line.includes('files changed')) {
        const match = line.match(/(\d+) insertions?\(\+\), (\d+) deletions?\(-\)/);
        if (match && match[1] && match[2]) {
          linesAdded = parseInt(match[1], 10);
          linesDeleted = parseInt(match[2], 10);
        }
      }
      // Look for file lines like " src/file.ts | 2 +-"
      else if (line.includes('|') && line.trim().length > 0) {
        const parts = line.split('|');
        if (parts.length >= 2 && parts[0]) {
          const fileName = parts[0].trim();
          if (fileName && !fileName.startsWith('--')) {
            files.push(fileName);
          }
        }
      }
    }

    return { files, linesAdded, linesDeleted };
  }

  /**
   * Parse status files into GitFileChange objects
   */
  private parseStatusFiles(files: string[], status: GitFileChange['status']): GitFileChange[] {
    return files.map(file => ({
      file: sanitizeGitPath(file),
      status: status as GitFileChange['status'],
      linesAdded: 0,
      linesDeleted: 0,
      isBinary: isBinaryFile(file)
    }));
  }

  /**
   * Parse diff output into structured format
   */
  private parseDiffOutput(diffOutput: string, options: GitOptions): GitDiffInfo[] {
    const diffs: GitDiffInfo[] = [];
    const fileDiffs = this.splitDiffByFile(diffOutput);

    for (const [filePath, fileDiff] of fileDiffs) {
      if (options.includeBinary === false && isBinaryFile(filePath)) {
        continue;
      }

      const diffInfo: GitDiffInfo = {
        file: sanitizeGitPath(filePath),
        hunks: this.parseDiffHunks(fileDiff),
        isBinary: isBinaryFile(filePath)
      };

      diffs.push(diffInfo);
    }

    return diffs;
  }

  /**
   * Split diff output by file
   */
  private splitDiffByFile(diffOutput: string): Map<string, string> {
    const fileDiffs = new Map<string, string>();
    const filePattern = /^diff --git a\/(.+) b\/(.+)$/;
    let currentFile = '';
    let currentDiff = '';

    const lines = diffOutput.split('\n');
    for (const line of lines) {
      const match = line.match(filePattern);
      if (match && match[1]) {
        if (currentFile && currentDiff) {
          fileDiffs.set(currentFile, currentDiff.trim());
        }
        currentFile = match[1];
        currentDiff = line + '\n';
      } else if (currentFile) {
        currentDiff += line + '\n';
      }
    }

    if (currentFile && currentDiff) {
      fileDiffs.set(currentFile, currentDiff.trim());
    }

    return fileDiffs;
  }

  /**
   * Parse diff hunks from file diff
   */
  private parseDiffHunks(fileDiff: string): GitDiffHunk[] {
    const hunks: GitDiffHunk[] = [];
    const hunkPattern = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.+)$/;

    const lines = fileDiff.split('\n');
    let currentHunk: GitDiffHunk | null = null;
    let lineNumber = 0;

    for (const line of lines) {
      const match = line.match(hunkPattern);
      if (match && match[1] && match[3]) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }

        currentHunk = {
          oldStart: parseInt(match[1], 10),
          oldLines: parseInt(match[2] || '1', 10),
          newStart: parseInt(match[3], 10),
          newLines: parseInt(match[4] || '1', 10),
          header: match[5] || '',
          lines: []
        };
        lineNumber = 0;
      } else if (currentHunk) {
        const diffLine: GitDiffLine = {
          type: 'context',
          content: line,
          oldNumber: undefined,
          newNumber: undefined
        };

        if (line.startsWith('+')) {
          diffLine.type = 'addition';
          diffLine.newNumber = currentHunk.newStart + lineNumber;
        } else if (line.startsWith('-')) {
          diffLine.type = 'deletion';
          diffLine.oldNumber = currentHunk.oldStart + lineNumber;
        } else {
          lineNumber++;
        }

        currentHunk.lines.push(diffLine);
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * Generate summary for commit range
   */
  private generateCommitRangeSummary(commits: GitCommitInfo[], diffStats: { linesAdded: number; linesDeleted: number }): string {
    const commitCount = commits.length;
    const filesChanged = new Set<string>();
    
    commits.forEach(commit => {
      commit.files.forEach(file => filesChanged.add(file));
    });

    return `${commitCount} commits changed ${filesChanged.size} files (+${diffStats.linesAdded} -${diffStats.linesDeleted})`;
  }

  /**
   * Ensure Git manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new GitError(
        'Git manager not initialized. Call initialize() first.',
        GitErrorType.UNKNOWN_ERROR
      );
    }
  }

  /**
   * Handle Git errors and convert to custom GitError
   */
  private handleGitError(error: unknown, context: string): GitError {
    if (error instanceof GitError) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('not a git repository')) {
      return new GitError(context, GitErrorType.NOT_A_REPOSITORY, error as Error);
    } else if (errorMessage.includes('corrupted')) {
      return new GitError(context, GitErrorType.CORRUPTED_REPOSITORY, error as Error);
    } else if (errorMessage.includes('invalid commit')) {
      return new GitError(context, GitErrorType.INVALID_COMMIT, error as Error);
    } else if (errorMessage.includes('merge conflict')) {
      return new GitError(context, GitErrorType.MERGE_CONFLICT, error as Error);
    } else if (errorMessage.includes('permission denied')) {
      return new GitError(context, GitErrorType.PERMISSION_ERROR, error as Error);
    } else {
      return new GitError(context, GitErrorType.UNKNOWN_ERROR, error as Error);
    }
  }

  /**
   * Get the underlying SimpleGit instance
   */
  getSimpleGit(): SimpleGit {
    return this.git;
  }

  /**
   * Get repository root path
   */
  getRepositoryRoot(): string {
    return this.repositoryRoot;
  }
}
