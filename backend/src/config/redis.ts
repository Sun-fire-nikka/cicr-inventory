// Redis infrastructure client (v1.5.0).
//
//  * Real Redis (ioredis) when REDIS_URL is set — used for express-session
//    cookie storage, API response caching, and TTL-based OTP state.
//  * In-memory fallback when REDIS_URL is unset — identical async TTL
//    interface, so local dev and the test suite run without a Redis server.
//    Every Redis call is wrapped so a transient connection failure degrades
//    to the in-memory store instead of crashing a request.
import Redis from 'ioredis';

export const REDIS_URL = process.env.REDIS_URL || '';
export const isRedisEnabled = REDIS_URL.length > 0;

// ---------------------------------------------------------------- in-memory
interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const memory = new Map<string, MemoryEntry>();

const memoryGet = async (key: string): Promise<string | null> => {
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memory.delete(key);
    return null;
  }
  return entry.value;
};

const memorySet = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER;
  memory.set(key, { value, expiresAt });
};

const memoryDel = async (key: string): Promise<void> => {
  memory.delete(key);
};

const memoryTtl = async (key: string): Promise<number> => {
  const entry = memory.get(key);
  if (!entry) return -2;
  if (Date.now() > entry.expiresAt) {
    memory.delete(key);
    return -2;
  }
  return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
};

const memoryKeys = async (pattern: string): Promise<string[]> => {
  const regex = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return [...memory.keys()].filter((k) => regex.test(k));
};

// ------------------------------------------------------------------ ioredis
export const redisClient: Redis | null = isRedisEnabled
  ? new Redis(REDIS_URL, { enableReadyCheck: false, maxRetriesPerRequest: 1 })
  : null;

if (redisClient) {
  redisClient.on('error', (err: Error) => {
    console.warn('[REDIS] connection error (falling back to in-memory store):', err.message);
  });
  redisClient.on('ready', () => {
    console.log('⚡ Connected to Redis at ' + REDIS_URL.replace(/\/\/.*@/, '//***@'));
  });
}

// ------------------------------------------------------------------- public
export const redisGet = async (key: string): Promise<string | null> => {
  if (redisClient) {
    try {
      return await redisClient.get(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memoryGet(key);
};

export const redisSet = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  if (redisClient) {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await redisClient.set(key, value, 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, value);
      }
      return;
    } catch {
      /* fall through to memory */
    }
  }
  await memorySet(key, value, ttlSeconds);
};

export const redisDel = async (key: string): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.del(key);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  await memoryDel(key);
};

export const redisTtl = async (key: string): Promise<number> => {
  if (redisClient) {
    try {
      return await redisClient.ttl(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memoryTtl(key);
};

export const redisKeys = async (pattern: string): Promise<string[]> => {
  if (redisClient) {
    try {
      return await redisClient.keys(pattern);
    } catch {
      /* fall through to memory */
    }
  }
  return memoryKeys(pattern);
};

// ------------------------------------------------------------ JSON caching
export const cacheGetJSON = async <T>(key: string): Promise<T | null> => {
  const raw = await redisGet(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const cacheSetJSON = async <T>(key: string, value: T, ttlSeconds: number): Promise<void> => {
  await redisSet(key, JSON.stringify(value), ttlSeconds);
};

export const cacheInvalidate = async (key: string): Promise<void> => {
  await redisDel(key);
};

export const cacheInvalidatePattern = async (pattern: string): Promise<void> => {
  const keys = await redisKeys(pattern);
  await Promise.all(keys.map((k) => redisDel(k)));
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      /* ignore */
    }
  }
};
