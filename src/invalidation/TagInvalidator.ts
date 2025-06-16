import { IStore, InvalidationOptions } from '../types';

export class TagInvalidator {
  constructor(private stores: IStore[]) {}

  async invalidateByTag(tag: string, options?: InvalidationOptions): Promise<number> {
    const promises = this.stores.map(async (store) => {
      try {
        if ('invalidateByTag' in store && typeof store.invalidateByTag === 'function') {
          return await (store as any).invalidateByTag(tag);
        }
        return 0;
      } catch (error) {
        console.error(`Tag invalidation failed for store ${store.constructor.name}:`, error);
        return 0;
      }
    });

    if (options?.async) {
      Promise.all(promises).catch(error => {
        console.error('Async tag invalidation error:', error);
      });
      return 0;
    }

    const results = await Promise.all(promises);
    return results.reduce((total, count) => total + count, 0);
  }

  async invalidateMultipleTags(tags: string[], options?: InvalidationOptions): Promise<number> {
    const promises = tags.map(tag => this.invalidateByTag(tag, options));
    
    if (options?.async) {
      Promise.all(promises).catch(error => {
        console.error('Async multiple tag invalidation error:', error);
      });
      return 0;
    }

    const results = await Promise.all(promises);
    return results.reduce((total, count) => total + count, 0);
  }
}