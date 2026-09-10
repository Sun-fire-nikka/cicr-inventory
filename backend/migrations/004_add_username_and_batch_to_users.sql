-- Migration 004: Add username and batch columns to users table
-- Version: v2.6.0
-- Adds username and batch columns to support enhanced student registration and multi-identifier sign-in.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS batch TEXT;

-- Create index for fast identifier resolution
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_name_lower ON public.users (LOWER(name));
