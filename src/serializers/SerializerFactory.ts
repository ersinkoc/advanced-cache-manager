import { ISerializer, SerializerType, SerializationError } from '../types';
import { JsonSerializer } from './JsonSerializer';
import { MessagePackSerializer } from './MessagePackSerializer';

export class SerializerFactory {
  private static serializers: Map<SerializerType, ISerializer> = new Map();

  static {
    SerializerFactory.serializers.set('json', new JsonSerializer());
    SerializerFactory.serializers.set('msgpack', new MessagePackSerializer());
  }

  static getSerializer(type: SerializerType): ISerializer {
    const serializer = SerializerFactory.serializers.get(type);
    
    if (!serializer) {
      throw new SerializationError(`Unsupported serializer type: ${type}`);
    }
    
    return serializer;
  }

  static registerSerializer(type: SerializerType, serializer: ISerializer): void {
    SerializerFactory.serializers.set(type, serializer);
  }

  static getSupportedTypes(): SerializerType[] {
    return Array.from(SerializerFactory.serializers.keys());
  }

  static getBestSerializer(value: any): ISerializer {
    const serializers = Array.from(SerializerFactory.serializers.values());
    
    for (const serializer of serializers) {
      if (serializer.canSerialize(value)) {
        return serializer;
      }
    }
    
    return SerializerFactory.getSerializer('json');
  }

  static compareSerializers(value: any): Array<{ name: string; size: number; ratio: number }> {
    const results: Array<{ name: string; size: number; ratio: number }> = [];
    const jsonSerializer = SerializerFactory.getSerializer('json');
    const jsonSize = Buffer.byteLength(jsonSerializer.serialize(value));

    for (const [type, serializer] of SerializerFactory.serializers) {
      try {
        const serialized = serializer.serialize(value);
        const size = Buffer.isBuffer(serialized) ? serialized.length : Buffer.byteLength(serialized);
        const ratio = jsonSize / size;
        
        results.push({
          name: serializer.getName(),
          size,
          ratio,
        });
      } catch (error) {
        console.warn(`Serializer ${type} failed to serialize value:`, error);
      }
    }

    return results.sort((a, b) => a.size - b.size);
  }
}