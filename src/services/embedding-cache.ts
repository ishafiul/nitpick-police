import fs from 'fs';
import path from 'path';
import { EmbeddingCacheEntry } from './embedding.service';
import logger from '../utils/logger';

export interface CacheStats {
  totalEntries: number;
  totalAccessCount: number;
  averageAccessCount: number;
  cacheSizeBytes: number;
  oldestEntry: string | null;
  newestEntry: string | null;
  hitRate: number;
  totalRequests: number;
  totalHits: number;
}

export interface CacheConfig {
  maxSize: number; 
  maxSizeBytes: number; 
  ttlMs: number; 
  cleanupIntervalMs: number; 
  persistencePath?: string | undefined; 
}

export class EmbeddingCache {
  private cache: Map<string, EmbeddingCacheEntry> = new Map();
  private config: CacheConfig;
  private isInitialized: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;
  private stats = {
    totalRequests: 0,
    totalHits: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 10000,
      maxSizeBytes: 100 * 1024 * 1024, 
      ttlMs: 7 * 24 * 60 * 60 * 1000, 
      cleanupIntervalMs: 60 * 60 * 1000, 
      persistencePath: undefined,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      
      if (this.config.persistencePath) {
        await this.loadPersistentCache();
      }

      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupIntervalMs);

      this.isInitialized = true;
      logger.info('EmbeddingCache: Initialized successfully', {
        maxSize: this.config.maxSize,
        maxSizeBytes: this.config.maxSizeBytes,
        persistencePath: this.config.persistencePath,
      });

    } catch (error) {
      logger.error('EmbeddingCache: Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.config.persistencePath) {
      await this.savePersistentCache();
    }

    this.isInitialized = false;
    logger.info('EmbeddingCache: Shutdown completed');
  }

  async get(sha256: string): Promise<EmbeddingCacheEntry | null> {
    this.stats.totalRequests++;

    const entry = this.cache.get(sha256);
    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      await this.delete(sha256);
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = new Date().toISOString();

    this.stats.totalHits++;

    return entry;
  }

  async set(sha256: string, entry: Omit<EmbeddingCacheEntry, 'sha256' | 'accessCount' | 'lastAccessed'>): Promise<void> {
    const cacheEntry: EmbeddingCacheEntry = {
      sha256,
      ...entry,
      accessCount: 1,
      lastAccessed: new Date().toISOString(),
    };

    if (this.cache.size >= this.config.maxSize) {
      await this.evictOldest();
    }

    const entrySize = this.calculateEntrySize(cacheEntry);
    if (this.getTotalSize() + entrySize > this.config.maxSizeBytes) {
      await this.evictBySize(entrySize);
    }

    this.cache.set(sha256, cacheEntry);

    if (this.config.persistencePath) {
      await this.savePersistentCache();
    }

    logger.debug('EmbeddingCache: Entry cached', {
      sha256,
      model: entry.model,
      vectorSize: entry.vector.length,
    });
  }

  async delete(sha256: string): Promise<boolean> {
    const deleted = this.cache.delete(sha256);

    if (deleted && this.config.persistencePath) {
      await this.savePersistentCache();
    }

    if (deleted) {
      logger.debug('EmbeddingCache: Entry deleted', { sha256 });
    }

    return deleted;
  }

  async has(sha256: string): Promise<boolean> {
    const entry = this.cache.get(sha256);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      await this.delete(sha256);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats.totalRequests = 0;
    this.stats.totalHits = 0;

    if (this.config.persistencePath) {
      await this.savePersistentCache();
    }

    logger.info('EmbeddingCache: Cache cleared');
  }

  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        totalAccessCount: 0,
        averageAccessCount: 0,
        cacheSizeBytes: 0,
        oldestEntry: null,
        newestEntry: null,
        hitRate: 0,
        totalRequests: this.stats.totalRequests,
        totalHits: this.stats.totalHits,
      };
    }

    const totalAccessCount = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const totalSizeBytes = this.getTotalSize();

    const sortedByDate = entries.sort((a, b) =>
      new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()
    );

    const hitRate = this.stats.totalRequests > 0 ? this.stats.totalHits / this.stats.totalRequests : 0;

    return {
      totalEntries: entries.length,
      totalAccessCount,
      averageAccessCount: totalAccessCount / entries.length,
      cacheSizeBytes: totalSizeBytes,
      oldestEntry: sortedByDate[0]?.generatedAt || null,
      newestEntry: sortedByDate[sortedByDate.length - 1]?.generatedAt || null,
      hitRate,
      totalRequests: this.stats.totalRequests,
      totalHits: this.stats.totalHits,
    };
  }

  getAllEntries(): EmbeddingCacheEntry[] {
    return Array.from(this.cache.values());
  }

  private async loadPersistentCache(): Promise<void> {
    if (!this.config.persistencePath) {
      return;
    }

    try {
      const cacheDir = path.dirname(this.config.persistencePath);

      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      if (fs.existsSync(this.config.persistencePath)) {
        const data = fs.readFileSync(this.config.persistencePath, 'utf-8');
        const entries: EmbeddingCacheEntry[] = JSON.parse(data);

        const now = Date.now();
        const validEntries = entries.filter(entry => {
          const age = now - new Date(entry.generatedAt).getTime();
          return age < this.config.ttlMs;
        });

        for (const entry of validEntries) {
          this.cache.set(entry.sha256, entry);
        }

        logger.info('EmbeddingCache: Loaded persistent cache', {
          totalEntries: entries.length,
          validEntries: validEntries.length,
          expiredEntries: entries.length - validEntries.length,
        });
      }

    } catch (error) {
      logger.warn('EmbeddingCache: Failed to load persistent cache', {
        path: this.config.persistencePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async savePersistentCache(): Promise<void> {
    if (!this.config.persistencePath) {
      return;
    }

    try {
      const cacheDir = path.dirname(this.config.persistencePath);

      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const entries = Array.from(this.cache.values());
      const data = JSON.stringify(entries, null, 2);

      fs.writeFileSync(this.config.persistencePath, data, 'utf-8');

      logger.debug('EmbeddingCache: Saved persistent cache', {
        entriesCount: entries.length,
        fileSize: data.length,
      });

    } catch (error) {
      logger.error('EmbeddingCache: Failed to save persistent cache', {
        path: this.config.persistencePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isExpired(entry: EmbeddingCacheEntry): boolean {
    const age = Date.now() - new Date(entry.generatedAt).getTime();
    return age > this.config.ttlMs;
  }

  private calculateEntrySize(entry: EmbeddingCacheEntry): number {
    
    const vectorSize = entry.vector.length * 8; 
    const metadataSize = JSON.stringify({
      sha256: entry.sha256,
      model: entry.model,
      generatedAt: entry.generatedAt,
      accessCount: entry.accessCount,
      lastAccessed: entry.lastAccessed,
    }).length;

    return vectorSize + metadataSize;
  }

  private getTotalSize(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += this.calculateEntrySize(entry);
    }
    return totalSize;
  }

  private async evictOldest(): Promise<void> {
    let oldestEntry: EmbeddingCacheEntry | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldestEntry || new Date(entry.lastAccessed).getTime() < new Date(oldestEntry.lastAccessed).getTime()) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      await this.delete(oldestKey);
      logger.debug('EmbeddingCache: Evicted oldest entry', {
        sha256: oldestKey,
        lastAccessed: oldestEntry?.lastAccessed,
      });
    }
  }

  private async evictBySize(requiredSize: number): Promise<void> {
    const currentSize = this.getTotalSize();
    const targetSize = this.config.maxSizeBytes - requiredSize;

    const entries = Array.from(this.cache.entries()).sort(([, a], [, b]) =>
      new Date(a.lastAccessed).getTime() - new Date(b.lastAccessed).getTime()
    );

    let evictedCount = 0;
    let currentEvictedSize = currentSize;

    for (const [key, entry] of entries) {
      if (currentEvictedSize <= targetSize) {
        break;
      }

      await this.delete(key);
      currentEvictedSize -= this.calculateEntrySize(entry);
      evictedCount++;
    }

    if (evictedCount > 0) {
      logger.debug('EmbeddingCache: Evicted entries by size', {
        evictedCount,
        targetSize,
        newSize: currentEvictedSize,
      });
    }
  }

  private async cleanup(): Promise<void> {
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      await this.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug('EmbeddingCache: Cleaned up expired entries', {
        expiredCount: expiredKeys.length,
      });
    }
  }
}
