const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateOtp, storeOtp, verifyOtp, consumeOtp } = require('../dist/modules/borrow/otpService.js');

const payload = {
  userId: 'u1',
  userName: 'Tester',
  userEmail: 'tester@cicr.test',
  itemId: 'i1',
  quantity: 1,
  purpose: 'unit test',
  durationDays: 5,
  adminId: 'kush'
};

test('generateOtp returns a 6-digit numeric string', () => {
  for (let i = 0; i < 50; i++) {
    const otp = generateOtp();
    assert.match(otp, /^\d{6}$/);
  }
});

test('verifyOtp returns the stored payload for a valid OTP', () => {
  const otp = generateOtp();
  storeOtp(otp, payload);
  const entry = verifyOtp(otp);
  assert.ok(entry);
  assert.equal(entry.userId, 'u1');
  assert.equal(entry.itemId, 'i1');
  assert.equal(entry.adminId, 'kush');
  assert.equal(entry.durationDays, 5);
});

test('consumeOtp removes the OTP so a second verify fails', () => {
  const otp = generateOtp();
  storeOtp(otp, payload);
  assert.ok(verifyOtp(otp));
  consumeOtp(otp);
  assert.equal(verifyOtp(otp), null);
});

test('verifyOtp rejects an unknown OTP', () => {
  assert.equal(verifyOtp('000000'), null);
});
