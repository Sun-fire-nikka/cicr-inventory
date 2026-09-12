const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  generateIdempotencyKey,
  generateRandomKey,
  markApplied,
  isApplied,
  configureIdempotency,
  clearAll,
  getStats,
} = require('../dist/config/idempotency.js');

beforeEach(() => {
  clearAll();
  configureIdempotency({ ttlMs: 5 * 60 * 1000 });
});

describe('generateIdempotencyKey', () => {
  test('returns a 16-char hex string', () => {
    const key = generateIdempotencyKey('INSERT INTO users (name) VALUES ($1)', ['Alice']);
    assert.equal(key.length, 16);
    assert.match(key, /^[0-9a-f]{16}$/);
  });

  test('same SQL + values produces same key (deterministic)', () => {
    const sql = 'INSERT INTO users (name) VALUES ($1)';
    const values = ['Alice'];
    const key1 = generateIdempotencyKey(sql, values);
    const key2 = generateIdempotencyKey(sql, values);
    assert.equal(key1, key2);
  });

  test('different values produce different keys', () => {
    const sql = 'INSERT INTO users (name) VALUES ($1)';
    const key1 = generateIdempotencyKey(sql, ['Alice']);
    const key2 = generateIdempotencyKey(sql, ['Bob']);
    assert.notEqual(key1, key2);
  });

  test('different SQL produces different keys', () => {
    const values = ['Alice'];
    const key1 = generateIdempotencyKey('INSERT INTO users (name) VALUES ($1)', values);
    const key2 = generateIdempotencyKey('INSERT INTO orders (item) VALUES ($1)', values);
    assert.notEqual(key1, key2);
  });

  test('normalizes SQL casing for dedup', () => {
    const key1 = generateIdempotencyKey('insert into users (name) values ($1)', ['Alice']);
    const key2 = generateIdempotencyKey('INSERT INTO users (name) VALUES ($1)', ['Alice']);
    assert.equal(key1, key2);
  });

  test('handles undefined values', () => {
    const key = generateIdempotencyKey('SELECT 1');
    assert.equal(key.length, 16);
  });
});

describe('generateRandomKey', () => {
  test('returns a 16-char hex string', () => {
    const key = generateRandomKey();
    assert.equal(key.length, 16);
    assert.match(key, /^[0-9a-f]{16}$/);
  });

  test('produces unique keys', () => {
    const keys = new Set();
    for (let i = 0; i < 100; i++) {
      keys.add(generateRandomKey());
    }
    assert.equal(keys.size, 100);
  });
});

describe('markApplied / isApplied', () => {
  test('marks a key as applied and detects it', () => {
    const key = generateIdempotencyKey('INSERT INTO t VALUES ($1)', [1]);
    assert.equal(isApplied(key), false);
    markApplied(key);
    assert.equal(isApplied(key), true);
  });

  test('different keys are tracked independently', () => {
    const key1 = generateRandomKey();
    const key2 = generateRandomKey();
    markApplied(key1);
    assert.equal(isApplied(key1), true);
    assert.equal(isApplied(key2), false);
  });

  test('clearAll removes all tracked keys', () => {
    markApplied(generateRandomKey());
    markApplied(generateRandomKey());
    assert.equal(getStats().size, 2);
    clearAll();
    assert.equal(getStats().size, 0);
  });
});

describe('TTL expiry', () => {
  test('key expires after configured TTL', () => {
    configureIdempotency({ ttlMs: 100 }); // 100ms TTL
    const key = generateIdempotencyKey('INSERT INTO t VALUES ($1)', [1]);
    markApplied(key);
    assert.equal(isApplied(key), true);

    // Wait for expiry
    setTimeout(() => {
      assert.equal(isApplied(key), false);
    }, 150);
  });
});

describe('getStats', () => {
  test('tracks applied key count', () => {
    assert.equal(getStats().size, 0);
    markApplied(generateRandomKey());
    markApplied(generateRandomKey());
    assert.equal(getStats().size, 2);
  });

  test('returns configured TTL', () => {
    configureIdempotency({ ttlMs: 30_000 });
    assert.equal(getStats().ttlMs, 30_000);
  });
});
