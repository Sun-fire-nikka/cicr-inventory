const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { authenticateToken, requireAdmin } = require('../dist/middleware/auth.middleware.js');

const SECRET = process.env.JWT_SECRET || 'super_secret_cicr_key';

function mockRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('authenticateToken: missing token returns 401', () => {
  const res = mockRes();
  authenticateToken({ headers: {} }, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /Token missing/);
});

test('authenticateToken: invalid token returns 403', () => {
  const res = mockRes();
  authenticateToken({ headers: { authorization: 'Bearer not-a-real-token' } }, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Invalid or expired token/);
});

test('authenticateToken: valid token calls next and populates req.user', () => {
  const token = jwt.sign({ id: 'u-test', email: 'a@b.test', role: 'ADMIN' }, SECRET, { expiresIn: '1h' });
  let called = false;
  const req = { headers: { authorization: `Bearer ${token}` } };
  authenticateToken(req, mockRes(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.role, 'ADMIN');
  assert.equal(req.user.id, 'u-test');
});

test('authenticateToken: expired token returns 403', () => {
  const token = jwt.sign({ id: 'u-test', role: 'MEMBER' }, SECRET, { expiresIn: '-1s' });
  const res = mockRes();
  authenticateToken({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 403);
});

test('requireAdmin: MEMBER gets 403', () => {
  const res = mockRes();
  requireAdmin({ user: { role: 'MEMBER' } }, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 403);
});

test('requireAdmin: ADMIN passes through', () => {
  let called = false;
  requireAdmin({ user: { role: 'ADMIN' } }, mockRes(), () => { called = true; });
  assert.equal(called, true);
});
