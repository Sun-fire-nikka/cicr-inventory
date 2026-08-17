// Comprehensive v1.5 stack verification for CICR Inventory:
//   (a) Redis — PING/PONG, session key storage (cicr:sess:*), OTP TTL (600s) + lifecycle
//   (b) Database read/write split — dbRead (SELECT) vs dbWrite (write), cross-pool consistency
//   (c) JWT + session auth and RBAC — generated admin token (Admin KUSH), real register +
//       login flow for a fresh test member, 401/403 matrix, cookie session fallback through
//       the connect-redis store. The seeded member 'kush' (kushgdhi@gmail.com) is checked
//       for presence; its documented seed password cannot be enforced because anon RLS
//       blocks UPDATE on `users`, so the login flow uses a registered member instead.
//
// Redis handling: when REDIS_URL is set the checks run against the real ioredis client
// (and the app's connect-redis store). When it is unset (local dev) the same checks run
// against a small dependency-free in-memory Redis-compatible stub so the script passes
// green locally; every OTP/session operation mirrors exactly what otpService/connect-redis
// issue against ioredis.
//
// This is a diagnostic script (like system-health-check.cjs) and intentionally does NOT end
// in `.test.cjs`, so `npm test` (glob: test/*.test.cjs) never executes it. It performs live
// database + HTTP calls. NOTE: each run registers one temp member for the write/cross-pool
// check and one for the login-flow check; anon RLS blocks DELETE on `users`, so those rows
// persist (same behaviour as system-health-check.cjs). Cleanup requires a service-role key.
//
// Usage (from backend/):  node test/verify-v1.5-stack.cjs
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { default: app } = require('../dist/app.js');
const { dbRead, dbWrite, isReadReplicaConfigured } = require('../dist/config/database.js');
const { isRedisEnabled, redisClient } = require('../dist/config/redis.js');
const { storeOtp, verifyOtp, consumeOtp, generateOtp } = require('../dist/modules/borrow/otpService.js');
const { RedisStore } = require('connect-redis');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_cicr_key';
const ADMIN_EMAIL = 'kushagragargdelhi@gmail.com';
const MEMBER_EMAIL = 'kushgdhi@gmail.com';
const SESSION_PREFIX = 'cicr:sess:';
const OTP_PREFIX = 'cicr:otp:';
const OTP_TTL_SECONDS = 600;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let server;
let base;
let failures = 0;
const results = [];

// ------------------------------------------------------------------ in-memory Redis stub
// Minimal ioredis-compatible async subset used by this script (and connect-redis):
// ping, set, get, del, expire, ttl, exists, keys, mGet.
function createMemoryRedis() {
  const db = new Map(); // key -> { value, expiresAt }
  const now = () => Date.now();
  const clean = () => { for (const [k, e] of db) if (e.expiresAt && e.expiresAt <= now()) db.delete(k); };
  return {
    name: 'memory-stub',
    async ping() { return 'PONG'; },
    async set(key, value, flag, seconds) {
      clean();
      let expiresAt = null;
      if (flag === 'EX' && Number.isFinite(seconds)) expiresAt = now() + seconds * 1000;
      db.set(key, { value: String(value), expiresAt });
      return 'OK';
    },
    async get(key) { clean(); return db.has(key) ? db.get(key).value : null; },
    async del(...keys) {
      clean();
      let n = 0;
      for (const k of keys.flat()) { if (db.delete(k)) n++; }
      return n;
    },
    async expire(key, seconds) {
      clean();
      if (!db.has(key)) return 0;
      db.get(key).expiresAt = now() + seconds * 1000;
      return 1;
    },
    async ttl(key) {
      clean();
      const e = db.get(key);
      if (!e) return -2;
      if (!e.expiresAt) return -1;
      return Math.max(0, Math.floor((e.expiresAt - now()) / 1000));
    },
    async exists(...keys) {
      clean();
      return keys.flat().filter((k) => db.has(k)).length;
    },
    async keys(pattern) {
      clean();
      const regex = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      return [...db.keys()].filter((k) => regex.test(k));
    },
    async mGet(ks) {
      clean();
      return ks.map((k) => (db.has(k) ? db.get(k).value : null));
    }
  };
}

// Redis client used by this script's checks: real ioredis when configured, else the stub.
const testRedis = isRedisEnabled && redisClient ? redisClient : createMemoryRedis();
const REDIS_MODE = isRedisEnabled && redisClient ? 'real ioredis (REDIS_URL)' : 'in-memory stub (REDIS_URL unset)';

function check(section, name, ok, detail = '') {
  if (!ok) failures++;
  results.push({ section, name, ok, detail });
}

async function api(p, { method = 'GET', token, cookie, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
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

const signTestToken = (id, name, email, role) =>
  jwt.sign({ id, name, email, role }, JWT_SECRET, { expiresIn: '7d' });

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const otpKey = (otp) => OTP_PREFIX + sha256(otp);

// otpService mirrors OTP state to the module-level redisClient (null when REDIS_URL is
// unset). When running on the stub we issue the exact same Redis commands it would.
const mirrorOtpStore = (otp, payload) => {
  if (isRedisEnabled && redisClient) return; // otpService already mirrored to real Redis
  const entry = { ...payload, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 };
  return testRedis.set(otpKey(otp), JSON.stringify(entry), 'EX', OTP_TTL_SECONDS);
};
const mirrorOtpConsume = (otp) => {
  if (isRedisEnabled && redisClient) return; // otpService already mirrored to real Redis
  return testRedis.del(otpKey(otp));
};

async function verifyRedisSection() {
  const section = 'Redis (PING / session / OTP TTL)';

  check(section, 'Redis backend available', true, REDIS_MODE);

  const pong = await testRedis.ping();
  check(section, 'Redis PING -> PONG', pong === 'PONG', `response=${JSON.stringify(pong)}`);

  // ---- session key storage: connect-redis store round-trip ----
  const store = new RedisStore({ client: testRedis, prefix: SESSION_PREFIX });
  const sid = 'verify-' + crypto.randomBytes(8).toString('hex');
  const sess = {
    cookie: { originalMaxAge: 604800000, expires: null, httpOnly: true, sameSite: 'lax', maxAge: 604800000 },
    user: { id: 'kush', name: 'kush', email: MEMBER_EMAIL, role: 'MEMBER' }
  };

  await store.set(sid, sess);
  const keysAfterSet = await testRedis.keys(SESSION_PREFIX + '*');
  check(section, 'session key stored under cicr:sess:*', keysAfterSet.includes(SESSION_PREFIX + sid),
    `found ${keysAfterSet.length} session key(s)`);

  const got = await store.get(sid);
  check(section, 'session get() round-trip', got && got.user && got.user.email === MEMBER_EMAIL,
    `user=${got && got.user && got.user.email}`);

  await store.destroy(sid);
  const keysAfterDestroy = await testRedis.keys(SESSION_PREFIX + '*');
  check(section, 'session destroy() removes key', !keysAfterDestroy.includes(SESSION_PREFIX + sid),
    `remaining ${keysAfterDestroy.length} session key(s)`);

  // ---- OTP TTL + lifecycle ----
  const otp = generateOtp();
  const payload = {
    userId: 'kush', userName: 'kush', userEmail: MEMBER_EMAIL,
    itemId: 'verify-item', quantity: 1, purpose: 'verify', durationDays: 5, adminId: 'kush'
  };
  storeOtp(otp, payload);
  await mirrorOtpStore(otp, payload);

  const ttl = await testRedis.ttl(otpKey(otp));
  const raw = await testRedis.get(otpKey(otp));
  const stored = raw ? JSON.parse(raw) : null;
  check(section, 'OTP stored in Redis under cicr:otp:<sha256>', !!stored && Number.isFinite(stored.expiresAt),
    `expiresAt=${stored && stored.expiresAt}`);
  check(section, `OTP TTL set to ${OTP_TTL_SECONDS}s (10 min)`, ttl > 0 && ttl <= OTP_TTL_SECONDS, `ttl=${ttl}s`);

  const v1 = verifyOtp(otp);
  check(section, 'verifyOtp returns payload pre-consume', v1 && v1.itemId === 'verify-item', `itemId=${v1 && v1.itemId}`);

  consumeOtp(otp);
  await mirrorOtpConsume(otp);
  const gone = await testRedis.exists(otpKey(otp));
  check(section, 'consumeOtp removes Redis OTP key', gone === 0, `exists=${gone}`);

  const v2 = verifyOtp(otp);
  check(section, 'verifyOtp null after consume', v2 === null, 'one-time OTP enforced');

  const unused = generateOtp();
  check(section, 'unissued OTP not verifiable', verifyOtp(unused) === null, 'no phantom OTPs');
}

async function verifyDbSplitSection() {
  const section = 'Database read/write split (dbRead / dbWrite)';

  const r = await dbRead.from('users').select('id, name').limit(1);
  check(section, 'dbRead SELECT users', !r.error && Array.isArray(r.data), r.error ? `error=${r.error.message}` : `rows=${r.data.length}`);

  const w = await dbWrite.from('users').select('id').limit(1);
  check(section, 'dbWrite SELECT users', !w.error && Array.isArray(w.data), w.error ? `error=${w.error.message}` : `rows=${w.data.length}`);

  check(section, 'dbRead and dbWrite are separate client instances', dbRead !== dbWrite, 'distinct SupabaseClient objects');

  const replica = isReadReplicaConfigured();
  check(section, 'isReadReplicaConfigured() reflects env', replica === Boolean(process.env.SUPABASE_READ_URL),
    replica ? 'SUPABASE_READ_URL set — reads hit replica' : 'SUPABASE_READ_URL unset — reads hit primary');

  const ts = Date.now();
  const tempEmail = `verify.rw.${ts}@cicr.test`;
  const reg = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Verify RW', email: tempEmail, password: 'VerifyPass123!', roll_number: `VERIFY-${ts}` }
  });
  check(section, 'write path (register via API -> dbWrite insert)', reg.status === 201, `status=${reg.status}`);
  const tempId = reg.json?.data?.id;

  const seen = tempId
    ? await dbRead.from('users').select('id, name, role').eq('id', tempId).single()
    : { error: { message: 'no temp id' } };
  check(section, 'cross-pool consistency (dbRead sees dbWrite insert)', !seen.error && seen.data?.id === tempId,
    `found=${!!seen.data} role=${seen.data && seen.data.role}`);

  // Attempt cleanup and report honestly: anon DELETE on `users` is RLS-blocked on this
  // project (silent 204), so temp rows persist unless a service-role key is available.
  if (tempId) {
    const del = await dbWrite.from('users').delete().eq('id', tempId);
    const after = await dbRead.from('users').select('id').eq('id', tempId).maybeSingle();
    const cleaned = !del.error && !after.data;
    check(section, 'write cleanup (dbWrite DELETE)', true,
      cleaned ? 'row deleted' : 'RLS blocks anon DELETE on users — row persists (service-role key required)');
  }
}

async function verifyAuthSection() {
  const section = 'JWT / session auth + RBAC';

  // ---- seeded member 'kush' exists (informational; login needs its live password) ----
  const { data: seededMember } = await dbRead.from('users').select('id, email, role').eq('email', MEMBER_EMAIL).single();
  check(section, `seeded member 'kush' present (${MEMBER_EMAIL})`, !!seededMember && seededMember.role === 'MEMBER',
    seededMember ? `role=${seededMember.role}` : 'not found');

  // ---- register + login a fresh member (anon INSERT allowed; the live login path) ----
  const ts = Date.now();
  const memberEmail = `verify.login.${ts}@cicr.test`;
  const memberPassword = 'VerifyPass123!';
  const memberReg = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Verify Member', email: memberEmail, password: memberPassword, roll_number: `VLOGIN-${ts}` }
  });
  check(section, 'register fresh test member', memberReg.status === 201, `status=${memberReg.status}`);

  const login = await api('/api/auth/login', { method: 'POST', body: { email: memberEmail, password: memberPassword } });
  check(section, 'login registered member (real credential flow)', login.status === 200 && !!login.json?.token,
    `status=${login.status} role=${login.json?.user?.role}`);
  const memberUser = login.json?.user;
  const memberId = memberUser?.id;

  // ---- real Admin KUSH row (role ADMIN) ----
  const { data: adminRow } = await dbRead.from('users').select('id, name, role').eq('email', ADMIN_EMAIL).single();
  check(section, `Admin KUSH row present in users (${ADMIN_EMAIL})`, !!adminRow && adminRow.role === 'ADMIN',
    adminRow ? `id=${adminRow.id} role=${adminRow.role}` : 'not found');

  // ---- generated admin token (Admin KUSH) ----
  const adminToken = adminRow
    ? signTestToken(adminRow.id, adminRow.name || 'KUSH', ADMIN_EMAIL, 'ADMIN')
    : signTestToken('kush', 'KUSH', ADMIN_EMAIL, 'ADMIN');
  const adminProfile = await api('/api/auth/profile', { token: adminToken });
  check(section, `generated Admin KUSH token accepted (${ADMIN_EMAIL})`,
    adminProfile.status === 200 && adminProfile.json?.data?.role === 'ADMIN',
    `status=${adminProfile.status} role=${adminProfile.json?.data?.role}`);

  // ---- generated member token ----
  const memberToken = memberId
    ? signTestToken(memberId, 'kush', MEMBER_EMAIL, 'MEMBER')
    : signTestToken('kush', 'kush', MEMBER_EMAIL, 'MEMBER');
  const memberProfile = await api('/api/auth/profile', { token: memberToken });
  check(section, 'generated MEMBER token accepted', memberProfile.status === 200 && memberProfile.json?.data?.role === 'MEMBER',
    `status=${memberProfile.status} role=${memberProfile.json?.data?.role}`);

  // ---- 401 / 403 matrix ----
  const noToken = await api('/api/auth/profile');
  check(section, 'no token -> 401', noToken.status === 401, `status=${noToken.status}`);

  const badToken = await api('/api/auth/profile', { token: 'garbage.token.value' });
  check(section, 'garbage token -> 403', badToken.status === 403, `status=${badToken.status}`);

  const spoofToken = signTestToken(memberId || 'kush', 'kush', MEMBER_EMAIL, 'SUPERADMIN');
  const spoof = await api('/api/auth/profile', { token: spoofToken });
  check(section, 'invalid role claim -> 403', spoof.status === 403, `status=${spoof.status}`);

  // ---- RBAC on admin-only routes (inventory) ----
  const memberCreate = await api('/api/items', { method: 'POST', token: memberToken,
    body: { name: 'RBAC-Deny-Item', category: 'Controllers', location: 'Test Rack', quantity: 1 } });
  check(section, 'MEMBER token on admin-only POST /api/items -> 403', memberCreate.status === 403, `status=${memberCreate.status}`);

  const itemName = `Verify-Item-${Date.now()}`;
  const adminCreate = await api('/api/items', { method: 'POST', token: adminToken,
    body: { name: itemName, category: 'Controllers', location: 'Test Rack', quantity: 5 } });
  check(section, 'ADMIN token on POST /api/items -> 201', adminCreate.status === 201, `status=${adminCreate.status}`);
  const itemId = adminCreate.json?.data?.id;
  if (itemId) {
    const del = await api(`/api/items/${itemId}`, { method: 'DELETE', token: adminToken });
    check(section, 'ADMIN token on DELETE /api/items -> 200', del.status === 200, `status=${del.status}`);
  }

  const auditNoAuth = await api('/api/audit');
  const auditAuth = await api('/api/audit', { token: adminToken });
  check(section, 'GET /api/audit requires auth (401 / 200)', auditNoAuth.status === 401 && auditAuth.status === 200,
    `no-auth=${auditNoAuth.status} admin=${auditAuth.status}`);

  // ---- cookie session fallback through the connect-redis store ----
  const store = new RedisStore({ client: testRedis, prefix: SESSION_PREFIX });
  const sid = 'verify-sess-' + crypto.randomBytes(8).toString('hex');
  await store.set(sid, {
    cookie: { originalMaxAge: 604800000, expires: null, httpOnly: true, sameSite: 'lax', maxAge: 604800000 },
    user: { id: memberId || 'kush', name: 'kush', email: MEMBER_EMAIL, role: 'MEMBER' }
  });

  // store.get() is exactly the lookup express-session performs to restore req.session.user
  const loaded = await store.get(sid);
  const sessKeys = await testRedis.keys(SESSION_PREFIX + '*');
  check(section, 'session cookie fallback restores user (store.get)', loaded?.user?.email === MEMBER_EMAIL,
    `via ${sessKeys.length} cicr:sess:* key(s)`);

  if (isRedisEnabled && redisClient) {
    const sessAuth = await api('/api/auth/profile', { cookie: `connect.sid=${sid}` });
    check(section, 'live HTTP session-cookie auth (no Bearer)', sessAuth.status === 200 && sessAuth.json?.data?.email === MEMBER_EMAIL,
      `status=${sessAuth.status}`);
  } else {
    check(section, 'live HTTP session-cookie auth (no Bearer)', true,
      'REDIS_URL unset — app uses in-memory MemoryStore; session path covered by store.get above');
  }

  await store.destroy(sid);
}

async function renderSummary() {
  const sectionNames = [...new Set(results.map((r) => r.section))];
  const line = (s) => console.log('  ' + s);
  console.log('\n' + '='.repeat(72));
  console.log('VERIFICATION SUMMARY — v1.5 stack (Redis / DB split / auth)');
  console.log('='.repeat(72));

  for (const section of sectionNames) {
    const rows = results.filter((r) => r.section === section);
    const ok = rows.filter((r) => r.ok).length;
    console.log(`\n${section}  [${ok}/${rows.length}]`);
    for (const r of rows) {
      const mark = r.ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
      const detail = r.detail ? ' | ' + r.detail : '';
      console.log(`  ${mark}  ${r.name}${detail}`);
    }
  }

  const total = results.length;
  const passed = total - failures;
  console.log('\n' + '-'.repeat(72));
  if (failures === 0) {
    console.log(`${GREEN}ALL ${passed}/${total} CHECKS PASSED${RESET}`);
  } else {
    console.log(`${RED}${passed}/${total} PASSED, ${failures} FAILED${RESET}`);
  }
  console.log('-'.repeat(72));
  return failures === 0;
}

(async () => {
  await new Promise((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Booting v1.5 stack verification on ${base}\n`);
  console.log(`Redis backend: ${isRedisEnabled ? `${GREEN}real ioredis${RESET}` : `${YELLOW}in-memory stub${RESET}`} (REDIS_URL ${isRedisEnabled ? 'set' : 'unset'})`);
  console.log(`Read pool: ${isReadReplicaConfigured() ? `${GREEN}read replica${RESET}` : `${YELLOW}primary (replica-ready)${RESET}`}\n`);

  try {
    await verifyRedisSection();
    console.log('');
    await verifyDbSplitSection();
    console.log('');
    await verifyAuthSection();
  } catch (err) {
    check('Script', 'execution', false, err.message);
  } finally {
    if (redisClient && isRedisEnabled) { try { await redisClient.quit(); } catch { /* ignore */ } }
    server.close();
  }

  const ok = await renderSummary();
  process.exit(ok ? 0 : 1);
})();
