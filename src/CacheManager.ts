import {
  ICacheManager,
  CacheManagerConfig,
  CacheKey,
  CacheValue,
  CacheOptions,
  CacheKeyValuePair,
  CacheMetrics,
  CacheStats,
  InvalidationOptions,
  IStore,
  IStrategy,
  ISerializer,
  ICompressor,
  StoreConfig,
} from './types';

import { MemoryStore } from './stores/MemoryStore';
import { RedisStore } from './stores/RedisStore';
import { MemcachedStore } from './stores/MemcachedStore';

import { LayeredStrategy } from './strategies/LayeredStrategy';
import { TagInvalidator } from './invalidation/TagInvalidator';
import { PatternInvalidator } from './invalidation/PatternInvalidator';
import { DependencyInvalidator } from './invalidation/DependencyInvalidator';

import { MetricsCollector } from './metrics/MetricsCollector';
import { MetricsReporter } from './metrics/MetricsReporter';
import { SerializerFactory } from './serializers/SerializerFactory';
import { CompressorFactory } from './compressors/CompressorFactory';

export class CacheManager implements ICacheManager {
  private stores: IStore[] = [];
  private strategy!: IStrategy;
  private serializer!: ISerializer;
  private compressor!: ICompressor;
  private compressionThreshold!: number;
  private metricsCollector!: MetricsCollector;
  private metricsReporter?: MetricsReporter;
  private tagInvalidator!: TagInvalidator;
  private patternInvalidator!: PatternInvalidator;
  private dependencyInvalidator!: DependencyInvalidator;

  constructor(config: CacheManagerConfig) {
    this.initializeStores(config.stores);
    this.initializeStrategy(config);
    this.initializeSerialization(config);
    this.initializeCompression(config);
    this.initializeMetrics(config);
    this.initializeInvalidators();
  }

  async get<T = any>(key: CacheKey): Promise<T | null> {
    return this.metricsCollector.withMetrics(async () => {
      const result = await this.strategy.get<T>(key);
      
      if (result !== null) {
        this.metricsCollector.recordHit();
        return result;
      } else {
        this.metricsCollector.recordMiss();
        return null;
      }
    });
  }

  async set(key: CacheKey, value: CacheValue, options?: CacheOptions): Promise<void> {
    return this.metricsCollector.withMetrics(async () => {
      // For now, pass the value directly to the strategy
      // The stores will handle their own serialization as needed
      await this.strategy.set(key, value, options);
    });
  }

  async del(key: CacheKey): Promise<boolean> {
    return this.metricsCollector.withMetrics(async () => {
      return this.strategy.del(key);
    });
  }

  async mget(keys: CacheKey[]): Promise<Array<CacheValue | null>> {
    return this.metricsCollector.withMetrics(async () => {
      const results = await this.strategy.mget(keys);
      
      let hits = 0;
      let misses = 0;
      
      for (const result of results) {
        if (result !== null) {
          hits++;
        } else {
          misses++;
        }
      }
      
      for (let i = 0; i < hits; i++) {
        this.metricsCollector.recordHit();
      }
      
      for (let i = 0; i < misses; i++) {
        this.metricsCollector.recordMiss();
      }
      
      return results;
    });
  }

  async mset(keyValuePairs: CacheKeyValuePair[], options?: CacheOptions): Promise<void> {
    return this.metricsCollector.withMetrics(async () => {
      // For now, pass the pairs directly to the strategy
      await this.strategy.mset(keyValuePairs, options);
    });
  }

  async clear(): Promise<void> {
    return this.metricsCollector.withMetrics(async () => {
      await this.strategy.clear();
    });
  }

  async exists(key: CacheKey): Promise<boolean> {
    return this.metricsCollector.withMetrics(async () => {
      for (const store of this.stores) {
        try {
          const exists = await store.exists(key);
          if (exists) {
            return true;
          }
        } catch (error) {
          console.error(`Error checking existence in store ${store.constructor.name}:`, error);
        }
      }
      return false;
    });
  }

  async keys(pattern?: string): Promise<CacheKey[]> {
    return this.metricsCollector.withMetrics(async () => {
      const allKeys: Set<CacheKey> = new Set();
      
      for (const store of this.stores) {
        try {
          const keys = await store.keys(pattern);
          keys.forEach(key => allKeys.add(key));
        } catch (error) {
          console.error(`Error getting keys from store ${store.constructor.name}:`, error);
        }
      }
      
      return Array.from(allKeys);
    });
  }

  async getStats(): Promise<CacheStats> {
    return this.metricsCollector.withMetrics(async () => {
      let totalKeys = 0;
      let totalSize = 0;
      let totalMemoryUsage = 0;
      
      for (const store of this.stores) {
        try {
          const stats = await store.getStats();
          totalKeys += stats.keys;
          totalSize += stats.size;
          totalMemoryUsage += stats.memoryUsage;
        } catch (error) {
          console.error(`Error getting stats from store ${store.constructor.name}:`, error);
        }
      }
      
      return {
        keys: totalKeys,
        size: totalSize,
        memoryUsage: totalMemoryUsage,
      };
    });
  }

  async close(): Promise<void> {
    if (this.metricsReporter) {
      this.metricsReporter.stop();
    }
    
    const promises = this.stores.map(store => store.close());
    await Promise.all(promises);
  }

  async invalidateByTag(tag: string, options?: InvalidationOptions): Promise<number> {
    return this.metricsCollector.withMetrics(async () => {
      return this.tagInvalidator.invalidateByTag(tag, options);
    });
  }

  async invalidateByPattern(pattern: string, options?: InvalidationOptions): Promise<number> {
    return this.metricsCollector.withMetrics(async () => {
      return this.patternInvalidator.invalidateByPattern(pattern, options);
    });
  }

  async invalidateByDependency(dependency: string, options?: InvalidationOptions): Promise<number> {
    return this.metricsCollector.withMetrics(async () => {
      return this.dependencyInvalidator.invalidateByDependency(dependency, options);
    });
  }

  async getMetrics(): Promise<CacheMetrics> {
    return this.metricsCollector.getMetrics();
  }

  async warmup(keys: CacheKey[]): Promise<void> {
    return this.metricsCollector.withMetrics(async () => {
      const promises = keys.map(key => this.get(key));
      await Promise.all(promises);
    });
  }

  async optimizeTTL(key: CacheKey): Promise<number> {
    return this.metricsCollector.withMetrics(async () => {
      const baseValue = await this.get(key);
      if (!baseValue) {
        return 0;
      }

      const accessCount = this.metricsCollector.getTotalOperations();
      const hitRate = this.metricsCollector.getHitRate();
      
      let optimalTTL = 3600; // Default 1 hour
      
      if (hitRate > 80) {
        optimalTTL = 7200; // 2 hours for high hit rate
      } else if (hitRate < 50) {
        optimalTTL = 1800; // 30 minutes for low hit rate
      }
      
      if (accessCount > 1000) {
        optimalTTL *= 1.5; // Increase TTL for frequently accessed items
      }
      
      return Math.round(optimalTTL);
    });
  }

  getStores(): IStore[] {
    return [...this.stores];
  }

  getSerializer(): ISerializer {
    return this.serializer;
  }

  getCompressor(): ICompressor {
    return this.compressor;
  }

  resetMetrics(): void {
    this.metricsCollector.reset();
  }

  private initializeStores(storeConfigs: StoreConfig[]): void {
    for (const config of storeConfigs) {
      let store: IStore;
      
      switch (config.type) {
        case 'memory':
          store = new MemoryStore(config);
          break;
        case 'redis':
          store = new RedisStore(config);
          break;
        case 'memcached':
          store = new MemcachedStore(config);
          break;
        default:
          throw new Error(`Unsupported store type: ${config.type}`);
      }
      
      this.stores.push(store);
    }
    
    if (this.stores.length === 0) {
      throw new Error('At least one store must be configured');
    }
  }

  private initializeStrategy(config: CacheManagerConfig): void {
    switch (config.strategy || 'layered') {
      case 'layered':
        this.strategy = new LayeredStrategy(this.stores);
        break;
      default:
        throw new Error(`Unsupported strategy: ${config.strategy}`);
    }
  }

  private initializeSerialization(config: CacheManagerConfig): void {
    this.serializer = SerializerFactory.getSerializer(config.serializer || 'json');
  }

  private initializeCompression(config: CacheManagerConfig): void {
    this.compressor = CompressorFactory.getCompressor(config.compression || 'gzip');
    this.compressionThreshold = config.compressionThreshold || 1024;
  }

  private initializeMetrics(config: CacheManagerConfig): void {
    this.metricsCollector = new MetricsCollector();
    
    if (config.metrics?.enabled) {
      this.metricsReporter = new MetricsReporter(this.metricsCollector, {
        interval: config.metrics.interval || 60000,
        console: true,
      });
      
      this.metricsReporter.start();
    }
  }

  private initializeInvalidators(): void {
    this.tagInvalidator = new TagInvalidator(this.stores);
    this.patternInvalidator = new PatternInvalidator(this.stores);
    this.dependencyInvalidator = new DependencyInvalidator(this.stores);
  }

  private shouldCompress(value: any): boolean {
    const size = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(String(value), 'utf8');
    return size >= this.compressionThreshold;
  }
}