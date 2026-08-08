import dotenv from 'dotenv';
dotenv.config();

import app, { supabase } from '../src/app';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

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