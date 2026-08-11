// Diagnostic script: dispatch a test OTP email to a Gmail inbox and an
// institutional @mail.jiit.ac.in inbox, logging the exact SMTP response.
// Usage (from backend/):  node test/test-email.cjs
const { sendOtpEmail } = require('../dist/services/emailService.js');

const TEST_OTP = String(Math.floor(100000 + Math.random() * 900000));
const TEST_ITEM = 'Diagnostic Item (v1.4.4 SMTP probe)';
const TEST_DURATION = 5;

const TARGETS = [
  { label: 'Gmail (KUSH admin)', email: 'kushagragargdelhi@gmail.com', name: 'KUSH' },
  { label: 'JIIT mail (992501030406)', email: '992501030406@mail.jiit.ac.in', name: 'Test Student 992501030406' }
];

async function dispatch(label, email, name) {
  console.log(`\n========== Dispatching test OTP -> ${label} ==========`);
  console.log(`  to: ${email} | otp: ${TEST_OTP}`);
  const result = await sendOtpEmail(email, name, 'Diagnostic Script', TEST_OTP, TEST_ITEM, TEST_DURATION);
  console.log(`  result: ${JSON.stringify(result, null, 2)}`);
  if (!result.success) {
    console.log(`  !! SMTP delivery FAILED (see [EMAIL SERVICE ERROR] log above for raw codes)`);
    return false;
  }
  console.log(`  SMTP delivery accepted. Check inbox for subject: "[CICR Inventory] Borrow Approval OTP: ${TEST_OTP}"`);
  return true;
}

(async () => {
  const results = [];
  for (const t of TARGETS) {
    results.push(await dispatch(t.label, t.email, t.name));
  }
  console.log('\n========== Summary ==========');
  results.forEach((ok, i) => console.log(`  ${TARGETS[i].label}: ${ok ? 'ACCEPTED' : 'FAILED'}`));
  const okCount = results.filter(Boolean).length;
  console.log(`  ${okCount}/${TARGETS.length} recipients accepted by SMTP.`);
  process.exit(okCount === TARGETS.length ? 0 : 1);
})();
