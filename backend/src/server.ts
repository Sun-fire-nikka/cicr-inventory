import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { supabase } from './app';
import { startReminderScheduler } from './services/reminderService';
import { startHealthMonitor, stopHealthMonitor, closeNeonPools } from './config/healthMonitor';
import { initFailover } from './config/failover';
import systemRoutes from './routes/system.routes';

const PORT = process.env.PORT || 5000;

app.use('/api/system', systemRoutes);

// Initialize failover with placeholder functions.
// Real Neon API promotion/fencing will be wired in Stage 4.
initFailover(
  async () => ({ success: false, error: 'Neon API not yet wired (Stage 4)' }),
  async () => ({ success: false, error: 'Neon API not yet wired (Stage 4)' }),
);

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