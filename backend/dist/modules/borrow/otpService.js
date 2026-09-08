"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeOtp = exports.verifyOtp = exports.storeOtp = exports.generateOtp = void 0;
// OTP state management (v1.5.0).
//
// TTL-based: every OTP expires after 10 minutes. The in-memory Map remains the
// synchronous fast path (the unit tests and borrow controller call these
// synchronously); when REDIS_URL is configured the same TTL state is mirrored
// to Redis keys (`cicr:otp:<sha256(otp)>`, EXPIRE 600s) so state survives
// across instances and restarts.
const crypto_1 = __importDefault(require("crypto"));
const redis_1 = require("../../config/redis");
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_SECONDS = Math.floor(OTP_TTL_MS / 1000);
const OTP_PREFIX = 'cicr:otp:';
const store = new Map();
const generateOtp = () => crypto_1.default.randomInt(100000, 1000000).toString();
exports.generateOtp = generateOtp;
const hashOtp = (otp) => crypto_1.default.createHash('sha256').update(otp).digest('hex');
const keyFor = (otp) => OTP_PREFIX + hashOtp(otp);
const storeOtp = (otp, payload) => {
    const key = keyFor(otp);
    const entry = { ...payload, expiresAt: Date.now() + OTP_TTL_MS };
    store.set(key, entry);
    if (redis_1.isRedisEnabled && redis_1.redisClient) {
        redis_1.redisClient.set(key, JSON.stringify(entry), 'EX', OTP_TTL_SECONDS).catch(() => { });
    }
};
exports.storeOtp = storeOtp;
const verifyOtp = (otp) => {
    const key = keyFor(otp);
    const entry = store.get(key);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
    }
    return entry;
};
exports.verifyOtp = verifyOtp;
const consumeOtp = (otp) => {
    const key = keyFor(otp);
    store.delete(key);
    if (redis_1.isRedisEnabled && redis_1.redisClient) {
        redis_1.redisClient.del(key).catch(() => { });
    }
};
exports.consumeOtp = consumeOtp;
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now > entry.expiresAt)
            store.delete(key);
    }
}, 60 * 1000).unref();
