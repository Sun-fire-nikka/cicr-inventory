// Auth OTP service (v1.6.2).
//
// Generates and verifies OTPs for email-based login.
// Separate from borrow OTP service — stores OTPs keyed by email.
// TTL: 5 minutes. Supports Redis mirroring when REDIS_URL is set.
import crypto from 'crypto';
import { isRedisEnabled, redisClient } from '../../config/redis';

export interface AuthOTPPayload {
  email: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface StoredAuthOTP extends AuthOTPPayload {
  expiresAt: number;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_TTL_SECONDS = Math.floor(OTP_TTL_MS / 1000);
const OTP_PREFIX = 'cicr:auth:otp:';

const store = new Map<string, StoredAuthOTP>();

export const generateAuthOtp = (): string => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp: string): string => crypto.createHash('sha256').update(otp).digest('hex');

const keyFor = (otp: string): string => OTP_PREFIX + hashOtp(otp);

export const storeAuthOtp = (otp: string, payload: AuthOTPPayload): void => {
  const key = keyFor(otp);
  const entry: StoredAuthOTP = { ...payload, expiresAt: Date.now() + OTP_TTL_MS };
  store.set(key, entry);
  if (isRedisEnabled && redisClient) {
    redisClient.set(key, JSON.stringify(entry), 'EX', OTP_TTL_SECONDS).catch(() => {});
  }
};

export const verifyAuthOtp = (otp: string): StoredAuthOTP | null => {
  const key = keyFor(otp);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
};

export const consumeAuthOtp = (otp: string): void => {
  const key = keyFor(otp);
  store.delete(key);
  if (isRedisEnabled && redisClient) {
    redisClient.del(key).catch(() => {});
  }
};

// Cleanup expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 60 * 1000).unref();
