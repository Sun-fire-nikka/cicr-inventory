-- Migration: track when a due-date reminder was emailed for a borrow record
-- Run this in the Supabase SQL Editor (or apply via a migration tool).
-- Required by src/services/reminderScheduler.ts — the sweep filters on this column
-- so a borrower is reminded once per borrow instead of on every tick.
ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Partial index matching the scheduler's sweep predicate: active borrows that
-- have not been reminded yet, ordered by due_date.
CREATE INDEX IF NOT EXISTS idx_borrow_records_reminder_pending
  ON public.borrow_records (due_date)
  WHERE status = 'BORROWED' AND reminder_sent_at IS NULL;

-- OPTIONAL BACKFILL — run this BEFORE starting the server if you do not want the
-- first sweep to email every borrower who is already due or overdue. It marks
-- existing rows as "already reminded" so only borrows created from now on are
-- picked up.
-- UPDATE public.borrow_records
--   SET reminder_sent_at = NOW()
--   WHERE status = 'BORROWED' AND reminder_sent_at IS NULL;
