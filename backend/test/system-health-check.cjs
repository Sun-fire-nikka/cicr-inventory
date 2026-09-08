// System health check for CICR Inventory (v1.4.5 audit):
//   (a) BOTE endpoints — GET /api/system/bote-metrics + GET /api/system/simulate-scale
//   (b) Admin directory (Admin KUSH) + seeded student 'kush' (kushgdhi@gmail.com) + 1-30 day rental cap
//   (c) Live Nodemailer SMTP transport to kushagragargdelhi@gmail.com, logging the SMTP response status code.
//
// This is a diagnostic script (like test-email.cjs) and intentionally does NOT end in
// `.test.cjs`, so `npm test` (glob: test/*.test.cjs) never executes it. It performs live
// database + SMTP calls and registers + cleans up its own test users.
//
// Usage (from backend/):  node test/system-health-check.cjs
const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { default: app, supabase } = require('../dist/app.js');
const systemRoutes = require('../dist/routes/system.routes.js').default;
const { MIN_RENTAL_DAYS, MAX_RENTAL_DAYS, DEFAULT_RENTAL_DAYS } = require('../dist/modules/borrow/borrow.controller.js');

app.use('/api/system', systemRoutes);

const ADMIN_DIRECTORY_EMAIL = 'kushagragargdelhi@gmail.com';
const ADMIN_DIRECTORY_ID = 'kush';
const SEEDED_STUDENT_EMAIL = 'kushgdhi@gmail.com';
const SEEDED_STUDENT_NAME = 'kush';

let server;
let base;
let failures = 0;
let checks = 0;

const results = [];

async function api(p, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + p, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

function check(name, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

async function bestEffortCleanup(createdUserIds, createdItemIds, borrowRecordIds) {
  try {
    const userIds = [...new Set(createdUserIds)];
    if (borrowRecordIds.length) {
      await supabase.from('borrow_records').delete().in('id', borrowRecordIds);
    }
    for (const id of createdItemIds) {
      await supabase.from('inventory').delete().eq('id', id);
    }
    if (userIds.length) {
      await supabase.from('audit_logs').delete().in('user_id', userIds);
      await supabase.from('users').delete().in('id', userIds);
    }
  } catch (e) {
    console.warn('  (best-effort cleanup skipped — RLS may block anonymous deletes):', e.message);
  }
}

async function rentalCapApiCheck(createdUserIds, createdItemIds, borrowRecordIds) {
  const ts = Date.now();
  const adminEmail = `hcheck.admin.${ts}@cicr.test`;
  const memberEmail = `hcheck.member.${ts}@cicr.test`;
  const password = 'TestPass123!';

  // Register temp admin (register accepts role spoofing — see Known Issues) + member
  const adminReg = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Health Admin', email: adminEmail, password, role: 'ADMIN' }
  });
  check('register temp admin (role ADMIN)', adminReg.status === 201, `status=${adminReg.status}`);
  createdUserIds.push(adminReg.json?.data?.id);

  const memberReg = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Health Member', email: memberEmail, password, roll_number: 'HEALTH-1' }
  });
  check('register temp member', memberReg.status === 201, `status=${memberReg.status}`);
  createdUserIds.push(memberReg.json?.data?.id);

  const adminLogin = await api('/api/auth/login', { method: 'POST', body: { email: adminEmail, password } });
  check('login temp admin', adminLogin.status === 200, `status=${adminLogin.status}`);
  const memberLogin = await api('/api/auth/login', { method: 'POST', body: { email: memberEmail, password } });
  check('login temp member', memberLogin.status === 200, `status=${memberLogin.status}`);
  const adminToken = adminLogin.json?.token;
  const memberToken = memberLogin.json?.token;

  const item = await api('/api/items', {
    method: 'POST', token: adminToken,
    body: { name: 'Health-Check-Arduino', category: 'Controllers', location: 'Health Rack', quantity: 20 }
  });
  check('create temp item', item.status === 201, `status=${item.status}`);
  createdItemIds.push(item.json?.data?.id);
  const itemId = item.json?.data?.id;

  const mkBorrow = (durationDays) =>
    api('/api/borrow', {
      method: 'POST', token: memberToken,
      body: { inventory_id: itemId, quantity: 1, purpose: 'health check', duration_days: durationDays }
    });

  const overCap = await mkBorrow(31);
  check('rental cap: duration_days=31 rejected (400)', overCap.status === 400, `status=${overCap.status} msg=${overCap.json?.message}`);

  const underMin = await mkBorrow(0);
  check('rental cap: duration_days=0 rejected (400)', underMin.status === 400, `status=${underMin.status} msg=${underMin.json?.message}`);

  const minDay = await mkBorrow(MIN_RENTAL_DAYS);
  check(`rental cap: duration_days=${MIN_RENTAL_DAYS} accepted (201)`, minDay.status === 201, `status=${minDay.status}`);
  if (minDay.json?.data?.id) borrowRecordIds.push(minDay.json.data.id);

  const maxDay = await mkBorrow(MAX_RENTAL_DAYS);
  check(`rental cap: duration_days=${MAX_RENTAL_DAYS} accepted (201)`, maxDay.status === 201, `status=${maxDay.status}`);
  if (maxDay.json?.data?.id) borrowRecordIds.push(maxDay.json.data.id);
}

async function liveSmtpTest() {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  const recipient = ADMIN_DIRECTORY_EMAIL;
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  if (!smtpUser || !smtpPass) {
    check(`live SMTP transport to ${recipient}`, false, 'SMTP_USER/SMTP_PASS not configured — transport would run in mock mode');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    auth: { user: smtpUser, pass: smtpPass }
  });

  const info = await transporter.sendMail({
    from: `"CICR Lab Admin" <${smtpUser}>`,
    to: recipient,
    subject: `[CICR Inventory] System Health Check (v1.4.5) OTP: ${otp}`,
    text: `Health check live-SMTP probe.\nOTP: ${otp} (valid 10 min).\nThis email confirms Nodemailer transport from ${smtpUser} to ${recipient}.`,
    html: `<h3>CICR Inventory — System Health Check</h3><p>Live Nodemailer SMTP probe (v1.4.5).</p><p><strong>OTP:</strong> ${otp}</p>`
  });

  const statusCode = String(info?.response || '').split(' ')[0] || 'n/a';
  console.log(`  SMTP response status code: ${info?.response || statusCode}`);
  console.log(`  accepted=${JSON.stringify(info?.accepted || [])} rejected=${JSON.stringify(info?.rejected || [])}`);
  check(`live SMTP transport to ${recipient}`, statusCode.startsWith('2'), `SMTP ${statusCode} messageId=${info?.messageId}`);
}

(async () => {
  await new Promise((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Booting health check on ${base}\n`);

  const createdUserIds = [];
  const createdItemIds = [];
  const borrowRecordIds = [];

  try {
    // ---- (a) BOTE endpoints ----
    console.log('== (a) BOTE endpoints ==');
    const health = await api('/api/health');
    check('GET /api/health', health.status === 200 && health.json?.status === 'success', `status=${health.status}`);

    const metrics = await api('/api/system/bote-metrics');
    check('GET /api/system/bote-metrics', metrics.status === 200, `status=${metrics.status}`);
    const m = metrics.json?.data;
    check('bote-metrics shape (capacity/peak/latency/memory)', !!m && ['capacity', 'peak', 'latency', 'memory'].every((k) => k in m), `daily_cap=${m?.capacity?.daily_cap} utilization=${m?.capacity?.utilization_pct}%`);
    check('bote-metrics capacity is numeric', m && Number.isFinite(m.capacity.emails_remaining_today), `remaining=${m?.capacity?.emails_remaining_today}`);

    const sim = await api('/api/system/simulate-scale?users=10000&borrowsPerUserPerMonth=2&jobsPerUser=1');
    check('GET /api/system/simulate-scale (10k users)', sim.status === 200, `status=${sim.status}`);
    check('simulate-scale: emails_per_day=1333.3', sim.json?.data?.scenario?.emails_per_day === 1333.3, `got=${sim.json?.data?.scenario?.emails_per_day}`);
    check('simulate-scale: 3 Gmail accounts needed, exceeds cap', sim.json?.data?.gmail_accounts_needed === 3 && sim.json?.data?.exceeds_single_gmail_cap === true, `accounts=${sim.json?.data?.gmail_accounts_needed}`);

    const simBad = await api('/api/system/simulate-scale');
    check('simulate-scale missing users -> 400', simBad.status === 400, `status=${simBad.status}`);

    // ---- (b) Admin directory + seeded student + rental cap ----
    console.log('\n== (b) Admin directory, seeded student, 1-30 day rental cap ==');
    const admins = await api('/api/borrow/admins');
    const kush = admins.json?.data?.find((a) => a.email === ADMIN_DIRECTORY_EMAIL);
    check('GET /api/borrow/admins lists Admin KUSH', admins.status === 200 && !!kush, `found=${!!kush} email=${kush?.email}`);
    check('admin directory has exactly 1 admin', admins.json?.count === 1, `count=${admins.json?.count}`);

    const { data: seeded, error: seededErr } = await supabase
      .from('users').select('id, name, email, role').eq('email', SEEDED_STUDENT_EMAIL).single();
    check(`seeded student '${SEEDED_STUDENT_NAME}' (${SEEDED_STUDENT_EMAIL}) exists`, !seededErr && !!seeded, `found=${!!seeded} role=${seeded?.role}`);
    check(`seeded student role is MEMBER`, seeded?.role === 'MEMBER', `role=${seeded?.role}`);

    check('rental cap constants (MIN=1, MAX=30, DEFAULT=5)', MIN_RENTAL_DAYS === 1 && MAX_RENTAL_DAYS === 30 && DEFAULT_RENTAL_DAYS === 5, `MIN=${MIN_RENTAL_DAYS} MAX=${MAX_RENTAL_DAYS} DEFAULT=${DEFAULT_RENTAL_DAYS}`);

    await rentalCapApiCheck(createdUserIds, createdItemIds, borrowRecordIds);

    // ---- (c) Live SMTP ----
    console.log('\n== (c) Live Nodemailer SMTP transport ==');
    await liveSmtpTest();
  } catch (err) {
    check('script execution', false, err.message);
  } finally {
    await bestEffortCleanup(createdUserIds, createdItemIds, borrowRecordIds);
    server.close();
  }

  console.log(`\n========== System Health Check Summary ==========`);
  results.forEach((r) => console.log(`  ${r.ok ? 'PASS' : 'FAIL'} | ${r.name}`));
  console.log(`  ${checks - failures}/${checks} checks passed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
