import crypto from 'crypto';

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
const store = new Map<string, StoredOTP>();

export const generateOtp = (): string => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp: string): string => crypto.createHash('sha256').update(otp).digest('hex');

export const storeOtp = (otp: string, payload: OTPPayload): void => {
  store.set(hashOtp(otp), { ...payload, expiresAt: Date.now() + OTP_TTL_MS });
};

export const verifyOtp = (otp: string): StoredOTP | null => {
  const entry = store.get(hashOtp(otp));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(hashOtp(otp));
    return null;
  }
  return entry;
};

export const consumeOtp = (otp: string): void => {
  store.delete(hashOtp(otp));
};

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 60 * 1000).unref();
