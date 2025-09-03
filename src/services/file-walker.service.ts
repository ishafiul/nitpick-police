import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../config';
import { detectLanguageFromPath } from '../types/chunking';
import logger from '../utils/logger';

export interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  mtime: Date;
  language: string;
  extension: string;
  isBinary: boolean;
  isDirectory: boolean;
}

export interface WalkOptions {
  maxDepth?: number;
  followSymlinks?: boolean;
  includeHidden?: boolean;
  maxFiles?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface WalkResult {
  files: FileInfo[];
  directories: string[];
  totalFiles: number;
  totalSize: number;
  processingTime: number;
  filteredByPatterns: number;
  errors: Array<{ path: string; error: string }>;
}

export class FileWalkerService {
  private configManager: ConfigManager;
  private isInitialized: boolean = false;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.configManager.loadConfig();
    this.isInitialized = true;
    logger.debug('FileWalkerService: Initialized successfully');
  }

  async walkDirectory(
    rootPath: string,
    options: WalkOptions = {}
  ): Promise<WalkResult> {
    await this.initialize();

    const startTime = Date.now();
    const {
      maxDepth = 10,
      followSymlinks = false,
      includeHidden = false,
      maxFiles,
      includePatterns,
      excludePatterns,
    } = options;

    const indexingConfig = this.configManager.get('indexing');

    const defaultIncludeFromConfig: string[] = indexingConfig?.include_patterns || [
      'src/**/*.{ts,tsx,js,jsx}',
      'lib/**/*.{ts,tsx,js,jsx}',
      '*.{ts,tsx,js,jsx}',
    ];

    const defaultExcludePatterns = indexingConfig?.exclude_patterns || [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      '*.min.js',
      '*.bundle.js',
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ];

    const finalIncludePatterns = includePatterns && includePatterns.length > 0 ? includePatterns : defaultIncludeFromConfig;
    const finalExcludePatterns = excludePatterns && excludePatterns.length > 0 ? excludePatterns : defaultExcludePatterns;

    logger.debug('FileWalkerService: Starting directory walk', {
      rootPath,
      includePatterns: finalIncludePatterns.length,
      excludePatterns: finalExcludePatterns.length,
      maxDepth,
      maxFiles,
    });

    const files: FileInfo[] = [];
    const directories: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    let filteredByPatterns = 0;

    const walk = (currentPath: string, currentDepth: number): void => {
      if (currentDepth > maxDepth) return;
      if (maxFiles && files.length >= (maxFiles as number)) return;

      try {
        const stats = fs.statSync(currentPath);

        if (stats.isDirectory()) {
          const relativePath = path.relative(rootPath, currentPath);
          if (this.shouldExclude(relativePath, finalExcludePatterns, true)) return;

          directories.push(currentPath);
          if (!includeHidden && path.basename(currentPath).startsWith('.')) return;

          const entries = fs.readdirSync(currentPath);
          for (const entry of entries) {
            if (maxFiles && files.length >= (maxFiles as number)) break;
            const entryPath = path.join(currentPath, entry);
            walk(entryPath, currentDepth + 1);
          }
        } else if (stats.isFile()) {
          if (!followSymlinks && this.isSymlink(currentPath)) return;
          const relativePath = path.relative(rootPath, currentPath);
          if (!this.shouldInclude(relativePath, finalIncludePatterns, finalExcludePatterns)) {
            filteredByPatterns++;
            return;
          }
          const fileInfo = this.createFileInfo(currentPath, relativePath, stats);
          files.push(fileInfo);
        } else if (stats.isSymbolicLink()) {
          if (followSymlinks) {
            try {
              const realPath = fs.realpathSync(currentPath);
              walk(realPath, currentDepth);
            } catch (error) {
              errors.push({
                path: currentPath,
                error: `Failed to resolve symlink: ${error instanceof Error ? error.message : String(error)}`,
              });
            }
          }
        }
      } catch (error) {
        errors.push({
          path: currentPath,
          error: `Failed to process: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    };

    walk(rootPath, 0);

    const processingTime = Date.now() - startTime;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    const result: WalkResult = {
      files,
      directories,
      totalFiles: files.length,
      totalSize,
      processingTime,
      filteredByPatterns,
      errors,
    };

    logger.info('FileWalkerService: Directory walk completed', {
      rootPath,
      totalFiles: files.length,
      totalDirectories: directories.length,
      totalSize,
      processingTime,
      filteredByPatterns,
      errors: errors.length,
    });

    return result;
  }

  async walkPatterns(
    rootPath: string,
    patterns: string[],
    options: Omit<WalkOptions, 'includePatterns'> = {}
  ): Promise<WalkResult> {
    return this.walkDirectory(rootPath, {
      ...options,
      includePatterns: patterns,
    });
  }

  async getRepositoryStats(rootPath: string): Promise<{
    totalFiles: number;
    totalSize: number;
    languageBreakdown: Record<string, number>;
    largestFiles: Array<{ path: string; size: number }>;
    oldestFiles: Array<{ path: string; mtime: Date }>;
    newestFiles: Array<{ path: string; mtime: Date }>;
  }> {
    const result = await this.walkDirectory(rootPath, { maxDepth: 5 });

    const languageBreakdown: Record<string, number> = {};
    const fileSizes: Array<{ path: string; size: number }> = [];
    const fileMtimes: Array<{ path: string; mtime: Date }> = [];

    for (const file of result.files) {
      languageBreakdown[file.language] = (languageBreakdown[file.language] || 0) + 1;
      fileSizes.push({ path: file.path, size: file.size });
      fileMtimes.push({ path: file.path, mtime: file.mtime });
    }

    const largestFiles = fileSizes.sort((a, b) => b.size - a.size).slice(0, 10);
    const oldestFiles = fileMtimes.sort((a, b) => a.mtime.getTime() - b.mtime.getTime()).slice(0, 10);
    const newestFiles = fileMtimes.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).slice(0, 10);

    return {
      totalFiles: result.totalFiles,
      totalSize: result.totalSize,
      languageBreakdown,
      largestFiles,
      oldestFiles,
      newestFiles,
    };
  }

  private shouldInclude(relativePath: string, includePatterns: string[], excludePatterns: string[]): boolean {
    if (this.shouldExclude(relativePath, excludePatterns, false)) return false;
    return this.matchesAnyPattern(relativePath, includePatterns);
  }

  private shouldExclude(relativePath: string, excludePatterns: string[], _isDirectory: boolean): boolean {
    return this.matchesAnyPattern(relativePath, excludePatterns);
  }

  private matchesAnyPattern(relativePath: string, patterns: string[]): boolean {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    for (const pattern of patterns) {
      if (this.matchesPattern(normalizedPath, pattern)) return true;
    }
    return false;
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\./g, '\\.')
      .replace(/\{([^}]+)\}/g, '($1)');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  private isSymlink(filePath: string): boolean {
    try {
      const stats = fs.lstatSync(filePath);
      return stats.isSymbolicLink();
    } catch {
      return false;
    }
  }

  private createFileInfo(filePath: string, relativePath: string, stats: fs.Stats): FileInfo {
    const extension = path.extname(filePath).toLowerCase();
    const language = detectLanguageFromPath(filePath);
    const isBinary = this.isBinaryFile(filePath, extension);
    return {
      path: filePath,
      relativePath,
      size: stats.size,
      mtime: stats.mtime,
      language,
      extension,
      isBinary,
      isDirectory: false,
    };
  }

  private isBinaryFile(filePath: string, extension: string): boolean {
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.zip', '.rar', '.7z', '.tar', '.gz',
      '.exe', '.dll', '.so', '.dylib',
      '.pyc', '.class',
    ];
    if (binaryExtensions.includes(extension)) return true;
    try {
      const buffer = Buffer.alloc(512);
      const fd = fs.openSync(filePath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
      fs.closeSync(fd);
      if (bytesRead > 0) {
        for (let i = 0; i < Math.min(bytesRead, 100); i++) {
          if (buffer[i] === 0) return true;
        }
      }
    } catch (error) {
      logger.debug('FileWalkerService: Could not read file for binary detection', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  }

  async getFilesChangedSince(
    rootPath: string,
    since: Date,
    options: WalkOptions = {}
  ): Promise<FileInfo[]> {
    const result = await this.walkDirectory(rootPath, options);
    return result.files.filter(file => file.mtime > since);
  }

  async getFilesByLanguage(
    rootPath: string,
    language: string,
    options: WalkOptions = {}
  ): Promise<FileInfo[]> {
    const result = await this.walkDirectory(rootPath, options);
    return result.files.filter(file => file.language === language);
  }

  async getFilesBySize(
    rootPath: string,
    minSize?: number,
    maxSize?: number,
    options: WalkOptions = {}
  ): Promise<FileInfo[]> {
    const result = await this.walkDirectory(rootPath, options);
    return result.files.filter(file => {
      if (minSize !== undefined && file.size < minSize) return false;
      if (maxSize !== undefined && file.size > maxSize) return false;
      return true;
    });
  }
}
