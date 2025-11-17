import { IStore, InvalidationOptions } from '../types';

export class DependencyInvalidator {
  constructor(private stores: IStore[]) {}

  async invalidateByDependency(dependency: string, options?: InvalidationOptions): Promise<number> {
    // Use a Set to track visited dependencies and prevent infinite recursion
    const visited = new Set<string>();
    return this.invalidateByDependencyInternal(dependency, options, visited);
  }

  private async invalidateByDependencyInternal(
    dependency: string,
    options: InvalidationOptions | undefined,
    visited: Set<string>
  ): Promise<number> {
    // Prevent infinite recursion by checking if we've already visited this dependency
    if (visited.has(dependency)) {
      console.warn(`Circular dependency detected: ${dependency}. Skipping to prevent infinite recursion.`);
      return 0;
    }

    visited.add(dependency);

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
      totalInvalidated += await this.cascadeInvalidation(dependency, options, visited);
    }

    return totalInvalidated;
  }

  async invalidateMultipleDependencies(dependencies: string[], options?: InvalidationOptions): Promise<number> {
    // Use a shared visited set across all dependencies to prevent cycles
    const visited = new Set<string>();
    const promises = dependencies.map(dependency =>
      this.invalidateByDependencyInternal(dependency, { ...options, cascade: false }, visited)
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
        if (!visited.has(dependency)) {
          totalInvalidated += await this.cascadeInvalidation(dependency, options, visited);
        }
      }
    }

    return totalInvalidated;
  }

  private async cascadeInvalidation(
    dependency: string,
    options: InvalidationOptions | undefined,
    visited: Set<string>
  ): Promise<number> {
    const childDependencies = await this.findChildDependencies(dependency);

    if (childDependencies.length === 0) {
      return 0;
    }

    let totalInvalidated = 0;

    for (const childDependency of childDependencies) {
      // Use internal method with visited set to prevent infinite recursion
      totalInvalidated += await this.invalidateByDependencyInternal(childDependency, {
        ...options,
        cascade: true,
      }, visited);
    }

    return totalInvalidated;
  }

  private async findChildDependencies(parentDependency: string): Promise<string[]> {
    const childDependencies: Set<string> = new Set();

    for (const store of this.stores) {
      try {
        // Optimization: Try to get keys that depend on parentDependency directly from store
        // This avoids fetching ALL keys when store has dependency tracking
        let keysToCheck: string[] = [];

        // Check if store has a method to get keys by dependency (MemoryStore, RedisStore have this)
        if ('dependencyIndex' in store || typeof (store as any).getKeysByDependency === 'function') {
          // For stores with dependency indexes, we could optimize further
          // For now, fall back to getting all keys but add a note for future optimization
          // TODO: Add getKeysByDependency method to IStore interface
        }

        // Fall back to checking all keys (less efficient but works for all stores)
        keysToCheck = await store.keys('*');

        // Only fetch the actual entries if we need to check their dependencies
        for (const key of keysToCheck) {
          const value = await store.get(key);

          // Check if the value has dependencies that include the parent
          if (value && typeof value === 'object' && value.dependencies) {
            const dependencies = Array.isArray(value.dependencies) ? value.dependencies : [value.dependencies];

            if (dependencies.includes(parentDependency)) {
              // Add all other dependencies (siblings) to the set
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