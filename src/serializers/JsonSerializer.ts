import { ISerializer, SerializationError } from '../types';

export class JsonSerializer implements ISerializer {
  serialize(value: any): string {
    try {
      if (value === undefined) {
        throw new SerializationError('Cannot serialize undefined value');
      }
      
      return JSON.stringify(value);
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown serialization error';
      throw new SerializationError(`JSON serialization failed: ${message}`);
    }
  }

  deserialize<T = any>(data: Buffer | string): T {
    try {
      const jsonString = Buffer.isBuffer(data) ? data.toString('utf8') : data;
      
      if (!jsonString || jsonString.trim() === '') {
        throw new SerializationError('Cannot deserialize empty or null data');
      }
      
      return JSON.parse(jsonString) as T;
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown deserialization error';
      throw new SerializationError(`JSON deserialization failed: ${message}`);
    }
  }

  canSerialize(value: any): boolean {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }

  getContentType(): string {
    return 'application/json';
  }

  getName(): string {
    return 'json';
  }
}