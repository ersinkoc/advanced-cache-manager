import { JsonSerializer } from '../../src/serializers/JsonSerializer';
import { SerializationError } from '../../src/types';

describe('JsonSerializer', () => {
  let serializer: JsonSerializer;

  beforeEach(() => {
    serializer = new JsonSerializer();
  });

  test('should serialize and deserialize strings', () => {
    const original = 'test string';
    const serialized = serializer.serialize(original);
    const deserialized = serializer.deserialize(serialized);

    expect(deserialized).toBe(original);
  });

  test('should serialize and deserialize numbers', () => {
    const original = 42;
    const serialized = serializer.serialize(original);
    const deserialized = serializer.deserialize(serialized);

    expect(deserialized).toBe(original);
  });

  test('should serialize and deserialize objects', () => {
    const original = { name: 'John', age: 30, active: true };
    const serialized = serializer.serialize(original);
    const deserialized = serializer.deserialize(serialized);

    expect(deserialized).toEqual(original);
  });

  test('should serialize and deserialize arrays', () => {
    const original = [1, 'two', { three: 3 }, null];
    const serialized = serializer.serialize(original);
    const deserialized = serializer.deserialize(serialized);

    expect(deserialized).toEqual(original);
  });

  test('should handle null values', () => {
    const original = null;
    const serialized = serializer.serialize(original);
    const deserialized = serializer.deserialize(serialized);

    expect(deserialized).toBe(original);
  });

  test('should throw error for undefined values', () => {
    expect(() => serializer.serialize(undefined)).toThrow(SerializationError);
  });

  test('should throw error for empty deserialization', () => {
    expect(() => serializer.deserialize('')).toThrow(SerializationError);
    expect(() => serializer.deserialize(Buffer.from(''))).toThrow(SerializationError);
  });

  test('should throw error for invalid JSON', () => {
    expect(() => serializer.deserialize('invalid json')).toThrow(SerializationError);
  });

  test('should handle buffer input for deserialization', () => {
    const original = { test: 'value' };
    const serialized = serializer.serialize(original);
    const buffer = Buffer.from(serialized, 'utf8');
    const deserialized = serializer.deserialize(buffer);

    expect(deserialized).toEqual(original);
  });

  test('should check if value can be serialized', () => {
    expect(serializer.canSerialize('string')).toBe(true);
    expect(serializer.canSerialize(42)).toBe(true);
    expect(serializer.canSerialize({ key: 'value' })).toBe(true);
    expect(serializer.canSerialize([1, 2, 3])).toBe(true);
    expect(serializer.canSerialize(null)).toBe(true);
  });

  test('should return correct content type', () => {
    expect(serializer.getContentType()).toBe('application/json');
  });

  test('should return correct name', () => {
    expect(serializer.getName()).toBe('json');
  });
});