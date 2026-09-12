const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ADMIN_EMAILS = ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com'];

async function run() {
  console.log('--- Cleaning Supabase tables ---');

  // 1. Delete all borrow_records
  const { error: bErr } = await supabase
    .from('borrow_records')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('1. borrow_records cleared:', bErr ? bErr.message : 'OK');

  // 2. Delete all audit_logs
  const { error: aErr } = await supabase
    .from('audit_logs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('2. audit_logs cleared:', aErr ? aErr.message : 'OK');

  // 3. Delete non-admin users
  const { data: users, error: uFetchErr } = await supabase
    .from('users')
    .select('id, email');
  
  if (users) {
    const nonAdminUserIds = users
      .filter(u => !ADMIN_EMAILS.includes(u.email.toLowerCase()))
      .map(u => u.id);
    
    if (nonAdminUserIds.length > 0) {
      const { error: uDelErr } = await supabase
        .from('users')
        .delete()
        .in('id', nonAdminUserIds);
      console.log(`3. Deleted ${nonAdminUserIds.length} non-admin users:`, uDelErr ? uDelErr.message : 'OK');
    } else {
      console.log('3. No non-admin users found to delete.');
    }
  }

  // 4. Reset inventory if needed or keep clean
  // Let's check remaining users
  const { data: finalUsers } = await supabase.from('users').select('id, name, email, role');
  console.log('Final remaining users in database:', finalUsers);

  // 5. Clean local user approval and hardware request files
  const approvalFile = path.join(__dirname, '../user_approval_data.json');
  const cleanApproval = {
    approvalState: {
      "vardaansaxena096@gmail.com": {
        status: "APPROVED",
        role: "ADMIN",
        approvedAt: "2026-09-08T00:00:00.000Z",
        approvedBy: "SYSTEM"
      },
      "cicrinventory@gmail.com": {
        status: "APPROVED",
        role: "ADMIN",
        approvedAt: "2026-09-08T00:00:00.000Z",
        approvedBy: "SYSTEM"
      }
    },
    purgedEmails: []
  };
  fs.writeFileSync(approvalFile, JSON.stringify(cleanApproval, null, 2), 'utf-8');
  console.log('4. user_approval_data.json reset to only the 2 admins.');

  const hardwareReqFile = path.join(__dirname, '../hardware_requests_data.json');
  fs.writeFileSync(hardwareReqFile, JSON.stringify({}, null, 2), 'utf-8');
  console.log('5. hardware_requests_data.json reset.');
}

run().catch(console.error);
