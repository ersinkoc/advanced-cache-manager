import {
  IStrategy,
  IStore,
  CacheKey,
  CacheValue,
  CacheOptions,
  CacheKeyValuePair,
} from '../types';

export class LayeredStrategy implements IStrategy {
  private stores: IStore[];

  constructor(stores: IStore[]) {
    this.stores = stores.sort((a, b) => this.getStorePriority(a) - this.getStorePriority(b));
  }

  async get<T = any>(key: CacheKey): Promise<T | null> {
    for (let i = 0; i < this.stores.length; i++) {
      const store = this.stores[i];
      
      try {
        const value = await store.get<T>(key);
        
        if (value !== null) {
          await this.promoteValue(key, value as CacheValue, i);
          return value;
        }
      } catch (error) {
        console.error(`Error getting key ${key} from store ${store.constructor.name}:`, error);
        continue;
      }
    }

    return null;
  }

  async set(key: CacheKey, value: CacheValue, options?: CacheOptions): Promise<void> {
    const errors: Error[] = [];

    for (const store of this.stores) {
      try {
        await store.set(key, value, options);
      } catch (error) {
        console.error(`Error setting key ${key} in store ${store.constructor.name}:`, error);
        errors.push(error as Error);
      }
    }

    if (errors.length === this.stores.length) {
      throw new Error(`Failed to set key ${key} in all stores: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  async del(key: CacheKey): Promise<boolean> {
    let deleted = false;
    const errors: Error[] = [];

    for (const store of this.stores) {
      try {
        const result = await store.del(key);
        if (result) {
          deleted = true;
        }
      } catch (error) {
        console.error(`Error deleting key ${key} from store ${store.constructor.name}:`, error);
        errors.push(error as Error);
      }
    }

    return deleted;
  }

  async mget(keys: CacheKey[]): Promise<Array<CacheValue | null>> {
    const results: Array<CacheValue | null> = new Array(keys.length).fill(null);
    const missingKeys: { [index: number]: CacheKey } = {};

    for (let i = 0; i < keys.length; i++) {
      missingKeys[i] = keys[i];
    }

    for (let storeIndex = 0; storeIndex < this.stores.length; storeIndex++) {
      const store = this.stores[storeIndex];
      const keysToFetch = Object.values(missingKeys);
      
      if (keysToFetch.length === 0) {
        break;
      }

      try {
        const storeResults = await store.mget(keysToFetch);
        
        let fetchIndex = 0;
        for (const [resultIndex, key] of Object.entries(missingKeys)) {
          const value = storeResults[fetchIndex];
          
          if (value !== null) {
            const index = parseInt(resultIndex);
            results[index] = value;
            delete missingKeys[index];
            
            await this.promoteValue(key, value as CacheValue, storeIndex);
          }
          
          fetchIndex++;
        }
      } catch (error) {
        console.error(`Error in mget from store ${store.constructor.name}:`, error);
        continue;
      }
    }

    return results;
  }

  async mset(keyValuePairs: CacheKeyValuePair[], options?: CacheOptions): Promise<void> {
    const errors: Error[] = [];

    for (const store of this.stores) {
      try {
        await store.mset(keyValuePairs, options);
      } catch (error) {
        console.error(`Error in mset for store ${store.constructor.name}:`, error);
        errors.push(error as Error);
      }
    }

    if (errors.length === this.stores.length) {
      throw new Error(`Failed to execute mset in all stores: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  async clear(): Promise<void> {
    const promises = this.stores.map(async (store) => {
      try {
        await store.clear();
      } catch (error) {
        console.error(`Error clearing store ${store.constructor.name}:`, error);
      }
    });

    await Promise.all(promises);
  }

  private async promoteValue(key: CacheKey, value: CacheValue, foundAtLevel: number): Promise<void> {
    const promotionPromises: Promise<void>[] = [];

    for (let i = 0; i < foundAtLevel; i++) {
      const store = this.stores[i];
      
      promotionPromises.push(
        store.set(key, value).catch(error => {
          console.error(`Error promoting key ${key} to store ${store.constructor.name}:`, error);
        })
      );
    }

    if (promotionPromises.length > 0) {
      await Promise.all(promotionPromises);
    }
  }

  private getStorePriority(store: IStore): number {
    const storeName = store.constructor.name;
    
    switch (storeName) {
      case 'MemoryStore':
        return 1;
      case 'RedisStore':
        return 2;
      case 'MemcachedStore':
        return 3;
      default:
        return 999;
    }
  }

  getStores(): IStore[] {
    return [...this.stores];
  }

  async invalidateByTag(tag: string): Promise<number> {
    let totalInvalidated = 0;
    
    for (const store of this.stores) {
      try {
        if ('invalidateByTag' in store && typeof store.invalidateByTag === 'function') {
          totalInvalidated += await (store as any).invalidateByTag(tag);
        }
      } catch (error) {
        console.error(`Error invalidating tag ${tag} in store ${store.constructor.name}:`, error);
      }
    }
    
    return totalInvalidated;
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    let totalInvalidated = 0;
    
    for (const store of this.stores) {
      try {
        if ('invalidateByPattern' in store && typeof store.invalidateByPattern === 'function') {
          totalInvalidated += await (store as any).invalidateByPattern(pattern);
        } else {
          const keys = await store.keys(pattern);
          for (const key of keys) {
            const deleted = await store.del(key);
            if (deleted) totalInvalidated++;
          }
        }
      } catch (error) {
        console.error(`Error invalidating pattern ${pattern} in store ${store.constructor.name}:`, error);
      }
    }
    
    return totalInvalidated;
  }

  async invalidateByDependency(dependency: string): Promise<number> {
    let totalInvalidated = 0;
    
    for (const store of this.stores) {
      try {
        if ('invalidateByDependency' in store && typeof store.invalidateByDependency === 'function') {
          totalInvalidated += await (store as any).invalidateByDependency(dependency);
        }
      } catch (error) {
        console.error(`Error invalidating dependency ${dependency} in store ${store.constructor.name}:`, error);
      }
    }
    
    return totalInvalidated;
  }
}