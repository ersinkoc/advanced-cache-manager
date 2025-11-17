import { LRUCache } from 'lru-cache';
import { BaseStore } from './BaseStore';
import {
  CacheKey,
  CacheValue,
  CacheOptions,
  CacheKeyValuePair,
  CacheStats,
  CacheEntry,
  StoreConfig,
} from '../types';

export class MemoryStore extends BaseStore {
  private cache: LRUCache<CacheKey, CacheEntry>;
  private tagIndex: Map<string, Set<CacheKey>>;
  private dependencyIndex: Map<string, Set<CacheKey>>;

  constructor(config: StoreConfig) {
    super(config);
    
    const options: LRUCache.Options<CacheKey, CacheEntry, unknown> = {
      max: config.max || 1000,
      ttl: config.ttl ? config.ttl * 1000 : undefined,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
      dispose: (value, key) => {
        this.cleanupIndexes(key, value);
      },
    };

    this.cache = new LRUCache(options);
    this.tagIndex = new Map();
    this.dependencyIndex = new Map();
  }

  async get<T = any>(key: CacheKey): Promise<T | null> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      
      const entry = this.cache.get(key);
      if (!entry) {
        return null;
      }

      if (this.isExpired(entry.createdAt, entry.ttl)) {
        this.cache.delete(key);
        return null;
      }

      entry.lastAccessed = Date.now();
      return entry.value as T;
    });
  }

  async set(key: CacheKey, value: CacheValue, options?: CacheOptions): Promise<void> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      this.validateValue(value);

      const entry: CacheEntry = {
        value,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        ttl: options?.ttl,
        tags: options?.tags,
        dependencies: options?.dependencies,
        compressed: options?.compress,
        serialized: options?.serialize,
      };

      this.cache.set(key, entry, {
        ttl: options?.ttl ? options.ttl * 1000 : undefined,
      });

      this.updateIndexes(key, entry);
    });
  }

  async del(key: CacheKey): Promise<boolean> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      return this.cache.delete(key);
    });
  }

  async mget(keys: CacheKey[]): Promise<Array<CacheValue | null>> {
    return this.executeWithCircuitBreaker(async () => {
      const results: Array<CacheValue | null> = [];
      
      for (const key of keys) {
        const value = await this.get(key);
        results.push(value);
      }
      
      return results;
    });
  }

  async mset(keyValuePairs: CacheKeyValuePair[], options?: CacheOptions): Promise<void> {
    return this.executeWithCircuitBreaker(async () => {
      for (const [key, value] of keyValuePairs) {
        await this.set(key, value, options);
      }
    });
  }

  async clear(): Promise<void> {
    return this.executeWithCircuitBreaker(async () => {
      this.cache.clear();
      this.tagIndex.clear();
      this.dependencyIndex.clear();
    });
  }

  async exists(key: CacheKey): Promise<boolean> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      return this.cache.has(key);
    });
  }

  async keys(pattern?: string): Promise<CacheKey[]> {
    return this.executeWithCircuitBreaker(async () => {
      const allKeys = Array.from(this.cache.keys());
      
      if (!pattern) {
        return allKeys;
      }

      const regex = this.patternToRegex(pattern);
      return allKeys.filter(key => regex.test(key));
    });
  }

  async getStats(): Promise<CacheStats> {
    return this.executeWithCircuitBreaker(async () => {
      const size = this.cache.size;
      const memoryUsage = this.calculateMemoryUsage();
      
      return {
        keys: size,
        size,
        memoryUsage,
      };
    });
  }

  async close(): Promise<void> {
    this.cache.clear();
    this.tagIndex.clear();
    this.dependencyIndex.clear();
  }

  async invalidateByTag(tag: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      const keys = this.tagIndex.get(tag);
      if (!keys) {
        return 0;
      }

      let count = 0;
      for (const key of keys) {
        if (this.cache.delete(key)) {
          count++;
        }
      }

      this.tagIndex.delete(tag);
      return count;
    });
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      const keys = await this.keys(pattern);
      let count = 0;
      
      for (const key of keys) {
        if (this.cache.delete(key)) {
          count++;
        }
      }
      
      return count;
    });
  }

  async invalidateByDependency(dependency: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      const keys = this.dependencyIndex.get(dependency);
      if (!keys) {
        return 0;
      }

      let count = 0;
      for (const key of keys) {
        if (this.cache.delete(key)) {
          count++;
        }
      }

      this.dependencyIndex.delete(dependency);
      return count;
    });
  }

  private updateIndexes(key: CacheKey, entry: CacheEntry): void {
    if (entry.tags) {
      for (const tag of entry.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(key);
      }
    }

    if (entry.dependencies) {
      for (const dependency of entry.dependencies) {
        if (!this.dependencyIndex.has(dependency)) {
          this.dependencyIndex.set(dependency, new Set());
        }
        this.dependencyIndex.get(dependency)!.add(key);
      }
    }
  }

  private cleanupIndexes(key: CacheKey, entry: CacheEntry): void {
    if (entry.tags) {
      for (const tag of entry.tags) {
        const tagKeys = this.tagIndex.get(tag);
        if (tagKeys) {
          tagKeys.delete(key);
          if (tagKeys.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }

    if (entry.dependencies) {
      for (const dependency of entry.dependencies) {
        const depKeys = this.dependencyIndex.get(dependency);
        if (depKeys) {
          depKeys.delete(key);
          if (depKeys.size === 0) {
            this.dependencyIndex.delete(dependency);
          }
        }
      }
    }
  }

  private patternToRegex(pattern: string): RegExp {
    // First, escape all special regex characters EXCEPT * and ?
    // We need to handle * and ? separately as they are wildcard characters in glob patterns
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special chars (note: * and ? not included)
      .replace(/\*/g, '.*')   // Convert glob * to regex .*
      .replace(/\?/g, '.');   // Convert glob ? to regex .
    return new RegExp(`^${regexPattern}$`);
  }

  private calculateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      totalSize += this.getObjectSize(key);
      totalSize += this.getObjectSize(entry);
    }
    
    return totalSize;
  }

  private getObjectSize(obj: any): number {
    if (obj === null || obj === undefined) return 0;
    if (typeof obj === 'string') return obj.length * 2;
    if (typeof obj === 'number') return 8;
    if (typeof obj === 'boolean') return 4;
    if (Buffer.isBuffer(obj)) return obj.length;
    if (typeof obj === 'object') {
      return JSON.stringify(obj).length * 2;
    }
    return 0;
  }
}