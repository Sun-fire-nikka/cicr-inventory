const { test } = require('node:test');
const assert = require('node:assert/strict');

// reminderScheduler pulls in ../app (which constructs the Supabase client at import
// time), so give it placeholder credentials when a real .env is not present.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const {
  DEFAULT_REMINDER_INTERVAL_MS,
  DEFAULT_REMINDER_LEAD_HOURS,
  resolveReminderConfig,
  reminderCutoff,
  describeDueWindow
} = require('../dist/services/reminderScheduler.js');

const NOW = new Date('2026-08-11T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

test('resolveReminderConfig: empty env falls back to defaults', () => {
  const c = resolveReminderConfig({});
  assert.equal(c.intervalMs, DEFAULT_REMINDER_INTERVAL_MS);
  assert.equal(c.leadHours, DEFAULT_REMINDER_LEAD_HOURS);
  assert.equal(c.batchLimit, 100); // BOTE reminderWorkers (25) * 4
});

test('resolveReminderConfig: env values override defaults', () => {
  const c = resolveReminderConfig({
    REMINDER_INTERVAL_MS: '900000',
    REMINDER_LEAD_HOURS: '48',
    REMINDER_BATCH_LIMIT: '10'
  });
  assert.equal(c.intervalMs, 900000);
  assert.equal(c.leadHours, 48);
  assert.equal(c.batchLimit, 10);
});

test('resolveReminderConfig: junk and non-positive values fall back to defaults', () => {
  const c = resolveReminderConfig({
    REMINDER_INTERVAL_MS: 'soon',
    REMINDER_LEAD_HOURS: '-4',
    REMINDER_BATCH_LIMIT: '0'
  });
  assert.equal(c.intervalMs, DEFAULT_REMINDER_INTERVAL_MS);
  assert.equal(c.leadHours, DEFAULT_REMINDER_LEAD_HOURS);
  assert.equal(c.batchLimit, 100);
});

test('resolveReminderConfig: a zero lead time is honoured (overdue-only mode)', () => {
  assert.equal(resolveReminderConfig({ REMINDER_LEAD_HOURS: '0' }).leadHours, 0);
});

test('reminderCutoff: pushes the horizon forward by the lead window', () => {
  assert.equal(reminderCutoff(NOW, 24).toISOString(), '2026-08-12T12:00:00.000Z');
  assert.equal(reminderCutoff(NOW, 0).toISOString(), NOW.toISOString());
});

test('describeDueWindow: future due dates report time remaining', () => {
  assert.equal(describeDueWindow(new Date(NOW.getTime() + 3 * HOUR), NOW), 'due in 3 hour(s)');
  assert.equal(describeDueWindow(new Date(NOW.getTime() + 50 * HOUR), NOW), 'due in 2 day(s)');
});

test('describeDueWindow: past due dates report how far overdue', () => {
  assert.equal(describeDueWindow(new Date(NOW.getTime() - 5 * HOUR), NOW), 'overdue by 5 hour(s)');
  assert.equal(describeDueWindow(new Date(NOW.getTime() - 72 * HOUR), NOW), 'overdue by 3 day(s)');
});

test('describeDueWindow: accepts ISO strings as well as Date objects', () => {
  assert.equal(describeDueWindow('2026-08-12T12:00:00.000Z', NOW), 'due in 1 day(s)');
});

test('describeDueWindow: unparseable due date degrades to a neutral label', () => {
  assert.equal(describeDueWindow('not-a-date', NOW), 'due soon');
});
