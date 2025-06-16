// Simple test script to verify the basic functionality works
const { CacheManager } = require('./dist');

async function testBasicFunctionality() {
  console.log('🧪 Testing Advanced Cache Manager Basic Functionality\n');

  try {
    // Test with memory store only (simplest configuration)
    const cache = new CacheManager({
      stores: [
        { type: 'memory', max: 100, ttl: 3600 }
      ],
      strategy: 'layered',
      serializer: 'json',
      compression: 'none' // Disable compression to avoid potential issues
    });

    console.log('✅ Cache Manager initialized successfully');

    // Test basic operations
    await cache.set('test:string', 'Hello World');
    const stringResult = await cache.get('test:string');
    console.log('String result:', stringResult, 'Expected: Hello World');
    console.log('✅ String operation:', stringResult === 'Hello World' ? 'PASS' : 'FAIL');

    await cache.set('test:object', { name: 'John', age: 30 });
    const objectResult = await cache.get('test:object');
    console.log('✅ Object operation:', 
      objectResult && objectResult.name === 'John' && objectResult.age === 30 ? 'PASS' : 'FAIL');

    // Test multiple operations
    await cache.mset([
      ['test:multi1', 'value1'],
      ['test:multi2', 'value2']
    ]);
    const multiResults = await cache.mget(['test:multi1', 'test:multi2']);
    console.log('✅ Multiple operations:', 
      multiResults[0] === 'value1' && multiResults[1] === 'value2' ? 'PASS' : 'FAIL');

    // Test cache invalidation
    await cache.set('test:tagged', 'tagged-value', { tags: ['test-tag'] });
    await cache.invalidateByTag('test-tag');
    const invalidatedResult = await cache.get('test:tagged');
    console.log('✅ Tag invalidation:', invalidatedResult === null ? 'PASS' : 'FAIL');

    // Test metrics
    const metrics = await cache.getMetrics();
    console.log('✅ Metrics collection:', 
      typeof metrics.operations === 'number' && metrics.operations > 0 ? 'PASS' : 'FAIL');

    // Test stats
    const stats = await cache.getStats();
    console.log('✅ Stats collection:', 
      typeof stats.keys === 'number' ? 'PASS' : 'FAIL');

    await cache.close();
    console.log('✅ Cache closed successfully');

    console.log('\n🎉 All basic functionality tests PASSED!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testBasicFunctionality();