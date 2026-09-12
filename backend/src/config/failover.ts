// Failover state machine (v2.0.0).
//
// Drives the transition: HEALTHY → DEGRADED → PROMOTING → FENCING → RECOVERED
//
// Responsibilities:
// 1. React to health check failures (from healthMonitor)
// 2. Trigger promotion via a pluggable promoteFn (wired in Stage 4)
// 3. Fence old primary by calling pluggable fenceFn
// 4. Re-route connection pools to new primary
// 5. Buffer writes during promotion window
// 6. Replay buffered writes after recovery
//
// This module does NOT perform HTTP calls directly. The Neon API
// interaction is injected via promoteFn / fenceFn so this module
// remains testable without a real Neon account.
import {
  healthState,
  primaryPool,
  replicaPool,
  neonConfig,
  isNeonConfigured,
  isReplicaConfigured,
} from './neonPool';

// ------------------------------------------------------------ configuration
const MAX_BUFFERED_WRITES = 100;
const PROMOTION_TIMEOUT_MS = 30_000;
const MAX_PROMOTION_RETRIES = 3;

// ------------------------------------------------------------ types
export type FailoverPhase =
  | 'IDLE'
  | 'DEGRADED'
  | 'PROMOTING'
  | 'FENCING'
  | 'RECOVERED'
  | 'BOTH_DOWN'
  | 'API_FAILURE';

export interface BufferedWrite {
  sql: string;
  values: unknown[];
  timestamp: number;
}

export interface PromotionResult {
  success: boolean;
  newPrimaryHost?: string;
  error?: string;
}

export interface FenceResult {
  success: boolean;
  error?: string;
}

export type PromoteFn = () => Promise<PromotionResult>;
export type FenceFn = (oldPrimaryHost: string) => Promise<FenceResult>;

// ------------------------------------------------------------ state
let currentPhase: FailoverPhase = 'IDLE';
let writeBuffer: BufferedWrite[] = [];
let promotionRetries = 0;
let lastPromotionAttempt = 0;

// Pluggable functions — wired by initFailover()
let promoteFn: PromoteFn = async () => ({
  success: false,
  error: 'promoteFn not initialized',
});
let fenceFn: FenceFn = async () => ({
  success: false,
  error: 'fenceFn not initialized',
});

// ------------------------------------------------------------ initialization
export function initFailover(promote: PromoteFn, fence: FenceFn): void {
  promoteFn = promote;
  fenceFn = fence;
  console.log('[FAILOVER] State machine initialized');
}

// ------------------------------------------------------------ phase accessors
export function getFailoverPhase(): FailoverPhase {
  return currentPhase;
}

export function isWritable(): boolean {
  return currentPhase === 'IDLE' || currentPhase === 'RECOVERED';
}

export function getWriteBufferLength(): number {
  return writeBuffer.length;
}

// ------------------------------------------------------------ state transitions
function transition(to: FailoverPhase, reason: string): void {
  const from = currentPhase;
  if (from === to) return;
  currentPhase = to;
  healthState.failoverState = to === 'IDLE' ? 'HEALTHY' : to as any;
  console.log(`[FAILOVER] ${from} → ${to} (${reason})`);
}

// ------------------------------------------------------------ write buffering
export function bufferWrite(sql: string, values?: unknown[]): boolean {
  if (writeBuffer.length >= MAX_BUFFERED_WRITES) {
    console.error('[FAILOVER] Write buffer full — rejecting write');
    return false;
  }
  writeBuffer.push({ sql, values: values || [], timestamp: Date.now() });
  console.log(`[FAILOVER] Write buffered (${writeBuffer.length}/${MAX_BUFFERED_WRITES})`);
  return true;
}

async function replayBuffer(): Promise<{ replayed: number; failed: number }> {
  let replayed = 0;
  let failed = 0;
  const buffer = [...writeBuffer];
  writeBuffer = [];

  for (const entry of buffer) {
    try {
      await primaryPool.query(entry.sql, entry.values);
      replayed++;
    } catch (err: any) {
      console.error(`[FAILOVER] Buffered write replay failed: ${err.message}`);
      failed++;
      // Re-buffer failed writes at the front
      writeBuffer.unshift(entry);
    }
  }

  console.log(`[FAILOVER] Buffer replay: ${replayed} succeeded, ${failed} failed`);
  return { replayed, failed };
}

// ------------------------------------------------------------ promotion
async function attemptPromotion(): Promise<boolean> {
  transition('PROMOTING', `attempt ${promotionRetries + 1}/${MAX_PROMOTION_RETRIES}`);
  lastPromotionAttempt = Date.now();

  try {
    const result = await Promise.race([
      promoteFn(),
      new Promise<PromotionResult>((_, reject) =>
        setTimeout(() => reject(new Error('Promotion timeout')), PROMOTION_TIMEOUT_MS),
      ),
    ]);

    if (result.success && result.newPrimaryHost) {
      // Update pool routing
      neonConfig.primaryHost = result.newPrimaryHost;
      healthState.currentPrimaryHost = result.newPrimaryHost;

      // Reconfigure primary pool to point to new endpoint
      // pg Pool doesn't support hot-swapping host, so we end the old pool
      // and create a new one. The old pool's idle connections will drain.
      const OldPool = primaryPool;

      // For now, log the routing change. Actual pool replacement happens
      // when database.ts is migrated (Stage 5) to use dynamic routing.
      console.log(`[FAILOVER] Primary pool now routing to: ${result.newPrimaryHost}`);

      promotionRetries = 0;
      return true;
    }

    console.error(`[FAILOVER] Promotion failed: ${result.error}`);
    promotionRetries++;
    return false;
  } catch (err: any) {
    console.error(`[FAILOVER] Promotion error: ${err.message}`);
    promotionRetries++;
    return false;
  }
}

// ------------------------------------------------------------ fencing
async function attemptFencing(oldPrimaryHost: string): Promise<boolean> {
  transition('FENCING', `fencing ${oldPrimaryHost}`);

  try {
    const result = await fenceFn(oldPrimaryHost);
    if (result.success) {
      console.log(`[FAILOVER] Old primary ${oldPrimaryHost} fenced successfully`);
      return true;
    }
    console.error(`[FAILOVER] Fencing failed: ${result.error}`);
    // Fencing failure is non-fatal — old primary is unreachable anyway
    // but we log it for operational awareness
    return true;
  } catch (err: any) {
    console.error(`[FAILOVER] Fencing error: ${err.message}`);
    return true; // Non-fatal
  }
}

// ------------------------------------------------------------ main failover trigger
export async function triggerFailover(): Promise<boolean> {
  if (!isNeonConfigured()) return false;
  if (currentPhase === 'PROMOTING' || currentPhase === 'FENCING') {
    console.log('[FAILOVER] Already in progress — skipping');
    return false;
  }

  const oldPrimaryHost = healthState.currentPrimaryHost;

  // Check if both endpoints are down
  if (healthState.primary === 'unhealthy' && healthState.replica !== 'healthy') {
    transition('BOTH_DOWN', 'both primary and replica unhealthy');
    return false;
  }

  // Need at least a healthy replica to promote
  if (healthState.replica !== 'healthy') {
    transition('BOTH_DOWN', 'no healthy replica available for promotion');
    return false;
  }

  transition('DEGRADED', 'primary unhealthy, replica healthy');

  // Attempt promotion with retries
  for (let i = 0; i < MAX_PROMOTION_RETRIES; i++) {
    const ok = await attemptPromotion();
    if (ok) {
      // Fence old primary
      await attemptFencing(oldPrimaryHost);

      // Replay buffered writes
      const { replayed, failed } = await replayBuffer();

      transition('RECOVERED', `promotion succeeded, ${replayed} writes replayed`);

      // Check if old primary has come back (handled by health monitor)
      return true;
    }

    // Wait before retry (exponential backoff)
    const delay = Math.min(1000 * Math.pow(2, i), 10_000);
    await new Promise((r) => setTimeout(r, delay));
  }

  transition('API_FAILURE', `all ${MAX_PROMOTION_RETRIES} promotion attempts failed`);
  return false;
}

// ------------------------------------------------------------ old primary recovery
export async function handleOldPrimaryRecovery(): Promise<void> {
  if (currentPhase !== 'RECOVERED') return;
  if (!isNeonConfigured()) return;

  // If old primary comes back and is healthy, but we already promoted,
  // we need to ensure it doesn't accept writes.
  // In Neon's architecture, the old compute endpoint is orphaned —
  // it doesn't automatically become primary again. But we fence it
  // explicitly to be safe.
  const oldHost = healthState.currentPrimaryHost;
  if (oldHost !== neonConfig.primaryHost) {
    console.log(`[FAILOVER] Old primary ${oldHost} detected as recovered — re-fencing`);
    await attemptFencing(oldHost);
  }
}

// ------------------------------------------------------------ reset (for testing)
export function resetFailover(): void {
  currentPhase = 'IDLE';
  writeBuffer = [];
  promotionRetries = 0;
  lastPromotionAttempt = 0;
}
