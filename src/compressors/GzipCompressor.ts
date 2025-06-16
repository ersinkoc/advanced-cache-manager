import * as pako from 'pako';
import { ICompressor, CompressionError } from '../types';

export class GzipCompressor implements ICompressor {
  private compressionLevel: number;

  constructor(compressionLevel: number = 6) {
    this.compressionLevel = Math.max(1, Math.min(9, compressionLevel)) as any;
  }

  compress(data: Buffer | string): Buffer {
    try {
      const input = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      
      if (input.length === 0) {
        throw new CompressionError('Cannot compress empty data');
      }

      const compressed = pako.gzip(input, { level: this.compressionLevel as any });
      return Buffer.from(compressed);
    } catch (error) {
      if (error instanceof CompressionError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown compression error';
      throw new CompressionError(`Gzip compression failed: ${message}`);
    }
  }

  decompress(data: Buffer): Buffer {
    try {
      if (!Buffer.isBuffer(data) || data.length === 0) {
        throw new CompressionError('Cannot decompress empty or invalid data');
      }

      const decompressed = pako.ungzip(data);
      return Buffer.from(decompressed);
    } catch (error) {
      if (error instanceof CompressionError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown decompression error';
      throw new CompressionError(`Gzip decompression failed: ${message}`);
    }
  }

  getCompressionRatio(data: Buffer | string): number {
    try {
      const input = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      const compressed = this.compress(input);
      return input.length / compressed.length;
    } catch {
      return 1;
    }
  }

  getName(): string {
    return 'gzip';
  }

  getLevel(): number {
    return this.compressionLevel;
  }

  setLevel(level: number): void {
    this.compressionLevel = Math.max(1, Math.min(9, level)) as any;
  }

  shouldCompress(data: Buffer | string, threshold: number = 1024): boolean {
    const size = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, 'utf8');
    return size >= threshold;
  }
}