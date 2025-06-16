import { IStore, InvalidationOptions } from '../types';

export class DependencyInvalidator {
  constructor(private stores: IStore[]) {}

  async invalidateByDependency(dependency: string, options?: InvalidationOptions): Promise<number> {
    const promises = this.stores.map(async (store) => {
      try {
        if ('invalidateByDependency' in store && typeof store.invalidateByDependency === 'function') {
          return await (store as any).invalidateByDependency(dependency);
        }
        return 0;
      } catch (error) {
        console.error(`Dependency invalidation failed for store ${store.constructor.name}:`, error);
        return 0;
      }
    });

    if (options?.async) {
      Promise.all(promises).catch(error => {
        console.error('Async dependency invalidation error:', error);
      });
      return 0;
    }

    const results = await Promise.all(promises);
    let totalInvalidated = results.reduce((total, count) => total + count, 0);

    if (options?.cascade) {
      totalInvalidated += await this.cascadeInvalidation(dependency, options);
    }

    return totalInvalidated;
  }

  async invalidateMultipleDependencies(dependencies: string[], options?: InvalidationOptions): Promise<number> {
    const promises = dependencies.map(dependency => 
      this.invalidateByDependency(dependency, { ...options, cascade: false })
    );
    
    if (options?.async) {
      Promise.all(promises).catch(error => {
        console.error('Async multiple dependency invalidation error:', error);
      });
      return 0;
    }

    const results = await Promise.all(promises);
    let totalInvalidated = results.reduce((total, count) => total + count, 0);

    if (options?.cascade) {
      for (const dependency of dependencies) {
        totalInvalidated += await this.cascadeInvalidation(dependency, options);
      }
    }

    return totalInvalidated;
  }

  private async cascadeInvalidation(dependency: string, options?: InvalidationOptions): Promise<number> {
    const childDependencies = await this.findChildDependencies(dependency);
    
    if (childDependencies.length === 0) {
      return 0;
    }

    let totalInvalidated = 0;
    
    for (const childDependency of childDependencies) {
      totalInvalidated += await this.invalidateByDependency(childDependency, {
        ...options,
        cascade: true,
      });
    }

    return totalInvalidated;
  }

  private async findChildDependencies(parentDependency: string): Promise<string[]> {
    const childDependencies: Set<string> = new Set();

    for (const store of this.stores) {
      try {
        const keys = await store.keys('*');
        
        for (const key of keys) {
          const value = await store.get(key);
          if (value && typeof value === 'object' && value.dependencies) {
            const dependencies = Array.isArray(value.dependencies) ? value.dependencies : [value.dependencies];
            
            if (dependencies.includes(parentDependency)) {
              dependencies.forEach((dep: string) => {
                if (dep !== parentDependency) {
                  childDependencies.add(dep);
                }
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error finding child dependencies in store ${store.constructor.name}:`, error);
      }
    }

    return Array.from(childDependencies);
  }
}