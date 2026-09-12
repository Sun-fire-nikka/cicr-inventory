import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { supabase } from './app';
import { startReminderScheduler } from './services/reminderService';
import { startHealthMonitor, stopHealthMonitor, closeNeonPools } from './config/healthMonitor';
import { initFailover, PromotionResult, FenceResult } from './config/failover';
import { promoteReplica, disableEndpoint, findReadReplica, listEndpoints } from './config/neonApi';
import { isNeonConfigured, neonConfig } from './config/neonPool';
import systemRoutes from './routes/system.routes';

const PORT = process.env.PORT || 5000;

app.use('/api/system', systemRoutes);

// Initialize failover with real Neon API functions
if (isNeonConfigured() && neonConfig.branchId && neonConfig.apiKey && neonConfig.projectId) {
  initFailover(
    async (): Promise<PromotionResult> => {
      const replica = await findReadReplica();
      if (!replica) {
        return { success: false, error: 'No read replica found to promote' };
      }
      const result = await promoteReplica(neonConfig.branchId!);
      if (result.success && result.newEndpoint) {
        return { success: true, newPrimaryHost: result.newEndpoint.host };
      }
      return { success: false, error: result.error };
    },
    async (oldPrimaryHost: string): Promise<FenceResult> => {
      try {
        const endpoints = await listEndpoints();
        const oldEp = endpoints.find(
          (ep) => ep.host === oldPrimaryHost || ep.type === 'read_write',
        );
        if (!oldEp) {
          return { success: true }; // Already gone
        }
        const result = await disableEndpoint(oldEp.id);
        return { success: result.success, error: result.error };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  );
  console.log('[FAILOVER] Neon API client wired for promotion and fencing');
} else {
  initFailover(
    async () => ({ success: false, error: 'Neon API not configured' }),
    async () => ({ success: false, error: 'Neon API not configured' }),
  );
  console.log('[FAILOVER] Neon API not configured — failover will not perform promotion');
}

const server = app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

startReminderScheduler();
startHealthMonitor();

async function testConnection() {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.warn('⚠️ Supabase connection warning:', error.message);
    } else {
      console.log('⚡ Connected to Supabase PostgreSQL successfully!');
    }
  } catch (err: any) {
    console.error('❌ Supabase connection failed:', err.message);
  }
}

testConnection();

// ------------------------------------------------------ graceful shutdown
function gracefulShutdown(signal: string) {
  console.log(`\n[${signal}] Received — shutting down gracefully...`);
  stopHealthMonitor();
  server.close(async () => {
    await closeNeonPools();
    console.log('🛑 Server stopped.');
    process.exit(0);
  });
  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));