import {
  IStore,
  CacheKey,
  CacheValue,
  CacheOptions,
  CacheKeyValuePair,
  CacheStats,
  CircuitBreakerState,
  CircuitBreakerError,
  StoreError,
} from '../types';

export abstract class BaseStore implements IStore {
  protected circuitBreaker?: CircuitBreakerState;
  protected circuitBreakerConfig?: {
    enabled: boolean;
    errorThreshold: number;
    timeout: number;
  };

  constructor(config?: any) {
    if (config?.circuitBreaker?.enabled) {
      this.circuitBreakerConfig = config.circuitBreaker;
      this.circuitBreaker = {
        isOpen: false,
        failures: 0,
      };
    }
  }

  protected async executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.circuitBreaker || !this.circuitBreakerConfig) {
      return operation();
    }

    if (this.circuitBreaker.isOpen) {
      const now = Date.now();
      if (this.circuitBreaker.nextAttemptTime && now < this.circuitBreaker.nextAttemptTime) {
        throw new CircuitBreakerError('Circuit breaker is open');
      }
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
    }

    try {
      const result = await operation();
      this.circuitBreaker.failures = 0;
      return result;
    } catch (error) {
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailTime = Date.now();

      if (this.circuitBreaker.failures >= this.circuitBreakerConfig.errorThreshold) {
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.nextAttemptTime = Date.now() + this.circuitBreakerConfig.timeout;
      }

      throw error;
    }
  }

  protected handleError(error: any, operation: string): never {
    const message = error.message || 'Unknown error';
    throw new StoreError(`${operation} failed: ${message}`, this.constructor.name);
  }

  protected isExpired(createdAt: number, ttl?: number): boolean {
    if (!ttl) return false;
    return Date.now() - createdAt > ttl * 1000;
  }

  protected validateKey(key: CacheKey): void {
    if (!key || typeof key !== 'string') {
      throw new StoreError('Cache key must be a non-empty string', this.constructor.name);
    }
  }

  protected validateValue(value: CacheValue): void {
    if (value === undefined) {
      throw new StoreError('Cache value cannot be undefined', this.constructor.name);
    }
  }

  abstract get<T = any>(key: CacheKey): Promise<T | null>;
  abstract set(key: CacheKey, value: CacheValue, options?: CacheOptions): Promise<void>;
  abstract del(key: CacheKey): Promise<boolean>;
  abstract mget(keys: CacheKey[]): Promise<Array<CacheValue | null>>;
  abstract mset(keyValuePairs: CacheKeyValuePair[], options?: CacheOptions): Promise<void>;
  abstract clear(): Promise<void>;
  abstract exists(key: CacheKey): Promise<boolean>;
  abstract keys(pattern?: string): Promise<CacheKey[]>;
  abstract getStats(): Promise<CacheStats>;
  abstract close(): Promise<void>;
}