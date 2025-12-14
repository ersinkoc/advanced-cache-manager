import * as Memcached from 'memcached';
import { createHash } from 'crypto';
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

export class MemcachedStore extends BaseStore {
  private memcached: Memcached;
  private servers: string[];
  private tagPrefix = 'tag:';
  private dependencyPrefix = 'dep:';
  // Default TTL for tag/dependency index sets (30 days).
  // Using a long TTL ensures index sets don't expire prematurely when entries
  // are removed. Stale references are cleaned up when accessed.
  private indexSetDefaultTTL = 2592000;

  constructor(config: StoreConfig) {
    super(config);
    
    this.servers = config.servers || ['127.0.0.1:11211'];
    
    const options = {
      maxKeySize: 250,
      maxExpiration: 2592000,
      maxValue: 1048576,
      poolSize: 10,
      algorithm: 'md5',
      reconnect: 18000000,
      timeout: 5000,
      retries: 5,
      retry: 30000,
      remove: true,
      failOverServers: undefined,
      keyCompression: true,
      idle: 5000,
      ...config.options,
    };

    this.memcached = new (Memcached as any)(this.servers, options);
    
    this.memcached.on('failure', (details: any) => {
      console.error('Memcached server failure:', details);
    });

    this.memcached.on('reconnecting', (details: any) => {
      console.log('Memcached reconnecting:', details);
    });
  }

  async get<T = any>(key: CacheKey): Promise<T | null> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      
      return new Promise<T | null>((resolve, reject) => {
        this.memcached.get(key, (err: any, data: any) => {
          if (err) {
            reject(err);
            return;
          }

          if (!data) {
            resolve(null);
            return;
          }

          try {
            const entry: CacheEntry = JSON.parse(data as string);

            if (this.isExpired(entry.createdAt, entry.ttl)) {
              this.memcached.del(key, () => {});
              resolve(null);
              return;
            }

            // Note: We don't update lastAccessed or reset TTL on read to avoid
            // unintentionally extending the life of cache entries on every access.
            // If sliding expiration is desired, it should be implemented as a
            // separate feature with explicit configuration.

            resolve(entry.value as T);
          } catch (error) {
            reject(error);
          }
        });
      });
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

      const ttl = options?.ttl || 3600;
      
      return new Promise<void>((resolve, reject) => {
        this.memcached.set(key, JSON.stringify(entry), ttl, (err: any) => {
          if (err) {
            reject(err);
            return;
          }

          const promises: Promise<void>[] = [];

          if (options?.tags) {
            for (const tag of options.tags) {
              promises.push(this.addToSet(`${this.tagPrefix}${tag}`, key, ttl));
            }
          }

          if (options?.dependencies) {
            for (const dependency of options.dependencies) {
              promises.push(this.addToSet(`${this.dependencyPrefix}${dependency}`, key, ttl));
            }
          }

          Promise.all(promises)
            .then(() => resolve())
            .catch(reject);
        });
      });
    });
  }

  async del(key: CacheKey): Promise<boolean> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);

      // First, fetch the raw entry data to get tags and dependencies for cleanup
      return new Promise<boolean>((resolve, reject) => {
        this.memcached.get(key, (getErr: any, data: any) => {
          if (getErr) {
            reject(getErr);
            return;
          }

          if (!data) {
            resolve(false);
            return;
          }

          // Parse entry to extract tags and dependencies
          let tags: string[] | undefined;
          let dependencies: string[] | undefined;

          try {
            const entry: CacheEntry = JSON.parse(data as string);
            tags = entry.tags;
            dependencies = entry.dependencies;
          } catch (error) {
            console.warn('Failed to parse entry for cleanup:', error);
          }

          // Now delete the key
          this.memcached.del(key, (delErr: any) => {
            if (delErr) {
              reject(delErr);
              return;
            }

            // Clean up tags and dependencies indexes
            const promises: Promise<void>[] = [];

            if (tags && Array.isArray(tags)) {
              for (const tag of tags) {
                promises.push(this.removeFromSet(`${this.tagPrefix}${tag}`, key));
              }
            }

            if (dependencies && Array.isArray(dependencies)) {
              for (const dependency of dependencies) {
                promises.push(this.removeFromSet(`${this.dependencyPrefix}${dependency}`, key));
              }
            }

            if (promises.length > 0) {
              Promise.all(promises)
                .then(() => resolve(true))
                .catch(() => resolve(true)); // Still resolve true even if cleanup fails
            } else {
              resolve(true);
            }
          });
        });
      });
    });
  }

  async mget(keys: CacheKey[]): Promise<Array<CacheValue | null>> {
    return this.executeWithCircuitBreaker(async () => {
      if (keys.length === 0) {
        return [];
      }

      return new Promise<Array<CacheValue | null>>((resolve, reject) => {
        this.memcached.getMulti(keys, (err: any, data: any) => {
          if (err) {
            reject(err);
            return;
          }

          const results: Array<CacheValue | null> = [];
          
          for (const key of keys) {
            const value = data[key];
            
            if (!value) {
              results.push(null);
              continue;
            }

            try {
              const entry: CacheEntry = JSON.parse(value as string);
              
              if (this.isExpired(entry.createdAt, entry.ttl)) {
                this.memcached.del(key, () => {});
                results.push(null);
              } else {
                results.push(entry.value);
              }
            } catch (error) {
              results.push(null);
            }
          }

          resolve(results);
        });
      });
    });
  }

  async mset(keyValuePairs: CacheKeyValuePair[], options?: CacheOptions): Promise<void> {
    return this.executeWithCircuitBreaker(async () => {
      const promises = keyValuePairs.map(([key, value]) => 
        this.set(key, value, options)
      );
      
      await Promise.all(promises);
    });
  }

  async clear(): Promise<void> {
    return this.executeWithCircuitBreaker(async () => {
      return new Promise<void>((resolve, reject) => {
        this.memcached.flush((err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  async exists(key: CacheKey): Promise<boolean> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      
      const value = await this.get(key);
      return value !== null;
    });
  }

  async keys(pattern?: string): Promise<CacheKey[]> {
    return this.executeWithCircuitBreaker(async () => {
      console.warn('Memcached does not support key enumeration. Returning empty array.');
      return [];
    });
  }

  async getStats(): Promise<CacheStats> {
    return this.executeWithCircuitBreaker(async () => {
      return new Promise<CacheStats>((resolve, reject) => {
        this.memcached.stats((err: any, stats: any) => {
          if (err) {
            reject(err);
            return;
          }

          let totalKeys = 0;
          let totalMemory = 0;

          for (const server of Object.keys(stats)) {
            const serverStats = stats[server];
            totalKeys += parseInt(serverStats.curr_items || '0');
            totalMemory += parseInt(serverStats.bytes || '0');
          }

          resolve({
            keys: totalKeys,
            size: totalKeys,
            memoryUsage: totalMemory,
          });
        });
      });
    });
  }

  async close(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.memcached.end();
      resolve();
    });
  }

  async invalidateByTag(tag: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      const keys = await this.getSet(`${this.tagPrefix}${tag}`);
      
      if (keys.length === 0) {
        return 0;
      }

      const promises = keys.map(key => this.del(key));
      await Promise.all(promises);
      
      await this.deleteSet(`${this.tagPrefix}${tag}`);
      
      return keys.length;
    });
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      console.warn('Memcached does not support pattern-based invalidation efficiently. Returning 0.');
      return 0;
    });
  }

  async invalidateByDependency(dependency: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      const keys = await this.getSet(`${this.dependencyPrefix}${dependency}`);
      
      if (keys.length === 0) {
        return 0;
      }

      const promises = keys.map(key => this.del(key));
      await Promise.all(promises);
      
      await this.deleteSet(`${this.dependencyPrefix}${dependency}`);
      
      return keys.length;
    });
  }

  private async addToSet(setKey: string, value: string, ttl: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.memcached.get(setKey, (err: any, data: any) => {
        if (err) {
          reject(err);
          return;
        }

        let set: Set<string>;
        
        if (data) {
          try {
            const array = JSON.parse(data as string);
            set = new Set(array);
          } catch (error) {
            set = new Set();
          }
        } else {
          set = new Set();
        }

        set.add(value);
        
        this.memcached.set(setKey, JSON.stringify(Array.from(set)), ttl, (setErr: any) => {
          if (setErr) {
            reject(setErr);
          } else {
            resolve();
          }
        });
      });
    });
  }

  private async removeFromSet(setKey: string, value: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.memcached.get(setKey, (err: any, data: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!data) {
          resolve();
          return;
        }

        try {
          const array = JSON.parse(data as string);
          const set = new Set(array);
          set.delete(value);
          
          if (set.size === 0) {
            this.memcached.del(setKey, () => resolve());
          } else {
            // Use the default index TTL instead of a hardcoded value to ensure
            // consistency with how sets are created in addToSet
            this.memcached.set(setKey, JSON.stringify(Array.from(set)), this.indexSetDefaultTTL, (setErr: any) => {
              if (setErr) {
                reject(setErr);
              } else {
                resolve();
              }
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async getSet(setKey: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      this.memcached.get(setKey, (err: any, data: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!data) {
          resolve([]);
          return;
        }

        try {
          const array = JSON.parse(data as string);
          resolve(array);
        } catch (error) {
          resolve([]);
        }
      });
    });
  }

  private async deleteSet(setKey: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.memcached.del(setKey, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}