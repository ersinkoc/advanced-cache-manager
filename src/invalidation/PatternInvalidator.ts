import { IStore, InvalidationOptions } from '../types';

export class PatternInvalidator {
  constructor(private stores: IStore[]) {}

  async invalidateByPattern(pattern: string, options?: InvalidationOptions): Promise<number> {
    const promises = this.stores.map(async (store) => {
      try {
        if ('invalidateByPattern' in store && typeof store.invalidateByPattern === 'function') {
          return await (store as any).invalidateByPattern(pattern);
        }
        
        const keys = await store.keys(pattern);
        let count = 0;
        
        for (const key of keys) {
          const deleted = await store.del(key);
          if (deleted) count++;
        }
        
        return count;
      } catch (error) {
        console.error(`Pattern invalidation failed for store ${store.constructor.name}:`, error);
        return 0;
      }
    });

    if (options?.async) {
      Promise.all(promises).catch(error => {
        console.error('Async pattern invalidation error:', error);
      });
      return 0;
    }

    const results = await Promise.all(promises);
    return results.reduce((total, count) => total + count, 0);
  }

  async invalidateMultiplePatterns(patterns: string[], options?: InvalidationOptions): Promise<number> {
    const promises = patterns.map(pattern => this.invalidateByPattern(pattern, options));
    
    if (options?.async) {
      Promise.all(promises).catch(error => {
        console.error('Async multiple pattern invalidation error:', error);
      });
      return 0;
    }

    const results = await Promise.all(promises);
    return results.reduce((total, count) => total + count, 0);
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
    return new RegExp(`^${regexPattern}$`);
  }
}