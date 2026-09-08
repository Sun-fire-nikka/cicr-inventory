import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { supabase } from './app';
import { startReminderScheduler } from './services/reminderService';
import systemRoutes from './routes/system.routes';
import { startReminderScheduler } from './services/reminderScheduler';

const PORT = process.env.PORT || 5000;

app.use('/api/system', systemRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

startReminderScheduler();

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