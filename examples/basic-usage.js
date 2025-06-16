const { CacheManager } = require('advanced-cache-manager');

async function basicUsageExample() {
  // Initialize cache manager with memory store
  const cache = new CacheManager({
    stores: [
      { type: 'memory', max: 1000, ttl: 3600 }
    ],
    strategy: 'layered'
  });

  try {
    // Basic set and get operations
    await cache.set('user:123', { 
      name: 'John Doe', 
      email: 'john@example.com',
      role: 'admin'
    });

    const user = await cache.get('user:123');
    console.log('Retrieved user:', user);

    // Set with options
    await cache.set('session:abc', 'session-data', {
      ttl: 1800, // 30 minutes
      tags: ['session', 'user:123']
    });

    // Multiple operations
    await cache.mset([
      ['product:1', { name: 'Laptop', price: 999 }],
      ['product:2', { name: 'Mouse', price: 29 }]
    ]);

    const products = await cache.mget(['product:1', 'product:2']);
    console.log('Products:', products);

    // Check existence
    const exists = await cache.exists('user:123');
    console.log('User exists:', exists);

    // Get cache statistics
    const stats = await cache.getStats();
    console.log('Cache stats:', stats);

    // Get metrics
    const metrics = await cache.getMetrics();
    console.log('Cache metrics:', metrics);

    // Cache invalidation
    await cache.invalidateByTag('session');
    
    // Clear specific key
    await cache.del('user:123');

    // Clear all cache
    // await cache.clear();

  } catch (error) {
    console.error('Cache error:', error);
  } finally {
    await cache.close();
  }
}

basicUsageExample();