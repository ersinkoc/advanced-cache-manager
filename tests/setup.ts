// Jest setup file for advanced-cache-manager tests

// Set test timeout
jest.setTimeout(30000);

// Mock console.error to avoid noise in tests unless explicitly needed
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

// Global test helpers
(global as any).sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock external dependencies if needed
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    mget: jest.fn(),
    mset: jest.fn(),
    keys: jest.fn(),
    exists: jest.fn(),
    flushdb: jest.fn(),
    quit: jest.fn(),
    pipeline: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn()
    })),
    on: jest.fn(),
    info: jest.fn(),
    dbsize: jest.fn()
  }));
});

jest.mock('memcached', () => {
  // Return a constructor function that creates a mock memcached instance
  function MockMemcached() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      getMulti: jest.fn(),
      flush: jest.fn(),
      end: jest.fn(),
      stats: jest.fn(),
      on: jest.fn()
    };
  }
  return MockMemcached;
});

jest.mock('msgpack5', () => {
  return jest.fn(() => ({
    encode: jest.fn((value) => Buffer.from(JSON.stringify(value))),
    decode: jest.fn((buffer) => JSON.parse(buffer.toString())),
  }));
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in tests:', reason);
});