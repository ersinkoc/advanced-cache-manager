# Getting Started with Advanced Cache Manager

## Quick Installation

```bash
npm install advanced-cache-manager
```

## Basic Usage

```javascript
const { CacheManager } = require('advanced-cache-manager');

// Simple memory cache
const cache = new CacheManager({
  stores: [
    { type: 'memory', max: 1000, ttl: 3600 }
  ]
});

// Basic operations
await cache.set('user:123', { name: 'John', email: 'john@example.com' });
const user = await cache.get('user:123');
await cache.del('user:123');

await cache.close();
```

## Multi-Layer Cache Setup

```javascript
// Production-ready layered cache
const cache = new CacheManager({
  stores: [
    { type: 'memory', max: 1000, ttl: 300 },      // L1: Fast memory
    { type: 'redis', host: 'localhost', port: 6379 }  // L2: Persistent Redis
  ],
  strategy: 'layered',
  metrics: { enabled: true, interval: 60000 }
});
```

## Key Features

### ✨ **Multi-Backend Support**
- Memory (LRU), Redis, Memcached
- Automatic layer promotion for better performance

### 🎯 **Smart Invalidation**
```javascript
// Tag-based invalidation
await cache.set('user:123', userData, { tags: ['user', 'profile'] });
await cache.invalidateByTag('user'); // Clears all user-related cache

// Pattern-based invalidation
await cache.invalidateByPattern('user:*'); // Wildcards supported
```

### 📊 **Built-in Metrics**
```javascript
const metrics = await cache.getMetrics();
console.log(`Hit Rate: ${metrics.hitRate}%`);
console.log(`Avg Response: ${metrics.avgResponseTime}ms`);
```

### 🔧 **Advanced Options**
```javascript
await cache.set('large-data', bigObject, {
  ttl: 3600,                    // 1 hour expiration
  tags: ['dataset', 'v1'],      // Tag for bulk invalidation
  compress: true,               // Enable compression
  dependencies: ['source:api']   // Dependency tracking
});
```

## Production Examples

### E-Commerce Product Cache
```javascript
class ProductService {
  constructor() {
    this.cache = new CacheManager({
      stores: [
        { type: 'memory', max: 5000, ttl: 300 },
        { type: 'redis', host: 'redis-cluster' }
      ],
      compression: 'gzip',
      metrics: { enabled: true }
    });
  }

  async getProduct(id) {
    let product = await this.cache.get(`product:${id}`);
    
    if (!product) {
      product = await this.fetchFromDatabase(id);
      await this.cache.set(`product:${id}`, product, {
        ttl: 3600,
        tags: ['product', `category:${product.categoryId}`]
      });
    }
    
    return product;
  }

  async updateCategory(categoryId) {
    // Invalidate all products in this category
    await this.cache.invalidateByTag(`category:${categoryId}`);
  }
}
```

### API Response Cache
```javascript
class ApiService {
  constructor(cache) {
    this.cache = cache;
  }

  async getCachedEndpoint(endpoint, params) {
    const key = `api:${endpoint}:${JSON.stringify(params)}`;
    
    let response = await this.cache.get(key);
    if (!response) {
      response = await this.callApi(endpoint, params);
      await this.cache.set(key, response, {
        ttl: 600, // 10 minutes
        tags: ['api', endpoint]
      });
    }
    
    return response;
  }

  async invalidateEndpoint(endpoint) {
    return await this.cache.invalidateByTag(endpoint);
  }
}
```

## Configuration Options

### Store Types

**Memory Store**
```javascript
{ 
  type: 'memory', 
  max: 1000,      // Max items
  ttl: 3600       // Default TTL in seconds
}
```

**Redis Store**
```javascript
{ 
  type: 'redis', 
  host: 'localhost', 
  port: 6379,
  options: {
    retryDelayOnFailover: 100,
    enableReadyCheck: true
  }
}
```

**Memcached Store**
```javascript
{ 
  type: 'memcached', 
  servers: ['127.0.0.1:11211'],
  options: {
    timeout: 5000,
    poolSize: 10
  }
}
```

### Global Settings
```javascript
{
  strategy: 'layered',           // Cache strategy
  serializer: 'json',           // 'json' | 'msgpack'
  compression: 'gzip',          // 'gzip' | 'none'
  compressionThreshold: 1024,   // Min bytes to compress
  metrics: {
    enabled: true,
    interval: 60000,            // Reporting interval
    console: true               // Log to console
  },
  circuitBreaker: {
    enabled: true,
    errorThreshold: 5,
    timeout: 30000
  }
}
```

## Performance Tips

1. **Use Layered Caching**: Memory + Redis for optimal performance
2. **Enable Compression**: For large objects (>1KB)
3. **Smart TTL**: Shorter for dynamic data, longer for static
4. **Tag Strategically**: Group related data for efficient invalidation
5. **Monitor Metrics**: Keep hit rates above 80%

## Examples to Try

Run the included examples:
```bash
node examples/basic-usage.js
node examples/layered-caching.js
node examples/e-commerce-demo.js
```

## Next Steps

- Check out the [full API documentation](README.md)
- Browse [production examples](examples/)
- Run [performance benchmarks](benchmarks/)
- Read about [advanced features](docs/)

Happy caching! 🚀