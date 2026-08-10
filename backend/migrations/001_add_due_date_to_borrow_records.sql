-- Migration: add due_date to borrow_records
-- Run this in the Supabase SQL Editor (or apply via a migration tool).
ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
