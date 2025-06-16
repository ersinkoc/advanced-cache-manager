const { CacheManager } = require('advanced-cache-manager');

async function layeredCachingExample() {
  // Multi-layer cache: Memory → Redis → Memcached
  const cache = new CacheManager({
    stores: [
      { 
        type: 'memory', 
        max: 1000, 
        ttl: 300 // 5 minutes
      },
      { 
        type: 'redis', 
        host: 'localhost', 
        port: 6379,
        options: {
          retryDelayOnFailover: 100,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3
        }
      },
      { 
        type: 'memcached', 
        servers: ['127.0.0.1:11211'],
        options: {
          poolSize: 10,
          timeout: 5000
        }
      }
    ],
    strategy: 'layered',
    serializer: 'json',
    compression: 'gzip',
    compressionThreshold: 1024,
    metrics: {
      enabled: true,
      interval: 30000 // 30 seconds
    }
  });

  try {
    console.log('Setting data in layered cache...');
    
    // This will be stored in all three layers
    await cache.set('user:profile:123', {
      id: 123,
      name: 'Alice Johnson',
      email: 'alice@example.com',
      preferences: {
        theme: 'dark',
        notifications: true,
        language: 'en'
      },
      lastLogin: new Date().toISOString(),
      roles: ['user', 'premium']
    }, {
      ttl: 3600, // 1 hour
      tags: ['user', 'profile'],
      dependencies: ['user:123']
    });

    // Large data that will benefit from compression
    const largeData = {
      analytics: Array.from({ length: 1000 }, (_, i) => ({
        timestamp: Date.now() - i * 1000,
        value: Math.random() * 100,
        category: `category-${i % 10}`
      }))
    };

    await cache.set('analytics:daily:2023-10-15', largeData, {
      ttl: 86400, // 24 hours
      tags: ['analytics', 'daily'],
      compress: true
    });

    console.log('Data stored successfully!');

    // First access - will likely come from memory (L1)
    console.log('\nFirst access (should be fast - from memory):');
    const start1 = Date.now();
    const profile1 = await cache.get('user:profile:123');
    console.log(`Retrieved in ${Date.now() - start1}ms`);
    console.log('Profile:', profile1.name);

    // Simulate cache promotion
    // Remove from memory layer to demonstrate promotion
    const stores = cache.getStores();
    if (stores[0] && stores[0].constructor.name === 'MemoryStore') {
      await stores[0].del('user:profile:123');
      console.log('\nCleared from memory layer for demonstration');
    }

    // Second access - will come from Redis (L2) and promote to memory
    console.log('\nSecond access (from Redis, promotes to memory):');
    const start2 = Date.now();
    const profile2 = await cache.get('user:profile:123');
    console.log(`Retrieved in ${Date.now() - start2}ms`);
    console.log('Profile retrieved from lower layer');

    // Third access - should be fast again from memory
    console.log('\nThird access (should be fast again - from memory):');
    const start3 = Date.now();
    const profile3 = await cache.get('user:profile:123');
    console.log(`Retrieved in ${Date.now() - start3}ms`);

    // Demonstrate cache invalidation across layers
    console.log('\nInvalidating by tag across all layers...');
    const invalidated = await cache.invalidateByTag('profile');
    console.log(`Invalidated ${invalidated} items`);

    // Verify invalidation
    const profileAfterInvalidation = await cache.get('user:profile:123');
    console.log('Profile after invalidation:', profileAfterInvalidation);

    // Show metrics
    console.log('\nCache Metrics:');
    const metrics = await cache.getMetrics();
    console.log(`Hits: ${metrics.hits}`);
    console.log(`Misses: ${metrics.misses}`);
    console.log(`Hit Rate: ${metrics.hitRate}%`);
    console.log(`Average Response Time: ${metrics.avgResponseTime}ms`);
    console.log(`Total Operations: ${metrics.operations}`);

    // Show statistics from each layer
    console.log('\nLayer Statistics:');
    for (let i = 0; i < stores.length; i++) {
      try {
        const stats = await stores[i].getStats();
        console.log(`Layer ${i + 1} (${stores[i].constructor.name}):`, {
          keys: stats.keys,
          memoryUsage: `${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`
        });
      } catch (error) {
        console.log(`Layer ${i + 1} stats unavailable:`, error.message);
      }
    }

  } catch (error) {
    console.error('Error in layered caching example:', error);
  } finally {
    await cache.close();
    console.log('\nCache closed gracefully');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

layeredCachingExample();