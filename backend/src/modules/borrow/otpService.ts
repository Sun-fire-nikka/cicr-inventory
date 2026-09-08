// OTP state management (v1.5.0).
//
// TTL-based: every OTP expires after 10 minutes. The in-memory Map remains the
// synchronous fast path (the unit tests and borrow controller call these
// synchronously); when REDIS_URL is configured the same TTL state is mirrored
// to Redis keys (`cicr:otp:<sha256(otp)>`, EXPIRE 600s) so state survives
// across instances and restarts.
import crypto from 'crypto';
import { isRedisEnabled, redisClient } from '../../config/redis';

export interface OTPPayload {
  userId: string;
  userName: string;
  userEmail: string;
  itemId: string;
  quantity: number;
  purpose: string;
  durationDays: number;
  adminId: string;
}

export interface StoredOTP extends OTPPayload {
  expiresAt: number;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_SECONDS = Math.floor(OTP_TTL_MS / 1000);
const OTP_PREFIX = 'cicr:otp:';

const store = new Map<string, StoredOTP>();

export const generateOtp = (): string => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp: string): string => crypto.createHash('sha256').update(otp).digest('hex');

const keyFor = (otp: string): string => OTP_PREFIX + hashOtp(otp);

export const storeOtp = (otp: string, payload: OTPPayload): void => {
  const key = keyFor(otp);
  const entry: StoredOTP = { ...payload, expiresAt: Date.now() + OTP_TTL_MS };
  store.set(key, entry);
  if (isRedisEnabled && redisClient) {
    redisClient.set(key, JSON.stringify(entry), 'EX', OTP_TTL_SECONDS).catch(() => {});
  }
};

export const verifyOtp = (otp: string): StoredOTP | null => {
  const key = keyFor(otp);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
};

export const consumeOtp = (otp: string): void => {
  const key = keyFor(otp);
  store.delete(key);
  if (isRedisEnabled && redisClient) {
    redisClient.del(key).catch(() => {});
  }
};

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 60 * 1000).unref();
