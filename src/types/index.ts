export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  dependencies?: string[];
  compress?: boolean;
  serialize?: boolean;
  compressed?: boolean;
}

export interface CacheEntry<T = any> {
  value: T;
  ttl?: number;
  createdAt: number;
  lastAccessed: number;
  tags?: string[];
  dependencies?: string[];
  compressed?: boolean;
  serialized?: boolean;
}

export interface StoreConfig {
  type: 'memory' | 'redis' | 'memcached';
  max?: number;
  ttl?: number;
  host?: string;
  port?: number;
  servers?: string[];
  options?: Record<string, any>;
}

export interface CacheManagerConfig {
  stores: StoreConfig[];
  strategy?: 'layered' | 'failover' | 'distributed';
  serializer?: 'json' | 'msgpack';
  compression?: 'gzip' | 'lz4' | 'none';
  compressionThreshold?: number;
  circuitBreaker?: {
    enabled: boolean;
    errorThreshold: number;
    timeout: number;
  };
  metrics?: {
    enabled: boolean;
    interval: number;
  };
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  avgResponseTime: number;
  memoryUsage: number;
  operations: number;
  errors: number;
}

export interface CacheStats {
  keys: number;
  size: number;
  memoryUsage: number;
}

export interface InvalidationOptions {
  cascade?: boolean;
  async?: boolean;
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailTime?: number;
  nextAttemptTime?: number;
}

export type CacheValue = string | number | boolean | object | Buffer | null;

export type CacheKey = string;

export type CacheKeyValuePair = [CacheKey, CacheValue];

export type SerializerType = 'json' | 'msgpack';

export type CompressionType = 'gzip' | 'lz4' | 'none';

export type CacheStrategy = 'layered' | 'failover' | 'distributed';

export interface ISerializer {
  serialize(value: any): Buffer | string;
  deserialize<T = any>(data: Buffer | string): T;
  canSerialize(value: any): boolean;
  getContentType(): string;
  getName(): string;
}

export interface ICompressor {
  compress(data: Buffer | string): Buffer;
  decompress(data: Buffer): Buffer | string;
  getCompressionRatio(data: Buffer | string): number;
  getName(): string;
}

export interface IStore {
  get<T = any>(key: CacheKey): Promise<T | null>;
  set(key: CacheKey, value: CacheValue, options?: CacheOptions): Promise<void>;
  del(key: CacheKey): Promise<boolean>;
  mget(keys: CacheKey[]): Promise<Array<CacheValue | null>>;
  mset(keyValuePairs: CacheKeyValuePair[], options?: CacheOptions): Promise<void>;
  clear(): Promise<void>;
  exists(key: CacheKey): Promise<boolean>;
  keys(pattern?: string): Promise<CacheKey[]>;
  getStats(): Promise<CacheStats>;
  close(): Promise<void>;
}

export interface IStrategy {
  get<T = any>(key: CacheKey): Promise<T | null>;
  set(key: CacheKey, value: CacheValue, options?: CacheOptions): Promise<void>;
  del(key: CacheKey): Promise<boolean>;
  mget(keys: CacheKey[]): Promise<Array<CacheValue | null>>;
  mset(keyValuePairs: CacheKeyValuePair[], options?: CacheOptions): Promise<void>;
  clear(): Promise<void>;
}

export interface IInvalidator {
  invalidateByTag(tag: string, options?: InvalidationOptions): Promise<number>;
  invalidateByPattern(pattern: string, options?: InvalidationOptions): Promise<number>;
  invalidateByDependency(dependency: string, options?: InvalidationOptions): Promise<number>;
}

export interface IMetricsCollector {
  recordHit(): void;
  recordMiss(): void;
  recordOperation(duration: number): void;
  recordError(): void;
  getMetrics(): CacheMetrics;
  reset(): void;
}

export interface ICacheManager extends IStore, IInvalidator {
  getMetrics(): Promise<CacheMetrics>;
  warmup(keys: CacheKey[]): Promise<void>;
  optimizeTTL(key: CacheKey): Promise<number>;
}

export class CacheError extends Error {
  constructor(message: string, public code?: string, public store?: string) {
    super(message);
    this.name = 'CacheError';
  }
}

export class SerializationError extends CacheError {
  constructor(message: string) {
    super(message, 'SERIALIZATION_ERROR');
    this.name = 'SerializationError';
  }
}

export class CompressionError extends CacheError {
  constructor(message: string) {
    super(message, 'COMPRESSION_ERROR');
    this.name = 'CompressionError';
  }
}

export class StoreError extends CacheError {
  constructor(message: string, store: string) {
    super(message, 'STORE_ERROR', store);
    this.name = 'StoreError';
  }
}

export class CircuitBreakerError extends CacheError {
  constructor(message: string) {
    super(message, 'CIRCUIT_BREAKER_OPEN');
    this.name = 'CircuitBreakerError';
  }
}