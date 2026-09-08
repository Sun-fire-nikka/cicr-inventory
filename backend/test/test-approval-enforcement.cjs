const fetch = globalThis.fetch || require('node-fetch');

async function testApprovalFlow() {
  const base = 'http://localhost:5000/api';
  const testStudentEmail = `9922103${Math.floor(100 + Math.random() * 900)}@mail.jiit.ac.in`;
  const testStudentPass = 'JiitStudent@123';
  const testStudentName = 'Student Jiit Test';

  console.log(`[TEST 1] Registering student: ${testStudentEmail}`);
  const regRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: testStudentName,
      email: testStudentEmail,
      password: testStudentPass
    })
  });
  const regData = await regRes.json();
  console.log('Register response:', regRes.status, regData);

  if (regRes.status !== 201 || regData.data?.status !== 'PENDING') {
    throw new Error('Registration failed or status is not PENDING!');
  }
  console.log('SUCCESS: Student status is PENDING and request queued for admin review.');

  console.log('\n[TEST 2] Attempting login before admin approval...');
  const loginAttemptRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testStudentEmail,
      password: testStudentPass
    })
  });
  const loginAttemptData = await loginAttemptRes.json();
  console.log('Login attempt response:', loginAttemptRes.status, loginAttemptData);

  if (loginAttemptRes.status !== 403 || loginAttemptData.status !== 'pending_approval') {
    throw new Error('Student was able to log in before admin approval!');
  }
  console.log('SUCCESS: Student login blocked with pending_approval 403.');

  console.log('\n[TEST 3] Admin logging in to approve student...');
  const adminLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'vardaansaxena096@gmail.com',
      password: 'VardaanSaxena@0009'
    })
  });
  const adminLoginData = await adminLoginRes.json();
  if (adminLoginRes.status !== 200 || !adminLoginData.token) {
    throw new Error('Admin login failed: ' + JSON.stringify(adminLoginData));
  }
  const adminToken = adminLoginData.token;
  console.log('Admin authenticated. Admin role:', adminLoginData.user?.role);

  console.log('\n[TEST 4] Admin fetching pending users list...');
  const usersRes = await fetch(`${base}/auth/admin/users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const usersData = await usersRes.json();
  const foundUser = (usersData.data || []).find(u => u.email.toLowerCase() === testStudentEmail.toLowerCase());
  if (!foundUser) {
    throw new Error(`Student ${testStudentEmail} not found in admin directory!`);
  }
  console.log('Found registered student in Admin Portal queue:', foundUser.name, foundUser.email, 'Status:', foundUser.status);
  if (foundUser.status !== 'PENDING') {
    throw new Error(`Expected student status PENDING, got: ${foundUser.status}`);
  }

  console.log('\n[TEST 5] Admin approving student...');
  const approveRes = await fetch(`${base}/auth/admin/users/${foundUser.id}/approve`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const approveData = await approveRes.json();
  console.log('Approve response:', approveRes.status, approveData);
  if (approveRes.status !== 200) {
    throw new Error('Failed to approve student');
  }

  console.log('\n[TEST 6] Student logging in AFTER admin approval...');
  const approvedLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testStudentEmail,
      password: testStudentPass
    })
  });
  const approvedLoginData = await approvedLoginRes.json();
  console.log('Approved login response:', approvedLoginRes.status, approvedLoginData);
  if (approvedLoginRes.status !== 200 || !approvedLoginData.token) {
    throw new Error('Student could not log in after approval!');
  }
  if (approvedLoginData.user?.role !== 'MEMBER') {
    throw new Error(`Expected student role MEMBER, got: ${approvedLoginData.user?.role}`);
  }
  console.log('SUCCESS: Student logged in with role MEMBER.');

  console.log('\n[TEST 7] Verifying student CANNOT access Admin Portal endpoints...');
  const studentToken = approvedLoginData.token;
  const adminEndpointsRes = await fetch(`${base}/auth/admin/users`, {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  console.log('Student access to /auth/admin/users response:', adminEndpointsRes.status);
  if (adminEndpointsRes.status !== 403) {
    throw new Error('Student was granted access to admin endpoint!');
  }
  console.log('SUCCESS: Student strictly blocked from admin endpoints with 403 Forbidden.');

  console.log('\nALL 7 TESTS PASSED PERFECTLY!');
}

testApprovalFlow().catch((e) => {
  console.error('TEST SUITE FAILED:', e);
  process.exit(1);
});
