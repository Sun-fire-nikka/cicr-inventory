// Idempotency layer (v2.0.0).
//
// Prevents duplicate write execution during failover buffer replay.
// Each buffered write gets a unique key; on replay, already-applied
// keys are skipped.
//
// Design:
// - In-memory Map with TTL expiry (default 5 minutes)
// - Keys are SHA-256 hashes of SQL + values for deterministic dedup
// - Deterministic keys: same SQL + values = same key = dedup
// - Random keys: for truly unique operations that should not dedup
import { createHash, randomBytes } from 'crypto';

// ------------------------------------------------------------ configuration
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TRACKED_KEYS = 10_000;

// ------------------------------------------------------------ types
interface TrackedKey {
  appliedAt: number;
  expiresAt: number;
}

// ------------------------------------------------------------ state
const appliedKeys = new Map<string, TrackedKey>();
let ttlMs = DEFAULT_TTL_MS;

// ------------------------------------------------------------ configuration
export function configureIdempotency(options: { ttlMs?: number }): void {
  if (options.ttlMs !== undefined && options.ttlMs > 0) {
    ttlMs = options.ttlMs;
  }
}

// ------------------------------------------------------------ key generation
export function generateIdempotencyKey(sql: string, values?: unknown[]): string {
  const payload = JSON.stringify({ sql: sql.trim().toUpperCase(), values });
  return createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

export function generateRandomKey(): string {
  const bytes = randomBytes(8);
  return bytes.toString('hex');
}

// ------------------------------------------------------------ tracking
export function markApplied(key: string): void {
  const now = Date.now();
  appliedKeys.set(key, {
    appliedAt: now,
    expiresAt: now + ttlMs,
  });

  // Evict oldest entries if map grows too large
  if (appliedKeys.size > MAX_TRACKED_KEYS) {
    evictExpired();
    // If still over limit after eviction, remove oldest entries
    if (appliedKeys.size > MAX_TRACKED_KEYS) {
      const entries = [...appliedKeys.entries()]
        .sort((a, b) => a[1].appliedAt - b[1].appliedAt);
      const toRemove = entries.slice(0, entries.length - MAX_TRACKED_KEYS);
      for (const [key] of toRemove) {
        appliedKeys.delete(key);
      }
    }
  }
}

export function isApplied(key: string): boolean {
  const entry = appliedKeys.get(key);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    appliedKeys.delete(key);
    return false;
  }

  return true;
}

// ------------------------------------------------------------ cleanup
function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of appliedKeys) {
    if (now > entry.expiresAt) {
      appliedKeys.delete(key);
    }
  }
}

export function startPeriodicCleanup(intervalMs: number = 60_000): NodeJS.Timeout {
  return setInterval(evictExpired, intervalMs);
}

export function clearAll(): void {
  appliedKeys.clear();
}

export function getStats(): { size: number; ttlMs: number } {
  evictExpired();
  return { size: appliedKeys.size, ttlMs };
}
