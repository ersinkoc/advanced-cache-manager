import Redis from 'ioredis';
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

export class RedisStore extends BaseStore {
  private redis: Redis;
  private tagPrefix = 'tag:';
  private dependencyPrefix = 'dep:';

  constructor(config: StoreConfig) {
    super(config);
    
    const redisOptions = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      ...config.options,
    };

    this.redis = new Redis(redisOptions);
    
    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  async get<T = any>(key: CacheKey): Promise<T | null> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      
      const data = await this.redis.get(key);
      if (!data) {
        return null;
      }

      try {
        const entry: CacheEntry = JSON.parse(data);
        
        if (this.isExpired(entry.createdAt, entry.ttl)) {
          await this.redis.del(key);
          return null;
        }

        entry.lastAccessed = Date.now();
        await this.redis.set(key, JSON.stringify(entry), 'EX', entry.ttl || 3600);
        
        return entry.value as T;
      } catch (error) {
        this.handleError(error, 'get');
      }
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

      const pipeline = this.redis.pipeline();
      const ttl = options?.ttl || 3600;
      
      pipeline.set(key, JSON.stringify(entry), 'EX', ttl);

      if (options?.tags) {
        for (const tag of options.tags) {
          pipeline.sadd(`${this.tagPrefix}${tag}`, key);
          pipeline.expire(`${this.tagPrefix}${tag}`, ttl);
        }
      }

      if (options?.dependencies) {
        for (const dependency of options.dependencies) {
          pipeline.sadd(`${this.dependencyPrefix}${dependency}`, key);
          pipeline.expire(`${this.dependencyPrefix}${dependency}`, ttl);
        }
      }

      await pipeline.exec();
    });
  }

  async del(key: CacheKey): Promise<boolean> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      
      const entry = await this.get(key);
      if (!entry) {
        return false;
      }

      const pipeline = this.redis.pipeline();
      pipeline.del(key);

      const data = await this.redis.get(key);
      if (data) {
        try {
          const parsedEntry: CacheEntry = JSON.parse(data);
          
          if (parsedEntry.tags) {
            for (const tag of parsedEntry.tags) {
              pipeline.srem(`${this.tagPrefix}${tag}`, key);
            }
          }

          if (parsedEntry.dependencies) {
            for (const dependency of parsedEntry.dependencies) {
              pipeline.srem(`${this.dependencyPrefix}${dependency}`, key);
            }
          }
        } catch (error) {
          console.warn('Failed to parse entry for cleanup:', error);
        }
      }

      const results = await pipeline.exec();
      return results?.[0]?.[1] === 1;
    });
  }

  async mget(keys: CacheKey[]): Promise<Array<CacheValue | null>> {
    return this.executeWithCircuitBreaker(async () => {
      if (keys.length === 0) {
        return [];
      }

      const results = await this.redis.mget(...keys);
      const values: Array<CacheValue | null> = [];

      for (let i = 0; i < results.length; i++) {
        const data = results[i];
        if (!data) {
          values.push(null);
          continue;
        }

        try {
          const entry: CacheEntry = JSON.parse(data);
          
          if (this.isExpired(entry.createdAt, entry.ttl)) {
            await this.redis.del(keys[i]);
            values.push(null);
          } else {
            values.push(entry.value);
          }
        } catch (error) {
          values.push(null);
        }
      }

      return values;
    });
  }

  async mset(keyValuePairs: CacheKeyValuePair[], options?: CacheOptions): Promise<void> {
    return this.executeWithCircuitBreaker(async () => {
      if (keyValuePairs.length === 0) {
        return;
      }

      const pipeline = this.redis.pipeline();
      const ttl = options?.ttl || 3600;

      for (const [key, value] of keyValuePairs) {
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

        pipeline.set(key, JSON.stringify(entry), 'EX', ttl);

        if (options?.tags) {
          for (const tag of options.tags) {
            pipeline.sadd(`${this.tagPrefix}${tag}`, key);
            pipeline.expire(`${this.tagPrefix}${tag}`, ttl);
          }
        }

        if (options?.dependencies) {
          for (const dependency of options.dependencies) {
            pipeline.sadd(`${this.dependencyPrefix}${dependency}`, key);
            pipeline.expire(`${this.dependencyPrefix}${dependency}`, ttl);
          }
        }
      }

      await pipeline.exec();
    });
  }

  async clear(): Promise<void> {
    return this.executeWithCircuitBreaker(async () => {
      await this.redis.flushdb();
    });
  }

  async exists(key: CacheKey): Promise<boolean> {
    return this.executeWithCircuitBreaker(async () => {
      this.validateKey(key);
      const result = await this.redis.exists(key);
      return result === 1;
    });
  }

  async keys(pattern?: string): Promise<CacheKey[]> {
    return this.executeWithCircuitBreaker(async () => {
      const searchPattern = pattern || '*';
      const keys = await this.redis.keys(searchPattern);
      
      return keys.filter(key => 
        !key.startsWith(this.tagPrefix) && 
        !key.startsWith(this.dependencyPrefix)
      );
    });
  }

  async getStats(): Promise<CacheStats> {
    return this.executeWithCircuitBreaker(async () => {
      const info = await this.redis.info('memory');
      const dbsize = await this.redis.dbsize();
      
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;

      return {
        keys: dbsize,
        size: dbsize,
        memoryUsage,
      };
    });
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  async invalidateByTag(tag: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      const tagKey = `${this.tagPrefix}${tag}`;
      const keys = await this.redis.smembers(tagKey);
      
      if (keys.length === 0) {
        return 0;
      }

      const pipeline = this.redis.pipeline();
      
      for (const key of keys) {
        pipeline.del(key);
      }
      
      pipeline.del(tagKey);
      
      const results = await pipeline.exec();
      return results ? results.length - 1 : 0;
    });
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      const keys = await this.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const pipeline = this.redis.pipeline();
      
      for (const key of keys) {
        pipeline.del(key);
      }
      
      const results = await pipeline.exec();
      return results ? results.length : 0;
    });
  }

  async invalidateByDependency(dependency: string): Promise<number> {
    return this.executeWithCircuitBreaker(async () => {
      const dependencyKey = `${this.dependencyPrefix}${dependency}`;
      const keys = await this.redis.smembers(dependencyKey);
      
      if (keys.length === 0) {
        return 0;
      }

      const pipeline = this.redis.pipeline();
      
      for (const key of keys) {
        pipeline.del(key);
      }
      
      pipeline.del(dependencyKey);
      
      const results = await pipeline.exec();
      return results ? results.length - 1 : 0;
    });
  }
}