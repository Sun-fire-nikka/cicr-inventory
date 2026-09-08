"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeAuthOtp = exports.verifyAuthOtp = exports.storeAuthOtp = exports.generateAuthOtp = void 0;
// Auth OTP service (v1.6.2).
//
// Generates and verifies OTPs for email-based login.
// Separate from borrow OTP service — stores OTPs keyed by email.
// TTL: 5 minutes. Supports Redis mirroring when REDIS_URL is set.
const crypto_1 = __importDefault(require("crypto"));
const redis_1 = require("../../config/redis");
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_TTL_SECONDS = Math.floor(OTP_TTL_MS / 1000);
const OTP_PREFIX = 'cicr:auth:otp:';
const store = new Map();
const generateAuthOtp = () => crypto_1.default.randomInt(100000, 1000000).toString();
exports.generateAuthOtp = generateAuthOtp;
const hashOtp = (otp) => crypto_1.default.createHash('sha256').update(otp).digest('hex');
const keyFor = (otp) => OTP_PREFIX + hashOtp(otp);
const storeAuthOtp = (otp, payload) => {
    const key = keyFor(otp);
    const entry = { ...payload, expiresAt: Date.now() + OTP_TTL_MS };
    store.set(key, entry);
    if (redis_1.isRedisEnabled && redis_1.redisClient) {
        redis_1.redisClient.set(key, JSON.stringify(entry), 'EX', OTP_TTL_SECONDS).catch(() => { });
    }
};
exports.storeAuthOtp = storeAuthOtp;
const verifyAuthOtp = (otp) => {
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
exports.verifyAuthOtp = verifyAuthOtp;
const consumeAuthOtp = (otp) => {
    const key = keyFor(otp);
    store.delete(key);
    if (redis_1.isRedisEnabled && redis_1.redisClient) {
        redis_1.redisClient.del(key).catch(() => { });
    }
};
exports.consumeAuthOtp = consumeAuthOtp;
// Cleanup expired entries every 60s
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now > entry.expiresAt)
            store.delete(key);
    }
}, 60 * 1000).unref();
