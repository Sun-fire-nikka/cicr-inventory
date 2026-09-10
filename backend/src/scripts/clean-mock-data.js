const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

const SUPERADMIN_EMAILS = [
  'vardaansaxena096@gmail.com',
  'cicrinventory@gmail.com'
];

async function runCleanup() {
  console.log('=== STARTING CICR DATABASE MOCK DATA PURGE ===');

  // 1. Delete all test borrow records
  console.log('1. Clearing test borrow records...');
  const { data: borrows, error: borrowFetchErr } = await supabase.from('borrow_records').select('id');
  if (borrowFetchErr) console.warn('Fetch borrows warning:', borrowFetchErr.message);
  
  if (borrows && borrows.length > 0) {
    const borrowIds = borrows.map(b => b.id);
    const { error: delBorrowErr } = await supabase
      .from('borrow_records')
      .delete()
      .in('id', borrowIds);
    if (delBorrowErr) console.error('Error deleting borrow records:', delBorrowErr);
    else console.log(`Deleted ${borrows.length} test borrow records.`);
  } else {
    console.log('No borrow records to delete.');
  }

  // 2. Reset available_quantity = quantity on all inventory items
  console.log('2. Resetting available_quantity on inventory items...');
  const { data: items, error: itemErr } = await supabase.from('inventory').select('id, name, quantity, available_quantity');
  if (itemErr) {
    console.error('Error fetching items:', itemErr);
  } else if (items) {
    for (const item of items) {
      if (item.available_quantity !== item.quantity) {
        const { error: updateErr } = await supabase
          .from('inventory')
          .update({ available_quantity: item.quantity, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (updateErr) console.error(`Failed to update item ${item.name}:`, updateErr);
        else console.log(`Restored available_quantity for "${item.name}" to ${item.quantity}.`);
      } else {
        console.log(`Item "${item.name}" already has full available stock (${item.quantity}).`);
      }
    }
  }

  // 3. Purge non-admin test users from users table
  console.log('3. Purging non-admin test accounts from users table...');
  const { data: users, error: usersErr } = await supabase.from('users').select('id, email, name');
  if (usersErr) {
    console.error('Error fetching users:', usersErr);
  } else if (users) {
    const testUsers = users.filter(u => !SUPERADMIN_EMAILS.includes(u.email.toLowerCase()));
    console.log(`Found ${testUsers.length} test users to purge:`, testUsers.map(u => `${u.name} (${u.email})`));
    
    for (const tu of testUsers) {
      const { error: delUserErr } = await supabase.from('users').delete().eq('id', tu.id);
      if (delUserErr) console.warn(`Could not delete user ${tu.email} via anon key (likely RLS):`, delUserErr.message);
      else console.log(`Deleted user ${tu.email}.`);
    }
  }

  // 4. Clean old test borrow logs from audit_logs
  console.log('4. Purging test audit logs...');
  const { data: auditLogs, error: auditErr } = await supabase.from('audit_logs').select('id, action, description');
  if (!auditErr && auditLogs) {
    const testLogs = auditLogs.filter(l => 
      l.description?.includes('Testing_') || 
      l.description?.includes('Robo Soccer Prototyping Test')
    );
    if (testLogs.length > 0) {
      const ids = testLogs.map(l => l.id);
      const { error: delAuditErr } = await supabase.from('audit_logs').delete().in('id', ids);
      if (delAuditErr) console.warn('Could not delete test audit logs:', delAuditErr.message);
      else console.log(`Deleted ${testLogs.length} test audit log entries.`);
    }
  }

  console.log('=== DATABASE PURGE COMPLETE ===');
}

runCleanup().catch(err => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
