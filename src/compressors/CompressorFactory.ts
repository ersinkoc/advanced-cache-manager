import { ICompressor, CompressionType, CompressionError } from '../types';
import { GzipCompressor } from './GzipCompressor';

class NoOpCompressor implements ICompressor {
  compress(data: Buffer | string): Buffer {
    return Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  }

  decompress(data: Buffer): Buffer {
    return data;
  }

  getCompressionRatio(): number {
    return 1;
  }

  getName(): string {
    return 'none';
  }
}

export class CompressorFactory {
  private static compressors: Map<CompressionType, ICompressor> = new Map();

  static {
    CompressorFactory.compressors.set('gzip', new GzipCompressor());
    CompressorFactory.compressors.set('none', new NoOpCompressor());
  }

  static getCompressor(type: CompressionType): ICompressor {
    const compressor = CompressorFactory.compressors.get(type);
    
    if (!compressor) {
      throw new CompressionError(`Unsupported compression type: ${type}`);
    }
    
    return compressor;
  }

  static registerCompressor(type: CompressionType, compressor: ICompressor): void {
    CompressorFactory.compressors.set(type, compressor);
  }

  static getSupportedTypes(): CompressionType[] {
    return Array.from(CompressorFactory.compressors.keys());
  }

  static getBestCompressor(data: Buffer | string, threshold: number = 1024): ICompressor {
    const size = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, 'utf8');
    
    if (size < threshold) {
      return CompressorFactory.getCompressor('none');
    }

    let bestCompressor = CompressorFactory.getCompressor('none');
    let bestRatio = 1;

    for (const [type, compressor] of CompressorFactory.compressors) {
      if (type === 'none') continue;
      
      try {
        const ratio = compressor.getCompressionRatio(data);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestCompressor = compressor;
        }
      } catch (error) {
        console.warn(`Compressor ${type} failed to compress data:`, error);
      }
    }

    return bestCompressor;
  }

  static compareCompressors(data: Buffer | string): Array<{ name: string; size: number; ratio: number; time: number }> {
    const results: Array<{ name: string; size: number; ratio: number; time: number }> = [];
    const originalSize = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, 'utf8');

    for (const [type, compressor] of CompressorFactory.compressors) {
      try {
        const startTime = Date.now();
        const compressed = compressor.compress(data);
        const endTime = Date.now();
        
        const size = Buffer.isBuffer(compressed) ? compressed.length : Buffer.byteLength(compressed);
        const ratio = originalSize / size;
        const time = endTime - startTime;
        
        results.push({
          name: compressor.getName(),
          size,
          ratio,
          time,
        });
      } catch (error) {
        console.warn(`Compressor ${type} failed to compress data:`, error);
      }
    }

    return results.sort((a, b) => b.ratio - a.ratio);
  }
}