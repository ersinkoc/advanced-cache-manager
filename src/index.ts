export { CacheManager } from './CacheManager';

export { BaseStore } from './stores/BaseStore';
export { MemoryStore } from './stores/MemoryStore';
export { RedisStore } from './stores/RedisStore';
export { MemcachedStore } from './stores/MemcachedStore';

export { LayeredStrategy } from './strategies/LayeredStrategy';

export { TagInvalidator } from './invalidation/TagInvalidator';
export { PatternInvalidator } from './invalidation/PatternInvalidator';
export { DependencyInvalidator } from './invalidation/DependencyInvalidator';

export { MetricsCollector } from './metrics/MetricsCollector';
export { MetricsReporter } from './metrics/MetricsReporter';

export { JsonSerializer } from './serializers/JsonSerializer';
export { MessagePackSerializer } from './serializers/MessagePackSerializer';
export { SerializerFactory } from './serializers/SerializerFactory';

export { GzipCompressor } from './compressors/GzipCompressor';
export { CompressorFactory } from './compressors/CompressorFactory';

export * from './types';

import { CacheManager } from './CacheManager';
export default CacheManager;