import { ISerializer, SerializationError } from '../types';

export class MessagePackSerializer implements ISerializer {
  private msgpack: any;

  constructor() {
    try {
      const msgpack5 = require('msgpack5');
      this.msgpack = msgpack5();
    } catch (error) {
      console.warn('MessagePack not available, falling back to JSON serialization');
      this.msgpack = null;
    }
  }

  serialize(value: any): Buffer {
    try {
      if (value === undefined) {
        throw new SerializationError('Cannot serialize undefined value');
      }
      
      if (!this.msgpack) {
        // Fallback to JSON if MessagePack is not available
        return Buffer.from(JSON.stringify(value));
      }
      
      return this.msgpack.encode(value);
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown serialization error';
      throw new SerializationError(`MessagePack serialization failed: ${message}`);
    }
  }

  deserialize<T = any>(data: Buffer | string): T {
    try {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary');
      
      if (!buffer || buffer.length === 0) {
        throw new SerializationError('Cannot deserialize empty or null buffer');
      }
      
      if (!this.msgpack) {
        // Fallback to JSON if MessagePack is not available
        return JSON.parse(buffer.toString('utf8')) as T;
      }
      
      return this.msgpack.decode(buffer) as T;
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown deserialization error';
      throw new SerializationError(`MessagePack deserialization failed: ${message}`);
    }
  }

  canSerialize(value: any): boolean {
    try {
      if (!this.msgpack) {
        // Fallback to JSON serialization check
        JSON.stringify(value);
        return true;
      }
      this.msgpack.encode(value);
      return true;
    } catch {
      return false;
    }
  }

  getContentType(): string {
    return 'application/msgpack';
  }

  getName(): string {
    return 'msgpack';
  }

  getCompressionRatio(value: any): number {
    try {
      const jsonSize = Buffer.byteLength(JSON.stringify(value));
      if (!this.msgpack) {
        return 1; // No compression benefit if MessagePack not available
      }
      const msgpackSize = this.msgpack.encode(value).length;
      return jsonSize / msgpackSize;
    } catch {
      return 1;
    }
  }
}