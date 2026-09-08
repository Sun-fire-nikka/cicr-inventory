const http = require('http');
require('dotenv').config();

const makeReq = (path, method, body, token) => {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: responseBody });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

async function run() {
  const testEmail = `test_member_${Date.now()}@cicr.lab`;
  console.log('--- 1. Register Member ---', testEmail);
  const uniqueRoll = 'RN' + Date.now().toString().slice(-6);
  const regRes = await makeReq('/api/auth/register', 'POST', {
    name: 'Hardware Requester',
    email: testEmail,
    password: 'TestPassword123!',
    roll_number: uniqueRoll
  });
  console.log('Register response:', regRes.status, regRes.body?.message);

  const jwt = require('jsonwebtoken');
  const jwtSecret = process.env.JWT_SECRET || 'cicr_jwt_secret_dev_key_2026';
  const memberToken = jwt.sign({ id: 'usr_test_member', email: testEmail, name: 'Hardware Requester', role: 'MEMBER' }, jwtSecret, { expiresIn: '1h' });
  const adminToken = jwt.sign({ id: 'usr_test_admin', email: 'cicrinventory@gmail.com', name: 'Master Admin', role: 'ADMIN' }, jwtSecret, { expiresIn: '1h' });
  console.log('Member and Admin tokens created.');

  console.log('--- 2. Get Items to pick one for issue request ---');
  const itemsRes = await makeReq('/api/items', 'GET');
  const firstItem = itemsRes.body?.data?.[0];
  console.log('Picked item:', firstItem ? firstItem.name : 'None', 'ID:', firstItem?.id);

  if (!firstItem) {
    console.error('No inventory items found to test.');
    return;
  }

  console.log('--- 3. Submit Member Hardware Issue Request ---');
  const submitReq = await makeReq('/api/borrow/request', 'POST', {
    itemId: firstItem.id,
    itemName: firstItem.name,
    quantity: 1,
    purpose: 'Autonomous Rover Chassis Testing',
    borrowerName: 'Hardware Requester',
    borrowerEmail: testEmail,
    rollNumber: '23CS101',
    duration_days: 7
  }, memberToken);
  console.log('Request submit status:', submitReq.status, submitReq.body);
  const reqId = submitReq.body?.data?.id;

  console.log('--- 4. Fetch All Hardware Requests as Admin ---');
  const listRes = await makeReq('/api/borrow/requests', 'GET', null, adminToken);
  console.log('List requests status:', listRes.status, 'Total requests:', listRes.body?.count, 'First request:', listRes.body?.data?.[0]?.itemName);

  if (reqId) {
    console.log('--- 5. Admin Approves Request ---');
    const approveRes = await makeReq(`/api/borrow/requests/${reqId}/approve`, 'POST', null, adminToken);
    console.log('Approve status:', approveRes.status, approveRes.body);
  }

  console.log('=== END-TO-END VERIFICATION COMPLETE ===');
}

run().catch(console.error);
