const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_BOTE_CONFIG,
  computeCapacity,
  computePeakLoad,
  computeLatency,
  computeRedisMemory,
  buildBoteSnapshot,
  simulateScale
} = require('../dist/services/boteService.js');

test('computeCapacity: idle day has full headroom', () => {
  const c = computeCapacity(0);
  assert.equal(c.daily_cap, 500);
  assert.equal(c.emails_used_today, 0);
  assert.equal(c.emails_remaining_today, 500);
  assert.equal(c.utilization_pct, 0);
  assert.equal(c.max_transactions_per_day, 250);
  assert.equal(c.transactions_used_today, 0);
  assert.equal(c.transactions_remaining_today, 250);
});

test('computeCapacity: halfway usage reports 50% utilization', () => {
  const c = computeCapacity(250);
  assert.equal(c.emails_remaining_today, 250);
  assert.equal(c.utilization_pct, 50);
  assert.equal(c.transactions_used_today, 125);
  assert.equal(c.transactions_remaining_today, 125);
});

test('computeCapacity: over-cap is floored to zero remaining', () => {
  const c = computeCapacity(600);
  assert.equal(c.emails_remaining_today, 0);
  assert.ok(c.utilization_pct > 100);
});

test('computeCapacity: negative input is clamped to zero', () => {
  const c = computeCapacity(-5);
  assert.equal(c.emails_used_today, 0);
  assert.equal(c.emails_remaining_today, 500);
});

test('computePeakLoad: normal day stays under cap', () => {
  const p = computePeakLoad(40, 5, 80);
  assert.equal(p.active_borrows, 40);
  assert.equal(p.due_today_emails, 5);
  assert.equal(p.peak_burst_emails, 85);
  assert.equal(p.exceeds_daily_cap, false);
  assert.equal(p.headroom_emails, 415);
});

test('computePeakLoad: burst that exceeds cap is flagged', () => {
  const p = computePeakLoad(300, 240, 300);
  assert.equal(p.peak_burst_emails, 540);
  assert.equal(p.exceeds_daily_cap, true);
  assert.equal(p.headroom_emails, 0);
});

test('computeLatency: sequential vs parallel scales linearly with workers', () => {
  const l = computeLatency(1000);
  assert.equal(l.total_emails, 1000);
  assert.equal(l.sequential_ms, 1_000_000); // 1000 * 1000ms
  assert.equal(l.sequential_human, '16m 40s');
  assert.equal(l.parallel_ms, 40_000); // 1000 * 1000 / 25 workers
  assert.equal(l.parallel_human, '40s');
  assert.equal(l.speedup_x, 25);
});

test('computeLatency: zero emails produces zero latency', () => {
  const l = computeLatency(0);
  assert.equal(l.sequential_ms, 0);
  assert.equal(l.parallel_ms, 0);
  assert.equal(l.sequential_human, '0s');
});

test('computeLatency: 10,000-user flood stays parallel-fast, sequential slow', () => {
  const l = computeLatency(1333.33);
  assert.equal(l.sequential_ms, 1_333_330);
  assert.equal(l.parallel_ms, 53_333);
  assert.equal(l.speedup_x, 25);
});

test('computeRedisMemory: 10,000 users ~ 20MB queue footprint', () => {
  const m = computeRedisMemory(10000, 1);
  assert.equal(m.users, 10000);
  assert.equal(m.jobs_per_user, 1);
  assert.equal(m.total_jobs, 10000);
  assert.equal(m.job_size_bytes, 2048);
  assert.equal(m.queue_bytes, 20_480_000);
  assert.equal(m.queue_mb, 19.5); // ~20MB
  assert.equal(m.redis_bytes, 30_720_000);
  assert.equal(m.redis_mb, 29.3); // 1.5x overhead factor
});

test('computeRedisMemory: zero users yields zero memory', () => {
  const m = computeRedisMemory(0, 1);
  assert.equal(m.total_jobs, 0);
  assert.equal(m.queue_bytes, 0);
  assert.equal(m.redis_mb, 0);
});

test('computeRedisMemory: jobs-per-user scales total jobs', () => {
  const m = computeRedisMemory(1000, 3);
  assert.equal(m.total_jobs, 3000);
  assert.equal(m.queue_mb, 5.9);
});

test('buildBoteSnapshot: assembles full live snapshot', () => {
  const s = buildBoteSnapshot({
    emailsUsedToday: 120,
    activeBorrows: 45,
    dueTodayEmails: 12,
    totalUsers: 300,
    totalItems: 25,
    availableQuantity: 180,
    borrowedQuantity: 220
  });
  assert.ok(!isNaN(Date.parse(s.generated_at)));
  assert.equal(s.capacity.emails_used_today, 120);
  assert.equal(s.capacity.emails_remaining_today, 380);
  assert.equal(s.peak.peak_burst_emails, 132);
  assert.equal(s.peak.exceeds_daily_cap, false);
  assert.equal(s.latency.total_emails, 132);
  assert.equal(s.memory.users, 300);
});

test('simulateScale: 10,000 users needs ~3 Gmail accounts and ~$4/mo on SES', () => {
  const r = simulateScale({ users: 10000, borrowsPerUserPerMonth: 2, jobsPerUser: 1 });
  assert.equal(r.scenario.users, 10000);
  assert.equal(r.scenario.emails_per_month, 40000);
  assert.equal(r.scenario.emails_per_day, 1333.3);
  assert.equal(r.scenario.transactions_per_day, 666.7);
  assert.equal(r.gmail_accounts_needed, 3);
  assert.equal(r.exceeds_single_gmail_cap, true);
  assert.equal(r.cost.ses_usd_per_month, 4);
  assert.equal(r.cost.resend_usd_per_month, 8);
  assert.equal(r.memory.queue_mb, 19.5);
});

test('simulateScale: club-scale stays inside a single Gmail account', () => {
  const r = simulateScale({ users: 300, borrowsPerUserPerMonth: 1, jobsPerUser: 1 });
  assert.equal(r.scenario.emails_per_month, 600);
  assert.equal(r.scenario.emails_per_day, 20);
  assert.equal(r.exceeds_single_gmail_cap, false);
  assert.equal(r.gmail_accounts_needed, 1);
});

test('simulateScale: zero users yields zero everything', () => {
  const r = simulateScale({ users: 0, borrowsPerUserPerMonth: 2, jobsPerUser: 1 });
  assert.equal(r.scenario.emails_per_month, 0);
  assert.equal(r.gmail_accounts_needed, 0);
  assert.equal(r.memory.total_jobs, 0);
});

test('DEFAULT_BOTE_CONFIG matches documented assumptions', () => {
  assert.equal(DEFAULT_BOTE_CONFIG.smtpDailyCap, 500);
  assert.equal(DEFAULT_BOTE_CONFIG.emailsPerBorrowCycle, 2);
  assert.equal(DEFAULT_BOTE_CONFIG.smtpAvgLatencyMs, 1000);
  assert.equal(DEFAULT_BOTE_CONFIG.reminderWorkers, 25);
  assert.equal(DEFAULT_BOTE_CONFIG.jobSizeBytes, 2048);
  assert.equal(DEFAULT_BOTE_CONFIG.redisOverheadFactor, 1.5);
});
