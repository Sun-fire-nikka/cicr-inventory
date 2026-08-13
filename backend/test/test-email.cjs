// Diagnostic script: dispatch a live test OTP email through the app's
// Nodemailer transport and print the complete SMTP response envelope,
// accepted/rejected recipients, and messageId to the terminal (v1.4.6).
//
// Routing (verified personal Gmail accounts):
//   Sender:   CICR Inventory Admin <kushagragargdelhi@gmail.com>  (SMTP_USER)
//   Receiver: kushgdhi@gmail.com                                   (DEFAULT_TEST_RECIPIENT_EMAIL)
//
// Usage (from backend/):  node test/test-email.cjs
const { sendOtpEmail, DEFAULT_TEST_RECIPIENT_EMAIL } = require('../dist/services/emailService.js');

const SENDER_EMAIL = process.env.SMTP_USER || 'kushagragargdelhi@gmail.com';
const TEST_OTP = String(Math.floor(100000 + Math.random() * 900000));
const TEST_ITEM = 'Diagnostic Item (v1.4.6 SMTP probe)';
const TEST_DURATION = 5;

async function dispatch() {
  console.log('========== Dispatching test OTP email ==========');
  console.log(`  from:     ${SENDER_EMAIL}`);
  console.log(`  to:       ${DEFAULT_TEST_RECIPIENT_EMAIL}`);
  console.log(`  subject:  "[CICR Inventory] Borrow Approval OTP: ${TEST_OTP}"`);
  console.log(`  otp:      ${TEST_OTP}\n`);

  const result = await sendOtpEmail(DEFAULT_TEST_RECIPIENT_EMAIL, 'kush', 'Diagnostic Script', TEST_OTP, TEST_ITEM, TEST_DURATION);

  console.log('  SMTP response envelope:');
  console.log(`    ${JSON.stringify(result.info?.envelope, null, 2).replace(/\n/g, '\n    ')}`);
  console.log(`  SMTP response status:   ${result.info?.response}`);
  console.log(`  accepted:               ${JSON.stringify(result.info?.accepted || [])}`);
  console.log(`  rejected:               ${JSON.stringify(result.info?.rejected || [])}`);
  console.log(`  messageId:              ${result.messageId}`);
  console.log(`  result:                 ${JSON.stringify(result)}`);

  if (!result.success) {
    console.log('\n  !! SMTP delivery FAILED (see [EMAIL SERVICE ERROR] log above for raw codes)');
    return false;
  }
  console.log(`\n  SMTP delivery accepted. Check inbox for subject: "[CICR Inventory] Borrow Approval OTP: ${TEST_OTP}"`);
  return true;
}

(async () => {
  const ok = await dispatch();
  console.log('\n========== Summary ==========');
  console.log(`  Sender ${SENDER_EMAIL} -> ${DEFAULT_TEST_RECIPIENT_EMAIL}: ${ok ? 'ACCEPTED' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
})();
