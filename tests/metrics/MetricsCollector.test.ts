import { MetricsCollector } from '../../src/metrics/MetricsCollector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  test('should record hits and misses', () => {
    collector.recordHit();
    collector.recordHit();
    collector.recordMiss();

    const metrics = collector.getMetrics();
    expect(metrics.hits).toBe(2);
    expect(metrics.misses).toBe(1);
    expect(metrics.hitRate).toBe(66.67);
  });

  test('should record operations and calculate average response time', () => {
    collector.recordOperation(100);
    collector.recordOperation(200);
    collector.recordOperation(300);

    const metrics = collector.getMetrics();
    expect(metrics.operations).toBe(3);
    expect(metrics.avgResponseTime).toBe(200);
  });

  test('should record errors', () => {
    collector.recordError();
    collector.recordError();

    const metrics = collector.getMetrics();
    expect(metrics.errors).toBe(2);
  });

  test('should calculate hit rate correctly', () => {
    expect(collector.getHitRate()).toBe(0); // No operations yet

    collector.recordHit();
    collector.recordHit();
    collector.recordMiss();

    expect(collector.getHitRate()).toBeCloseTo(66.67, 1);
  });

  test('should reset metrics', () => {
    collector.recordHit();
    collector.recordMiss();
    collector.recordOperation(100);
    collector.recordError();

    collector.reset();

    const metrics = collector.getMetrics();
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(0);
    expect(metrics.operations).toBe(0);
    expect(metrics.errors).toBe(0);
    expect(metrics.hitRate).toBe(0);
    expect(metrics.avgResponseTime).toBe(0);
  });

  test('should handle withMetrics wrapper for successful operations', async () => {
    const result = await collector.withMetrics(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'success';
    });

    expect(result).toBe('success');
    const metrics = collector.getMetrics();
    expect(metrics.operations).toBe(1);
    expect(metrics.avgResponseTime).toBeGreaterThan(90);
    expect(metrics.errors).toBe(0);
  });

  test('should handle withMetrics wrapper for failed operations', async () => {
    await expect(collector.withMetrics(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      throw new Error('Test error');
    })).rejects.toThrow('Test error');

    const metrics = collector.getMetrics();
    expect(metrics.operations).toBe(1);
    expect(metrics.avgResponseTime).toBeGreaterThan(40);
    expect(metrics.errors).toBe(1);
  });

  test('should track uptime', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    const uptime = collector.getUptime();
    expect(uptime).toBeGreaterThan(90);
  });

  test('should return total operations', () => {
    collector.recordOperation(100);
    collector.recordOperation(200);

    expect(collector.getTotalOperations()).toBe(2);
  });

  test('should return average response time', () => {
    collector.recordOperation(100);
    collector.recordOperation(200);
    collector.recordOperation(300);

    expect(collector.getAverageResponseTime()).toBe(200);
  });
});