// Diagnostic script: dispatch a live test OTP email through the app's
// Nodemailer transport to an INSTITUTIONAL numeric student inbox and print the
// complete SMTP response codes + message headers to the terminal (v1.4.7).
//
// Routing (Institutional Email Support, @mail.jiit.ac.in):
//   Sender:   CICR Inventory Support <kushagragargdelhi@gmail.com>  (SMTP_USER)
//   Receiver: 992501030406@mail.jiit.ac.in                           (numeric student ID)
//
// Usage (from backend/):  node test/test-email.cjs
const { sendOtpEmail, DEFAULT_SENDER_EMAIL } = require('../dist/services/emailService.js');

const SENDER_EMAIL = process.env.SMTP_USER || DEFAULT_SENDER_EMAIL;
const INSTITUTIONAL_TEST_RECIPIENT = '992501030406@mail.jiit.ac.in';
const TEST_OTP = String(Math.floor(100000 + Math.random() * 900000));
const TEST_ITEM = 'Diagnostic Item (v1.4.7 institutional SMTP probe)';
const TEST_DURATION = 5;

async function dispatch() {
  console.log('========== Dispatching test OTP email (institutional) ==========');
  console.log(`  from:     ${SENDER_EMAIL}`);
  console.log(`  to:       ${INSTITUTIONAL_TEST_RECIPIENT}`);
  console.log(`  subject:  "[CICR Inventory] Borrow Approval OTP: ${TEST_OTP}"`);
  console.log(`  otp:      ${TEST_OTP}\n`);

  const result = await sendOtpEmail(INSTITUTIONAL_TEST_RECIPIENT, 'Admin KUSH', 'Diagnostic Script', TEST_OTP, TEST_ITEM, TEST_DURATION);

  console.log('  SMTP response codes:');
  console.log(`    raw response:   ${result.info?.response}`);
  console.log(`    accepted:       ${JSON.stringify(result.info?.accepted || [])}`);
  console.log(`    rejected:       ${JSON.stringify(result.info?.rejected || [])}`);
  console.log(`    pending:        ${JSON.stringify(result.info?.pending || [])}`);
  console.log(`    envelope:       ${JSON.stringify(result.info?.envelope)}`);
  console.log(`    messageId:      ${result.messageId}`);

  console.log('\n  Message headers (as sent):');
  const headers = result.info?.headers || {};
  for (const [k, v] of Object.entries(headers)) {
    console.log(`    ${k}: ${v}`);
  }
  console.log(`    Reply-To: ${result.info?.replyTo}`);
  console.log(`    Message-ID: ${result.messageId}`);

  console.log(`\n  full result:  ${JSON.stringify(result)}`);

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
  console.log(`  Sender ${SENDER_EMAIL} -> ${INSTITUTIONAL_TEST_RECIPIENT}: ${ok ? 'ACCEPTED' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
})();
