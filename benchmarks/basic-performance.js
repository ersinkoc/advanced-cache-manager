const { CacheManager } = require('../dist');
const { performance } = require('perf_hooks');

class PerformanceBenchmark {
  constructor() {
    this.results = {};
  }

  async runMemoryBenchmark() {
    console.log('🚀 Running Memory Store Benchmark...\n');
    
    const cache = new CacheManager({
      stores: [{ type: 'memory', max: 10000, ttl: 3600 }]
    });

    const operations = 10000;
    const data = { 
      name: 'Test User',
      email: 'test@example.com',
      data: 'x'.repeat(100) // 100 byte payload
    };

    // Warm up
    for (let i = 0; i < 100; i++) {
      await cache.set(`warmup:${i}`, data);
    }

    // Benchmark SET operations
    const setStart = performance.now();
    for (let i = 0; i < operations; i++) {
      await cache.set(`benchmark:${i}`, data);
    }
    const setEnd = performance.now();
    const setTime = setEnd - setStart;
    const setOpsPerSec = operations / (setTime / 1000);

    // Benchmark GET operations
    const getStart = performance.now();
    for (let i = 0; i < operations; i++) {
      await cache.get(`benchmark:${i}`);
    }
    const getEnd = performance.now();
    const getTime = getEnd - getStart;
    const getOpsPerSec = operations / (getTime / 1000);

    // Benchmark DEL operations
    const delStart = performance.now();
    for (let i = 0; i < operations; i++) {
      await cache.del(`benchmark:${i}`);
    }
    const delEnd = performance.now();
    const delTime = delEnd - delStart;
    const delOpsPerSec = operations / (delTime / 1000);

    console.log(`Memory Store Results (${operations} operations):`);
    console.log(`SET: ${setTime.toFixed(2)}ms total, ${setOpsPerSec.toFixed(0)} ops/sec, ${(setTime/operations).toFixed(3)}ms avg`);
    console.log(`GET: ${getTime.toFixed(2)}ms total, ${getOpsPerSec.toFixed(0)} ops/sec, ${(getTime/operations).toFixed(3)}ms avg`);
    console.log(`DEL: ${delTime.toFixed(2)}ms total, ${delOpsPerSec.toFixed(0)} ops/sec, ${(delTime/operations).toFixed(3)}ms avg`);

    await cache.close();

    this.results.memory = {
      set: { time: setTime, opsPerSec: setOpsPerSec, avgTime: setTime/operations },
      get: { time: getTime, opsPerSec: getOpsPerSec, avgTime: getTime/operations },
      del: { time: delTime, opsPerSec: delOpsPerSec, avgTime: delTime/operations }
    };
  }

  async runLayeredBenchmark() {
    console.log('\n🏗️ Running Layered Cache Benchmark...\n');

    const cache = new CacheManager({
      stores: [
        { type: 'memory', max: 1000, ttl: 300 }
      ],
      strategy: 'layered'
    });

    const operations = 1000;
    const data = { 
      id: Math.random(),
      timestamp: Date.now(),
      payload: 'x'.repeat(500) // 500 byte payload
    };

    // Test cache promotion (miss -> hit scenarios)
    const promotionStart = performance.now();
    
    for (let i = 0; i < operations; i++) {
      // First access (miss)
      await cache.get(`promotion:${i}`);
      
      // Set data
      await cache.set(`promotion:${i}`, { ...data, id: i });
      
      // Second access (hit)
      await cache.get(`promotion:${i}`);
    }
    
    const promotionEnd = performance.now();
    const promotionTime = promotionEnd - promotionStart;

    console.log(`Layered Cache Results (${operations} promotion cycles):`);
    console.log(`Total time: ${promotionTime.toFixed(2)}ms`);
    console.log(`Avg cycle time: ${(promotionTime/operations).toFixed(3)}ms`);

    // Get final metrics
    const metrics = await cache.getMetrics();
    console.log(`Final hit rate: ${metrics.hitRate.toFixed(2)}%`);
    console.log(`Avg response time: ${metrics.avgResponseTime.toFixed(3)}ms`);

    await cache.close();

    this.results.layered = {
      promotionTime,
      avgCycleTime: promotionTime/operations,
      hitRate: metrics.hitRate,
      avgResponseTime: metrics.avgResponseTime
    };
  }

  async runCompressionBenchmark() {
    console.log('\n📦 Running Compression Benchmark...\n');

    const cacheWithCompression = new CacheManager({
      stores: [{ type: 'memory', max: 1000 }],
      compression: 'gzip',
      compressionThreshold: 100
    });

    const cacheWithoutCompression = new CacheManager({
      stores: [{ type: 'memory', max: 1000 }],
      compression: 'none'
    });

    const largeData = {
      description: 'Lorem ipsum '.repeat(1000), // ~11KB of repeated text
      metadata: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        value: `data-${i}`,
        timestamp: Date.now()
      }))
    };

    const operations = 500;

    // Benchmark with compression
    const compressedStart = performance.now();
    for (let i = 0; i < operations; i++) {
      await cacheWithCompression.set(`large:${i}`, largeData);
      await cacheWithCompression.get(`large:${i}`);
    }
    const compressedEnd = performance.now();
    const compressedTime = compressedEnd - compressedStart;

    // Benchmark without compression
    const uncompressedStart = performance.now();
    for (let i = 0; i < operations; i++) {
      await cacheWithoutCompression.set(`large:${i}`, largeData);
      await cacheWithoutCompression.get(`large:${i}`);
    }
    const uncompressedEnd = performance.now();
    const uncompressedTime = uncompressedEnd - uncompressedStart;

    console.log(`Compression Results (${operations} operations with ~11KB data):`);
    console.log(`With compression: ${compressedTime.toFixed(2)}ms`);
    console.log(`Without compression: ${uncompressedTime.toFixed(2)}ms`);
    console.log(`Compression overhead: ${((compressedTime - uncompressedTime) / uncompressedTime * 100).toFixed(1)}%`);

    await cacheWithCompression.close();
    await cacheWithoutCompression.close();

    this.results.compression = {
      withCompression: compressedTime,
      withoutCompression: uncompressedTime,
      overhead: (compressedTime - uncompressedTime) / uncompressedTime * 100
    };
  }

  async runSerializationBenchmark() {
    console.log('\n🔄 Running Serialization Benchmark...\n');

    const jsonCache = new CacheManager({
      stores: [{ type: 'memory', max: 1000 }],
      serializer: 'json'
    });

    const msgpackCache = new CacheManager({
      stores: [{ type: 'memory', max: 1000 }],
      serializer: 'msgpack'
    });

    const complexData = {
      users: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        active: i % 2 === 0,
        metadata: {
          lastLogin: new Date().toISOString(),
          preferences: { theme: 'dark', lang: 'en' }
        }
      }))
    };

    const operations = 1000;

    // Benchmark JSON serialization
    const jsonStart = performance.now();
    for (let i = 0; i < operations; i++) {
      await jsonCache.set(`json:${i}`, complexData);
      await jsonCache.get(`json:${i}`);
    }
    const jsonEnd = performance.now();
    const jsonTime = jsonEnd - jsonStart;

    // Benchmark MessagePack serialization
    const msgpackStart = performance.now();
    for (let i = 0; i < operations; i++) {
      await msgpackCache.set(`msgpack:${i}`, complexData);
      await msgpackCache.get(`msgpack:${i}`);
    }
    const msgpackEnd = performance.now();
    const msgpackTime = msgpackEnd - msgpackStart;

    console.log(`Serialization Results (${operations} operations with complex data):`);
    console.log(`JSON: ${jsonTime.toFixed(2)}ms`);
    console.log(`MessagePack: ${msgpackTime.toFixed(2)}ms`);
    console.log(`MessagePack is ${((jsonTime - msgpackTime) / jsonTime * 100).toFixed(1)}% faster`);

    await jsonCache.close();
    await msgpackCache.close();

    this.results.serialization = {
      json: jsonTime,
      msgpack: msgpackTime,
      improvement: (jsonTime - msgpackTime) / jsonTime * 100
    };
  }

  async runMemoryUsageBenchmark() {
    console.log('\n💾 Running Memory Usage Benchmark...\n');

    const cache = new CacheManager({
      stores: [{ type: 'memory', max: 10000 }]
    });

    const data = {
      id: 'test',
      content: 'x'.repeat(1000) // 1KB per item
    };

    const steps = [1000, 2000, 5000, 10000];

    for (const step of steps) {
      // Add items
      for (let i = 0; i < step; i++) {
        await cache.set(`memory:${i}`, { ...data, id: i });
      }

      const stats = await cache.getStats();
      const memoryMB = (stats.memoryUsage / 1024 / 1024).toFixed(2);
      console.log(`${step} items: ${memoryMB} MB (${stats.keys} keys)`);
    }

    await cache.close();
  }

  printSummary() {
    console.log('\n📊 BENCHMARK SUMMARY');
    console.log('='.repeat(50));
    
    if (this.results.memory) {
      console.log('\nMemory Store:');
      console.log(`  SET: ${this.results.memory.set.opsPerSec.toFixed(0)} ops/sec`);
      console.log(`  GET: ${this.results.memory.get.opsPerSec.toFixed(0)} ops/sec`);
      console.log(`  DEL: ${this.results.memory.del.opsPerSec.toFixed(0)} ops/sec`);
    }

    if (this.results.layered) {
      console.log('\nLayered Cache:');
      console.log(`  Hit Rate: ${this.results.layered.hitRate.toFixed(2)}%`);
      console.log(`  Avg Response: ${this.results.layered.avgResponseTime.toFixed(3)}ms`);
    }

    if (this.results.compression) {
      console.log('\nCompression:');
      console.log(`  Overhead: ${this.results.compression.overhead.toFixed(1)}%`);
    }

    if (this.results.serialization) {
      console.log('\nSerialization:');
      console.log(`  MessagePack advantage: ${this.results.serialization.improvement.toFixed(1)}%`);
    }
  }
}

async function runBenchmarks() {
  const benchmark = new PerformanceBenchmark();
  
  try {
    await benchmark.runMemoryBenchmark();
    await benchmark.runLayeredBenchmark();
    await benchmark.runCompressionBenchmark();
    await benchmark.runSerializationBenchmark();
    await benchmark.runMemoryUsageBenchmark();
    
    benchmark.printSummary();
  } catch (error) {
    console.error('Benchmark failed:', error);
  }
}

if (require.main === module) {
  runBenchmarks();
}

module.exports = { PerformanceBenchmark };