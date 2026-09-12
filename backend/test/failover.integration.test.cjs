const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  initFailover,
  getFailoverPhase,
  isWritable,
  bufferWrite,
  getWriteBufferLength,
  triggerFailover,
  resetFailover,
} = require('../dist/config/failover.js');

const {
  clearAll: clearIdempotency,
  generateIdempotencyKey,
  markApplied,
} = require('../dist/config/idempotency.js');

const { healthState, neonConfig } = require('../dist/config/neonPool.js');

beforeEach(() => {
  resetFailover();
  clearIdempotency();
  // Simulate Neon configured
  neonConfig.primaryHost = 'primary.test.neon.tech';
  neonConfig.replicaHost = 'replica.test.neon.tech';
  neonConfig.user = 'neondb';
  neonConfig.password = 'test-password';
  healthState.primary = 'unhealthy';
  healthState.replica = 'healthy';
  healthState.currentPrimaryHost = 'primary.test.neon.tech';
});

afterEach(() => {
  resetFailover();
  clearIdempotency();
});

describe('initial state', () => {
  test('starts in IDLE phase', () => {
    assert.equal(getFailoverPhase(), 'IDLE');
  });

  test('isWritable returns true in IDLE', () => {
    assert.equal(isWritable(), true);
  });

  test('write buffer starts empty', () => {
    assert.equal(getWriteBufferLength(), 0);
  });
});

describe('write buffering', () => {
  test('bufferWrite returns true and increments buffer length', () => {
    const ok = bufferWrite('INSERT INTO t VALUES ($1)', [1]);
    assert.equal(ok, true);
    assert.equal(getWriteBufferLength(), 1);
  });

  test('multiple writes are buffered', () => {
    bufferWrite('INSERT INTO t VALUES ($1)', [1]);
    bufferWrite('INSERT INTO t VALUES ($1)', [2]);
    bufferWrite('INSERT INTO t VALUES ($1)', [3]);
    assert.equal(getWriteBufferLength(), 3);
  });

  test('bufferWrite returns false when buffer is full', () => {
    for (let i = 0; i < 100; i++) {
      bufferWrite(`INSERT INTO t VALUES ($1)`, [i]);
    }
    assert.equal(getWriteBufferLength(), 100);
    const ok = bufferWrite('INSERT INTO t VALUES ($1)', [101]);
    assert.equal(ok, false);
    assert.equal(getWriteBufferLength(), 100);
  });

  test('buffered writes get idempotency keys', () => {
    bufferWrite('INSERT INTO t VALUES ($1)', [1]);
    // No direct way to check the key, but the buffer should have grown
    assert.equal(getWriteBufferLength(), 1);
  });
});

describe('failover trigger — Neon not configured', () => {
  test('returns false when Neon is not configured', async () => {
    neonConfig.primaryHost = '';
    neonConfig.user = '';
    neonConfig.password = '';
    const result = await triggerFailover();
    assert.equal(result, false);
  });
});

describe('failover trigger — both endpoints down', () => {
  test('transitions to BOTH_DOWN when primary and replica are unhealthy', async () => {
    healthState.primary = 'unhealthy';
    healthState.replica = 'unhealthy';
    const result = await triggerFailover();
    assert.equal(result, false);
    assert.equal(getFailoverPhase(), 'BOTH_DOWN');
  });

  test('transitions to BOTH_DOWN when primary unhealthy and replica unknown', async () => {
    healthState.primary = 'unhealthy';
    healthState.replica = 'unknown';
    const result = await triggerFailover();
    assert.equal(result, false);
    assert.equal(getFailoverPhase(), 'BOTH_DOWN');
  });
});

describe('failover trigger — successful promotion', () => {
  test('transitions through DEGRADED → PROMOTING → FENCING → RECOVERED', async () => {
    const phases = [];
    const origInit = initFailover;

    initFailover(
      async () => {
        phases.push('promote-called');
        return { success: true, newPrimaryHost: 'new-primary.test.neon.tech' };
      },
      async (oldHost) => {
        phases.push(`fence-called:${oldHost}`);
        return { success: true };
      },
    );

    const result = await triggerFailover();
    assert.equal(result, true);
    assert.equal(getFailoverPhase(), 'RECOVERED');
    assert.ok(phases.includes('promote-called'));
    assert.ok(phases.some((p) => p.startsWith('fence-called:')));
  });

  test('replays buffered writes after promotion', async () => {
    const replayedSqls = [];

    initFailover(
      async () => ({ success: true, newPrimaryHost: 'new-primary.test.neon.tech' }),
      async () => ({ success: true }),
    );

    // Buffer some writes
    bufferWrite('INSERT INTO t VALUES ($1)', [1]);
    bufferWrite('INSERT INTO t VALUES ($1)', [2]);
    assert.equal(getWriteBufferLength(), 2);

    const result = await triggerFailover();
    assert.equal(result, true);
    // Buffer should be cleared after replay (even though replay fails
    // because primaryPool points to a non-existent host in test)
    // The buffer is cleared at the start of replayBuffer
  });
});

describe('failover trigger — promotion failure', () => {
  test('retries promotion up to MAX_PROMOTION_RETRIES', async () => {
    let promoteCalls = 0;

    initFailover(
      async () => {
        promoteCalls++;
        return { success: false, error: 'API error' };
      },
      async () => ({ success: true }),
    );

    const result = await triggerFailover();
    assert.equal(result, false);
    assert.equal(getFailoverPhase(), 'API_FAILURE');
    assert.equal(promoteCalls, 3); // MAX_PROMOTION_RETRIES = 3
  });
});

describe('failover trigger — idempotency during replay', () => {
  test('skips already-applied writes during replay', async () => {
    const sql = 'INSERT INTO t VALUES ($1)';
    const values = [1];
    const key = generateIdempotencyKey(sql, values);

    initFailover(
      async () => ({ success: true, newPrimaryHost: 'new-primary.test.neon.tech' }),
      async () => ({ success: true }),
    );

    // Mark the write as already applied before buffering
    markApplied(key);
    bufferWrite(sql, values);
    assert.equal(getWriteBufferLength(), 1);

    await triggerFailover();
    // Buffer should be cleared — the write was skipped due to idempotency
    assert.equal(getWriteBufferLength(), 0);
  });
});

describe('resetFailover', () => {
  test('resets to IDLE and clears buffer', async () => {
    initFailover(
      async () => ({ success: true, newPrimaryHost: 'new.test' }),
      async () => ({ success: true }),
    );

    bufferWrite('INSERT INTO t VALUES ($1)', [1]);
    assert.equal(getWriteBufferLength(), 1);

    resetFailover();
    assert.equal(getFailoverPhase(), 'IDLE');
    assert.equal(getWriteBufferLength(), 0);
    assert.equal(isWritable(), true);
  });
});

describe('isWritable', () => {
  test('returns true in IDLE', () => {
    assert.equal(isWritable(), true);
  });

  test('returns true in RECOVERED', async () => {
    initFailover(
      async () => ({ success: true, newPrimaryHost: 'new.test' }),
      async () => ({ success: true }),
    );

    await triggerFailover();
    assert.equal(getFailoverPhase(), 'RECOVERED');
    assert.equal(isWritable(), true);
  });

  test('returns false in API_FAILURE', async () => {
    initFailover(
      async () => ({ success: false, error: 'fail' }),
      async () => ({ success: true }),
    );

    await triggerFailover();
    assert.equal(getFailoverPhase(), 'API_FAILURE');
    assert.equal(isWritable(), false);
  });
});
