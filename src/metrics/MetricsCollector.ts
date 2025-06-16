import { IMetricsCollector, CacheMetrics } from '../types';

export class MetricsCollector implements IMetricsCollector {
  private hits = 0;
  private misses = 0;
  private operations = 0;
  private errors = 0;
  private totalResponseTime = 0;
  private startTime = Date.now();

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  recordOperation(duration: number): void {
    this.operations++;
    this.totalResponseTime += duration;
  }

  recordError(): void {
    this.errors++;
  }

  getMetrics(): CacheMetrics {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;
    const avgResponseTime = this.operations > 0 ? this.totalResponseTime / this.operations : 0;
    const uptime = Date.now() - this.startTime;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      memoryUsage: this.getMemoryUsage(),
      operations: this.operations,
      errors: this.errors,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.operations = 0;
    this.errors = 0;
    this.totalResponseTime = 0;
    this.startTime = Date.now();
  }

  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  async withMetrics<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      this.recordOperation(duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordOperation(duration);
      this.recordError();
      throw error;
    }
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total) * 100 : 0;
  }

  getAverageResponseTime(): number {
    return this.operations > 0 ? this.totalResponseTime / this.operations : 0;
  }

  getTotalOperations(): number {
    return this.operations;
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }
}