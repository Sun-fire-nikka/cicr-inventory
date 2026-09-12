// Health monitoring and keep-alive (v2.0.0).
//
// Periodically pings primary (and replica) to:
// 1. Detect failures early (before requests fail)
// 2. Keep Neon compute warm (prevent scale-to-zero cold starts)
// 3. Track consecutive failures for failover decisions
//
// When primary failure is confirmed (threshold exceeded) and a healthy
// replica exists, triggers the failover state machine.
import {
  isNeonConfigured,
  isReplicaConfigured,
  checkPrimaryHealth,
  checkReplicaHealth,
  healthState,
  closeNeonPools,
} from './neonPool';
import { triggerFailover, getFailoverPhase, getWriteBufferLength } from './failover';

// ------------------------------------------------------------ configuration
const DEFAULT_CHECK_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes (Neon scales to zero after 5)
const DEFAULT_FAILURE_THRESHOLD = 3;               // consecutive failures before reporting unhealthy

export interface MonitorConfig {
  checkIntervalMs: number;
  failureThreshold: number;
}

function resolveConfig(): MonitorConfig {
  const interval = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '', 10);
  const threshold = parseInt(process.env.HEALTH_FAILURE_THRESHOLD || '', 10);
  return {
    checkIntervalMs: Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_CHECK_INTERVAL_MS,
    failureThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_FAILURE_THRESHOLD,
  };
}

// ------------------------------------------------------------ monitor state
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let monitorConfig = resolveConfig();

// ------------------------------------------------------------ check cycle
async function runHealthCycle(): Promise<void> {
  if (!isNeonConfigured()) return;

  const primaryOk = await checkPrimaryHealth();
  const replicaOk = await checkReplicaHealth();

  // Log state transitions
  if (!primaryOk && healthState.primaryConsecutiveFailures === monitorConfig.failureThreshold) {
    console.error(
      `[HEALTH] Primary marked UNHEALTHY after ${monitorConfig.failureThreshold} consecutive failures`,
    );
  }

  if (primaryOk && healthState.primary === 'healthy') {
    // Recovery after failures
    if (healthState.failoverState === 'DEGRADED' || healthState.failoverState === 'BOTH_DOWN') {
      console.log('[HEALTH] Primary recovered — state transitions to HEALTHY');
      healthState.failoverState = 'HEALTHY';
    }
  }

  if (!primaryOk && replicaOk) {
    if (healthState.failoverState === 'HEALTHY') {
      console.warn('[HEALTH] Primary down, replica up — state transitions to DEGRADED');
      healthState.failoverState = 'DEGRADED';
    }
    // Trigger failover if threshold exceeded and no promotion already in progress
    if (
      healthState.primaryConsecutiveFailures >= monitorConfig.failureThreshold &&
      getFailoverPhase() === 'IDLE'
    ) {
      console.warn('[HEALTH] Failure threshold exceeded — triggering failover');
      triggerFailover().catch((err) => {
        console.error('[HEALTH] Failover trigger failed:', err.message);
      });
    }
  }

  if (!primaryOk && !replicaOk) {
    if (healthState.failoverState !== 'BOTH_DOWN') {
      console.error('[HEALTH] Both primary and replica down — state transitions to BOTH_DOWN');
      healthState.failoverState = 'BOTH_DOWN';
    }
  }
}

// ------------------------------------------------------------ lifecycle
export function startHealthMonitor(): void {
  if (!isNeonConfigured()) {
    console.log('[HEALTH] Neon not configured — health monitor not started');
    return;
  }

  monitorConfig = resolveConfig();

  if (monitorTimer) {
    clearInterval(monitorTimer);
  }

  // Run first check immediately (async, non-blocking)
  runHealthCycle().catch((err) => {
    console.error('[HEALTH] Initial health check failed:', err.message);
  });

  monitorTimer = setInterval(() => {
    runHealthCycle().catch((err) => {
      console.error('[HEALTH] Health check cycle failed:', err.message);
    });
  }, monitorConfig.checkIntervalMs);

  // Allow process to exit even if timer is running
  if (monitorTimer && typeof monitorTimer === 'object' && 'unref' in monitorTimer) {
    monitorTimer.unref();
  }

  console.log(`[HEALTH] Monitor started (interval: ${monitorConfig.checkIntervalMs}ms, threshold: ${monitorConfig.failureThreshold})`);
}

export function stopHealthMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

// --------------------------------------------------- health endpoint payload
export interface HealthPayload {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  timestamp: string;
  neon: {
    configured: boolean;
    primary: string;
    replica: string;
  };
  database: {
    primary: string;
    replica: string;
    failoverState: string;
    failoverPhase: string;
    writeBufferLength: number;
    primaryConsecutiveFailures: number;
    lastPrimaryCheck: string | null;
    lastReplicaCheck: string | null;
  };
}

export function buildHealthPayload(): HealthPayload {
  const neonConfigured = isNeonConfigured();
  const primaryHealthy = healthState.primary === 'healthy';
  const replicaHealthy = healthState.replica === 'healthy';

  let status: HealthPayload['status'];
  let message: string;

  if (neonConfigured && primaryHealthy) {
    status = 'healthy';
    message = 'CICR Inventory API is live!';
  } else if (neonConfigured && !primaryHealthy && replicaHealthy) {
    status = 'degraded';
    message = 'Primary database unavailable — serving from replica';
  } else if (neonConfigured && !primaryHealthy && !replicaHealthy) {
    status = 'unhealthy';
    message = 'All database endpoints unavailable';
  } else {
    // Neon not configured — legacy mode, always healthy
    status = 'healthy';
    message = 'CICR Inventory API is live!';
  }

  return {
    status,
    message,
    timestamp: new Date().toISOString(),
    neon: {
      configured: neonConfigured,
      primary: healthState.currentPrimaryHost || '(not configured)',
      replica: healthState.currentReplicaHost || '(not configured)',
    },
    database: {
      primary: healthState.primary,
      replica: healthState.replica,
      failoverState: healthState.failoverState,
      failoverPhase: getFailoverPhase(),
      writeBufferLength: getWriteBufferLength(),
      primaryConsecutiveFailures: healthState.primaryConsecutiveFailures,
      lastPrimaryCheck: healthState.lastPrimaryCheck?.toISOString() || null,
      lastReplicaCheck: healthState.lastReplicaCheck?.toISOString() || null,
    },
  };
}

// Export for graceful shutdown
export { closeNeonPools };
