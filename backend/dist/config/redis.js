"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeRedis = exports.cacheInvalidatePattern = exports.cacheInvalidate = exports.cacheSetJSON = exports.cacheGetJSON = exports.redisKeys = exports.redisTtl = exports.redisDel = exports.redisSet = exports.redisGet = exports.redisClient = exports.isRedisEnabled = exports.REDIS_URL = void 0;
// Redis infrastructure client (v1.5.0).
//
//  * Real Redis (ioredis) when REDIS_URL is set — used for express-session
//    cookie storage, API response caching, and TTL-based OTP state.
//  * In-memory fallback when REDIS_URL is unset — identical async TTL
//    interface, so local dev and the test suite run without a Redis server.
//    Every Redis call is wrapped so a transient connection failure degrades
//    to the in-memory store instead of crashing a request.
const dotenv_1 = __importDefault(require("dotenv"));
const ioredis_1 = __importDefault(require("ioredis"));
// Load env before reading process.env (module may be imported without a caller
// having run dotenv.config() first).
dotenv_1.default.config();
exports.REDIS_URL = process.env.REDIS_URL || '';
exports.isRedisEnabled = exports.REDIS_URL.length > 0;
const memory = new Map();
const memoryGet = async (key) => {
    const entry = memory.get(key);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        memory.delete(key);
        return null;
    }
    return entry.value;
};
const memorySet = async (key, value, ttlSeconds) => {
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER;
    memory.set(key, { value, expiresAt });
};
const memoryDel = async (key) => {
    memory.delete(key);
};
const memoryTtl = async (key) => {
    const entry = memory.get(key);
    if (!entry)
        return -2;
    if (Date.now() > entry.expiresAt) {
        memory.delete(key);
        return -2;
    }
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
};
const memoryKeys = async (pattern) => {
    const regex = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return [...memory.keys()].filter((k) => regex.test(k));
};
// ------------------------------------------------------------------ ioredis
exports.redisClient = exports.isRedisEnabled
    ? new ioredis_1.default(exports.REDIS_URL, { enableReadyCheck: false, maxRetriesPerRequest: 1 })
    : null;
if (exports.redisClient) {
    exports.redisClient.on('error', (err) => {
        console.warn('[REDIS] connection error (falling back to in-memory store):', err.message);
    });
    exports.redisClient.on('ready', () => {
        console.log('⚡ Connected to Redis at ' + exports.REDIS_URL.replace(/\/\/.*@/, '//***@'));
    });
}
// ------------------------------------------------------------------- public
const redisGet = async (key) => {
    if (exports.redisClient) {
        try {
            return await exports.redisClient.get(key);
        }
        catch {
            /* fall through to memory */
        }
    }
    return memoryGet(key);
};
exports.redisGet = redisGet;
const redisSet = async (key, value, ttlSeconds) => {
    if (exports.redisClient) {
        try {
            if (ttlSeconds && ttlSeconds > 0) {
                await exports.redisClient.set(key, value, 'EX', ttlSeconds);
            }
            else {
                await exports.redisClient.set(key, value);
            }
            return;
        }
        catch {
            /* fall through to memory */
        }
    }
    await memorySet(key, value, ttlSeconds);
};
exports.redisSet = redisSet;
const redisDel = async (key) => {
    if (exports.redisClient) {
        try {
            await exports.redisClient.del(key);
            return;
        }
        catch {
            /* fall through to memory */
        }
    }
    await memoryDel(key);
};
exports.redisDel = redisDel;
const redisTtl = async (key) => {
    if (exports.redisClient) {
        try {
            return await exports.redisClient.ttl(key);
        }
        catch {
            /* fall through to memory */
        }
    }
    return memoryTtl(key);
};
exports.redisTtl = redisTtl;
const redisKeys = async (pattern) => {
    if (exports.redisClient) {
        try {
            return await exports.redisClient.keys(pattern);
        }
        catch {
            /* fall through to memory */
        }
    }
    return memoryKeys(pattern);
};
exports.redisKeys = redisKeys;
// ------------------------------------------------------------ JSON caching
const cacheGetJSON = async (key) => {
    const raw = await (0, exports.redisGet)(key);
    if (raw === null)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
};
exports.cacheGetJSON = cacheGetJSON;
const cacheSetJSON = async (key, value, ttlSeconds) => {
    await (0, exports.redisSet)(key, JSON.stringify(value), ttlSeconds);
};
exports.cacheSetJSON = cacheSetJSON;
const cacheInvalidate = async (key) => {
    await (0, exports.redisDel)(key);
};
exports.cacheInvalidate = cacheInvalidate;
const cacheInvalidatePattern = async (pattern) => {
    const keys = await (0, exports.redisKeys)(pattern);
    await Promise.all(keys.map((k) => (0, exports.redisDel)(k)));
};
exports.cacheInvalidatePattern = cacheInvalidatePattern;
const closeRedis = async () => {
    if (exports.redisClient) {
        try {
            await exports.redisClient.quit();
        }
        catch {
            /* ignore */
        }
    }
};
exports.closeRedis = closeRedis;
