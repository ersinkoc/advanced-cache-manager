// Mock msgpack5 before any imports
jest.mock('msgpack5', () => {
  return jest.fn(() => ({
    encode: jest.fn((value) => Buffer.from(JSON.stringify(value))),
    decode: jest.fn((buffer) => JSON.parse(buffer.toString())),
  }));
});

import { CacheManager } from '../src/CacheManager';
import { CacheManagerConfig } from '../src/types';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    const config: CacheManagerConfig = {
      stores: [
        { type: 'memory', max: 100, ttl: 300 }
      ],
      strategy: 'layered',
      serializer: 'json',
      compression: 'gzip',
      compressionThreshold: 1024,
    };

    cacheManager = new CacheManager(config);
  });

  afterEach(async () => {
    await cacheManager.close();
  });

  describe('Basic Operations', () => {
    test('should set and get a value', async () => {
      await cacheManager.set('test-key', 'test-value');
      const result = await cacheManager.get('test-key');
      expect(result).toBe('test-value');
    });

    test('should return null for non-existent key', async () => {
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });

    test('should delete a key', async () => {
      await cacheManager.set('test-key', 'test-value');
      const deleted = await cacheManager.del('test-key');
      expect(deleted).toBe(true);
      
      const result = await cacheManager.get('test-key');
      expect(result).toBeNull();
    });

    test('should check if key exists', async () => {
      await cacheManager.set('test-key', 'test-value');
      const exists = await cacheManager.exists('test-key');
      expect(exists).toBe(true);

      await cacheManager.del('test-key');
      const notExists = await cacheManager.exists('test-key');
      expect(notExists).toBe(false);
    });
  });

  describe('Multiple Operations', () => {
    test('should handle mget operation', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      
      const results = await cacheManager.mget(['key1', 'key2', 'key3']);
      expect(results).toEqual(['value1', 'value2', null]);
    });

    test('should handle mset operation', async () => {
      await cacheManager.mset([
        ['key1', 'value1'],
        ['key2', 'value2']
      ]);
      
      const result1 = await cacheManager.get('key1');
      const result2 = await cacheManager.get('key2');
      
      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
    });
  });

  describe('Complex Data Types', () => {
    test('should handle objects', async () => {
      const testObject = { name: 'John', age: 30, active: true };
      await cacheManager.set('user', testObject);
      
      const result = await cacheManager.get('user');
      expect(result).toEqual(testObject);
    });

    test('should handle arrays', async () => {
      const testArray = [1, 2, 3, 'four', { five: 5 }];
      await cacheManager.set('array', testArray);
      
      const result = await cacheManager.get('array');
      expect(result).toEqual(testArray);
    });

    test('should handle nested objects', async () => {
      const nestedObject = {
        user: {
          profile: {
            name: 'Jane',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        }
      };
      
      await cacheManager.set('nested', nestedObject);
      const result = await cacheManager.get('nested');
      expect(result).toEqual(nestedObject);
    });
  });

  describe('Cache Options', () => {
    test('should handle TTL options', async () => {
      await cacheManager.set('ttl-key', 'ttl-value', { ttl: 1 });
      
      const immediate = await cacheManager.get('ttl-key');
      expect(immediate).toBe('ttl-value');
      
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const expired = await cacheManager.get('ttl-key');
      expect(expired).toBeNull();
    });

    test('should handle tags', async () => {
      await cacheManager.set('user:1', 'user1', { tags: ['user', 'active'] });
      await cacheManager.set('user:2', 'user2', { tags: ['user', 'inactive'] });
      
      const result1 = await cacheManager.get('user:1');
      const result2 = await cacheManager.get('user:2');
      
      expect(result1).toBe('user1');
      expect(result2).toBe('user2');
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate by tag', async () => {
      await cacheManager.set('user:1', 'user1', { tags: ['user'] });
      await cacheManager.set('user:2', 'user2', { tags: ['user'] });
      await cacheManager.set('post:1', 'post1', { tags: ['post'] });
      
      const invalidated = await cacheManager.invalidateByTag('user');
      expect(invalidated).toBeGreaterThan(0);
      
      const user1 = await cacheManager.get('user:1');
      const user2 = await cacheManager.get('user:2');
      const post1 = await cacheManager.get('post:1');
      
      expect(user1).toBeNull();
      expect(user2).toBeNull();
      expect(post1).toBe('post1');
    });

    test('should invalidate by pattern', async () => {
      await cacheManager.set('user:1', 'user1');
      await cacheManager.set('user:2', 'user2');
      await cacheManager.set('post:1', 'post1');
      
      const invalidated = await cacheManager.invalidateByPattern('user:*');
      expect(invalidated).toBeGreaterThan(0);
      
      const user1 = await cacheManager.get('user:1');
      const user2 = await cacheManager.get('user:2');
      const post1 = await cacheManager.get('post:1');
      
      expect(user1).toBeNull();
      expect(user2).toBeNull();
      expect(post1).toBe('post1');
    });
  });

  describe('Metrics', () => {
    test('should collect metrics', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.get('key1'); // hit
      await cacheManager.get('key2'); // miss
      
      const metrics = await cacheManager.getMetrics();
      
      expect(metrics.hits).toBeGreaterThan(0);
      expect(metrics.misses).toBeGreaterThan(0);
      expect(metrics.operations).toBeGreaterThan(0);
      expect(metrics.hitRate).toBeGreaterThan(0);
    });

    test('should reset metrics', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.get('key1');
      
      cacheManager.resetMetrics();
      
      const metrics = await cacheManager.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.operations).toBe(0);
    });
  });

  describe('Warmup', () => {
    test('should warmup cache', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      
      await cacheManager.warmup(['key1', 'key2', 'key3']);
      
      const metrics = await cacheManager.getMetrics();
      expect(metrics.operations).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid keys', async () => {
      // Set should throw validation error
      await expect(cacheManager.set('', 'value')).rejects.toThrow();
      // Get with invalid key returns null due to LayeredStrategy failover behavior
      const result = await cacheManager.get('');
      expect(result).toBeNull();
    });

    test('should handle undefined values', async () => {
      await expect(cacheManager.set('key', undefined as any)).rejects.toThrow();
    });
  });

  describe('Clear Operation', () => {
    test('should clear all cache entries', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      
      await cacheManager.clear();
      
      const result1 = await cacheManager.get('key1');
      const result2 = await cacheManager.get('key2');
      
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });
});