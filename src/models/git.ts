
export interface GitRepositoryInfo {
  root: string;
  isRepository: boolean;
  currentBranch: string;
  remoteUrl?: string | undefined;
  lastCommit?: string | undefined;
  isClean: boolean;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: Date;
  message: string;
  body?: string;
  files: string[];
  linesAdded: number;
  linesDeleted: number;
  isMerge: boolean;
  parentHashes: string[];
  tags: string[];
}

export interface GitFileChange {
  file: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied';
  linesAdded: number;
  linesDeleted: number;
  isBinary: boolean;
  similarity?: number;
  oldFile?: string;
}

export interface GitDiffInfo {
  file: string;
  hunks: GitDiffHunk[];
  isBinary: boolean;
  similarity?: number;
  oldFile?: string;
}

export interface GitDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: GitDiffLine[];
}

export interface GitDiffLine {
  type: 'context' | 'addition' | 'deletion';
  oldNumber?: number | undefined;
  newNumber?: number | undefined;
  content: string;
}

export interface GitWorkingStatus {
  isClean: boolean;
  stagedFiles: GitFileChange[];
  unstagedFiles: GitFileChange[];
  untrackedFiles: string[];
  conflicts: string[];
}

export interface GitCommitRange {
  from: string;
  to: string;
  commits: GitCommitInfo[];
  filesChanged: string[];
  totalLinesAdded: number;
  totalLinesDeleted: number;
  summary: string;
}

export interface GitOptions {
  since?: string | Date;
  until?: string | Date;
  author?: string;
  maxCount?: number;
  skip?: number;
  includeBinary?: boolean;
  contextLines?: number;
  ignoreWhitespace?: boolean;
}

export enum GitErrorType {
  NOT_A_REPOSITORY = 'NOT_A_REPOSITORY',
  CORRUPTED_REPOSITORY = 'CORRUPTED_REPOSITORY',
  INVALID_COMMIT = 'INVALID_COMMIT',
  INVALID_BRANCH = 'INVALID_BRANCH',
  MERGE_CONFLICT = 'MERGE_CONFLICT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class GitError extends Error {
  constructor(
    message: string,
    public readonly type: GitErrorType,
    public readonly cause?: Error,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export const isGitRepositoryInfo = (obj: unknown): obj is GitRepositoryInfo => {
  if (!obj || typeof obj !== 'object') return false;
  const info = obj as GitRepositoryInfo;
  return (
    typeof info.root === 'string' &&
    typeof info.isRepository === 'boolean' &&
    typeof info.currentBranch === 'string' &&
    typeof info.isClean === 'boolean'
  );
};

export const isGitCommitInfo = (obj: unknown): obj is GitCommitInfo => {
  if (!obj || typeof obj !== 'object') return false;
  const commit = obj as GitCommitInfo;
  return (
    typeof commit.hash === 'string' &&
    typeof commit.shortHash === 'string' &&
    typeof commit.author === 'string' &&
    typeof commit.authorEmail === 'string' &&
    commit.date instanceof Date &&
    typeof commit.message === 'string' &&
    Array.isArray(commit.files) &&
    typeof commit.linesAdded === 'number' &&
    typeof commit.linesDeleted === 'number' &&
    typeof commit.isMerge === 'boolean' &&
    Array.isArray(commit.parentHashes) &&
    Array.isArray(commit.tags)
  );
};

export const isGitFileChange = (obj: unknown): obj is GitFileChange => {
  if (!obj || typeof obj !== 'object') return false;
  const change = obj as GitFileChange;
  return (
    typeof change.file === 'string' &&
    ['modified', 'added', 'deleted', 'renamed', 'copied'].includes(change.status) &&
    typeof change.linesAdded === 'number' &&
    typeof change.linesDeleted === 'number' &&
    typeof change.isBinary === 'boolean'
  );
};

export const isGitWorkingStatus = (obj: unknown): obj is GitWorkingStatus => {
  if (!obj || typeof obj !== 'object') return false;
  const status = obj as GitWorkingStatus;
  return (
    typeof status.isClean === 'boolean' &&
    Array.isArray(status.stagedFiles) &&
    Array.isArray(status.unstagedFiles) &&
    Array.isArray(status.untrackedFiles) &&
    Array.isArray(status.conflicts)
  );
};

export const parseGitDate = (dateString: string): Date => {
  return new Date(dateString);
};

export const formatGitHash = (hash: string, short: boolean = false): string => {
  return short ? hash.substring(0, 7) : hash;
};

export const isBinaryFile = (filePath: string): boolean => {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib', '.a',
    '.mp3', '.mp4', '.avi', '.mov', '.wav',
    '.class', '.jar', '.war', '.ear',
    '.pyc', '.pyo', '.pyd'
  ];
  
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  return binaryExtensions.includes(ext);
};

export const sanitizeGitPath = (path: string): string => {

  return path.replace(/\0/g, '').replace(/\\/g, '/');
};
