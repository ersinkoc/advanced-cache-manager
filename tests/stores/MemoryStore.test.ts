import { MemoryStore } from '../../src/stores/MemoryStore';
import { StoreConfig } from '../../src/types';

describe('MemoryStore', () => {
  let memoryStore: MemoryStore;

  beforeEach(() => {
    const config: StoreConfig = {
      type: 'memory',
      max: 100,
      ttl: 300
    };
    memoryStore = new MemoryStore(config);
  });

  afterEach(async () => {
    await memoryStore.close();
  });

  test('should store and retrieve values', async () => {
    await memoryStore.set('test-key', 'test-value');
    const result = await memoryStore.get('test-key');
    expect(result).toBe('test-value');
  });

  test('should handle LRU eviction', async () => {
    const config: StoreConfig = {
      type: 'memory',
      max: 2,
      ttl: 300
    };
    const smallStore = new MemoryStore(config);

    await smallStore.set('key1', 'value1');
    await smallStore.set('key2', 'value2');
    await smallStore.set('key3', 'value3'); // Should evict key1

    const result1 = await smallStore.get('key1');
    const result2 = await smallStore.get('key2');
    const result3 = await smallStore.get('key3');

    expect(result1).toBeNull();
    expect(result2).toBe('value2');
    expect(result3).toBe('value3');

    await smallStore.close();
  });

  test('should handle TTL expiration', async () => {
    await memoryStore.set('ttl-key', 'ttl-value', { ttl: 1 });
    
    const immediate = await memoryStore.get('ttl-key');
    expect(immediate).toBe('ttl-value');
    
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const expired = await memoryStore.get('ttl-key');
    expect(expired).toBeNull();
  });

  test('should invalidate by tag', async () => {
    await memoryStore.set('user:1', 'user1', { tags: ['user', 'active'] });
    await memoryStore.set('user:2', 'user2', { tags: ['user'] });
    await memoryStore.set('post:1', 'post1', { tags: ['post'] });

    const invalidated = await memoryStore.invalidateByTag('user');
    expect(invalidated).toBe(2);

    const user1 = await memoryStore.get('user:1');
    const user2 = await memoryStore.get('user:2');
    const post1 = await memoryStore.get('post:1');

    expect(user1).toBeNull();
    expect(user2).toBeNull();
    expect(post1).toBe('post1');
  });

  test('should invalidate by pattern', async () => {
    await memoryStore.set('user:1', 'user1');
    await memoryStore.set('user:2', 'user2');
    await memoryStore.set('post:1', 'post1');

    const invalidated = await memoryStore.invalidateByPattern('user:*');
    expect(invalidated).toBe(2);

    const user1 = await memoryStore.get('user:1');
    const user2 = await memoryStore.get('user:2');
    const post1 = await memoryStore.get('post:1');

    expect(user1).toBeNull();
    expect(user2).toBeNull();
    expect(post1).toBe('post1');
  });

  test('should handle mget and mset', async () => {
    await memoryStore.mset([
      ['key1', 'value1'],
      ['key2', 'value2']
    ]);

    const results = await memoryStore.mget(['key1', 'key2', 'key3']);
    expect(results).toEqual(['value1', 'value2', null]);
  });

  test('should provide stats', async () => {
    await memoryStore.set('key1', 'value1');
    await memoryStore.set('key2', 'value2');

    const stats = await memoryStore.getStats();
    expect(stats.keys).toBe(2);
    expect(stats.size).toBe(2);
    expect(stats.memoryUsage).toBeGreaterThan(0);
  });

  test('should clear all entries', async () => {
    await memoryStore.set('key1', 'value1');
    await memoryStore.set('key2', 'value2');

    await memoryStore.clear();

    const result1 = await memoryStore.get('key1');
    const result2 = await memoryStore.get('key2');

    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });
});