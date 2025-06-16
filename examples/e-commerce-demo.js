const { CacheManager } = require('advanced-cache-manager');

class ECommerceCache {
  constructor() {
    this.cache = new CacheManager({
      stores: [
        { type: 'memory', max: 5000, ttl: 300 }, // 5 min memory cache
        { type: 'redis', host: 'localhost', port: 6379 }
      ],
      strategy: 'layered',
      serializer: 'json',
      compression: 'gzip',
      compressionThreshold: 512,
      metrics: { enabled: true, interval: 60000 }
    });
  }

  // Product catalog caching
  async cacheProduct(product) {
    await this.cache.set(`product:${product.id}`, product, {
      ttl: 3600, // 1 hour
      tags: ['product', `category:${product.categoryId}`, `brand:${product.brandId}`],
      dependencies: [`category:${product.categoryId}`, `brand:${product.brandId}`]
    });
  }

  async getProduct(productId) {
    return await this.cache.get(`product:${productId}`);
  }

  // User session management
  async cacheUserSession(userId, sessionData) {
    await this.cache.set(`session:${userId}`, sessionData, {
      ttl: 1800, // 30 minutes
      tags: ['session', `user:${userId}`]
    });
  }

  async getUserSession(userId) {
    return await this.cache.get(`session:${userId}`);
  }

  // Shopping cart caching
  async cacheCart(userId, cartData) {
    await this.cache.set(`cart:${userId}`, cartData, {
      ttl: 3600, // 1 hour
      tags: ['cart', `user:${userId}`],
      dependencies: [`user:${userId}`]
    });
  }

  async getCart(userId) {
    return await this.cache.get(`cart:${userId}`);
  }

  // Product recommendations
  async cacheRecommendations(userId, recommendations) {
    await this.cache.set(`recommendations:${userId}`, recommendations, {
      ttl: 7200, // 2 hours
      tags: ['recommendations', `user:${userId}`]
    });
  }

  // API response caching
  async cacheApiResponse(endpoint, params, response) {
    const key = `api:${endpoint}:${this.hashParams(params)}`;
    await this.cache.set(key, response, {
      ttl: 600, // 10 minutes
      tags: ['api', endpoint]
    });
  }

  async getCachedApiResponse(endpoint, params) {
    const key = `api:${endpoint}:${this.hashParams(params)}`;
    return await this.cache.get(key);
  }

  // Cache invalidation methods
  async invalidateProductsByCategory(categoryId) {
    return await this.cache.invalidateByTag(`category:${categoryId}`);
  }

  async invalidateUserData(userId) {
    return await this.cache.invalidateByTag(`user:${userId}`);
  }

  async invalidateAllSessions() {
    return await this.cache.invalidateByTag('session');
  }

  // Utility methods
  hashParams(params) {
    return Buffer.from(JSON.stringify(params)).toString('base64');
  }

  async getMetrics() {
    return await this.cache.getMetrics();
  }

  async close() {
    await this.cache.close();
  }
}

// Demo usage
async function eCommerceDemo() {
  const ecomCache = new ECommerceCache();

  try {
    console.log('🛒 E-Commerce Cache Demo\n');

    // Sample product data
    const products = [
      {
        id: 1,
        name: 'Wireless Headphones',
        price: 99.99,
        categoryId: 'electronics',
        brandId: 'techbrand',
        description: 'High-quality wireless headphones with noise cancellation',
        stock: 50
      },
      {
        id: 2,
        name: 'Running Shoes',
        price: 129.99,
        categoryId: 'sports',
        brandId: 'sportsbrand',
        description: 'Comfortable running shoes for all terrains',
        stock: 25
      }
    ];

    // Cache products
    console.log('📦 Caching products...');
    for (const product of products) {
      await ecomCache.cacheProduct(product);
      console.log(`Cached product: ${product.name}`);
    }

    // Cache user session
    console.log('\n👤 Caching user session...');
    const sessionData = {
      userId: 123,
      username: 'john_doe',
      preferences: { theme: 'dark', currency: 'USD' },
      loginTime: new Date().toISOString()
    };
    await ecomCache.cacheUserSession(123, sessionData);

    // Cache shopping cart
    console.log('\n🛍️ Caching shopping cart...');
    const cartData = {
      items: [
        { productId: 1, quantity: 2, price: 99.99 },
        { productId: 2, quantity: 1, price: 129.99 }
      ],
      total: 329.97,
      lastUpdated: new Date().toISOString()
    };
    await ecomCache.cacheCart(123, cartData);

    // Cache API responses
    console.log('\n🌐 Caching API responses...');
    await ecomCache.cacheApiResponse('search', { q: 'headphones', page: 1 }, {
      results: [products[0]],
      totalCount: 1,
      page: 1
    });

    // Demonstrate cache retrieval
    console.log('\n📖 Retrieving cached data...');
    
    const cachedProduct = await ecomCache.getProduct(1);
    console.log('Retrieved product:', cachedProduct.name);

    const cachedSession = await ecomCache.getUserSession(123);
    console.log('Retrieved session for user:', cachedSession.username);

    const cachedCart = await ecomCache.getCart(123);
    console.log('Retrieved cart with', cachedCart.items.length, 'items');

    const cachedApiResponse = await ecomCache.getCachedApiResponse('search', { q: 'headphones', page: 1 });
    console.log('Retrieved cached search results:', cachedApiResponse.totalCount, 'results');

    // Demonstrate cache invalidation scenarios
    console.log('\n🗑️ Testing cache invalidation...');

    // Scenario 1: Product category update
    console.log('Invalidating electronics category...');
    const electronicsInvalidated = await ecomCache.invalidateProductsByCategory('electronics');
    console.log(`Invalidated ${electronicsInvalidated} electronics items`);

    // Verify invalidation
    const productAfterInvalidation = await ecomCache.getProduct(1);
    console.log('Product after category invalidation:', productAfterInvalidation ? 'Found' : 'Not found');

    // Scenario 2: User logout - invalidate user data
    console.log('\nUser logout - invalidating user data...');
    const userDataInvalidated = await ecomCache.invalidateUserData(123);
    console.log(`Invalidated ${userDataInvalidated} user items`);

    // Show final metrics
    console.log('\n📊 Final Cache Metrics:');
    const metrics = await ecomCache.getMetrics();
    console.log(`Total Operations: ${metrics.operations}`);
    console.log(`Cache Hits: ${metrics.hits}`);
    console.log(`Cache Misses: ${metrics.misses}`);
    console.log(`Hit Rate: ${metrics.hitRate.toFixed(2)}%`);
    console.log(`Average Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`);

    // Demonstrate cache warming for high-traffic products
    console.log('\n🔥 Cache warming demo...');
    console.log('Warming cache with popular products...');
    
    // Re-cache the electronics product for warming demo
    await ecomCache.cacheProduct(products[0]);
    
    const popularProductIds = [1, 2];
    const warmupKeys = popularProductIds.map(id => `product:${id}`);
    await ecomCache.cache.warmup(warmupKeys);
    console.log(`Warmed up cache for ${warmupKeys.length} popular products`);

  } catch (error) {
    console.error('❌ Error in e-commerce demo:', error);
  } finally {
    await ecomCache.close();
    console.log('\n✅ Demo completed - cache closed gracefully');
  }
}

// Real-world integration examples
class ProductService {
  constructor(cache) {
    this.cache = cache;
  }

  async getProductWithCache(productId) {
    // Try cache first
    let product = await this.cache.getProduct(productId);
    
    if (!product) {
      // Cache miss - fetch from database
      product = await this.fetchProductFromDatabase(productId);
      
      if (product) {
        // Cache for future requests
        await this.cache.cacheProduct(product);
      }
    }
    
    return product;
  }

  async fetchProductFromDatabase(productId) {
    // Simulate database fetch
    console.log(`Fetching product ${productId} from database...`);
    return {
      id: productId,
      name: 'Database Product',
      price: 99.99,
      categoryId: 'electronics',
      brandId: 'brand'
    };
  }

  async updateProduct(productId, updates) {
    // Update in database first
    await this.updateProductInDatabase(productId, updates);
    
    // Invalidate cache
    await this.cache.cache.del(`product:${productId}`);
    
    // Optionally invalidate related items
    if (updates.categoryId) {
      await this.cache.invalidateProductsByCategory(updates.categoryId);
    }
  }

  async updateProductInDatabase(productId, updates) {
    console.log(`Updating product ${productId} in database...`);
  }
}

// Run the demo
if (require.main === module) {
  eCommerceDemo().catch(console.error);
}