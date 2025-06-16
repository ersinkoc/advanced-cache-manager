import { IMetricsCollector, CacheMetrics } from '../types';

export interface MetricsReportConfig {
  interval: number;
  console?: boolean;
  callback?: (metrics: CacheMetrics) => void;
}

export class MetricsReporter {
  private interval?: NodeJS.Timeout;
  private collector: IMetricsCollector;
  private config: MetricsReportConfig;

  constructor(collector: IMetricsCollector, config: MetricsReportConfig) {
    this.collector = collector;
    this.config = config;
  }

  start(): void {
    if (this.interval) {
      this.stop();
    }

    this.interval = setInterval(() => {
      this.report();
    }, this.config.interval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  report(): void {
    const metrics = this.collector.getMetrics();

    if (this.config.console) {
      this.logToConsole(metrics);
    }

    if (this.config.callback) {
      try {
        this.config.callback(metrics);
      } catch (error) {
        console.error('Error in metrics callback:', error);
      }
    }
  }

  getSnapshot(): CacheMetrics {
    return this.collector.getMetrics();
  }

  private logToConsole(metrics: CacheMetrics): void {
    console.log('\n=== Cache Metrics ===');
    console.log(`Hits: ${metrics.hits}`);
    console.log(`Misses: ${metrics.misses}`);
    console.log(`Hit Rate: ${metrics.hitRate}%`);
    console.log(`Average Response Time: ${metrics.avgResponseTime}ms`);
    console.log(`Total Operations: ${metrics.operations}`);
    console.log(`Errors: ${metrics.errors}`);
    console.log(`Memory Usage: ${this.formatBytes(metrics.memoryUsage)}`);
    console.log('==================\n');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  exportMetrics(): string {
    const metrics = this.collector.getMetrics();
    return JSON.stringify(metrics, null, 2);
  }

  exportMetricsCSV(): string {
    const metrics = this.collector.getMetrics();
    const timestamp = new Date().toISOString();
    
    const headers = ['timestamp', 'hits', 'misses', 'hitRate', 'avgResponseTime', 'operations', 'errors', 'memoryUsage'];
    const values = [
      timestamp,
      metrics.hits,
      metrics.misses,
      metrics.hitRate,
      metrics.avgResponseTime,
      metrics.operations,
      metrics.errors,
      metrics.memoryUsage
    ];

    return headers.join(',') + '\n' + values.join(',');
  }
}