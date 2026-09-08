-- ============================================================
-- CICR Inventory - COMPLETE SUPABASE DATA RESET
-- Run this in your Supabase SQL Editor to wipe all data clean
-- ============================================================

-- Disable triggers temporarily to avoid foreign key conflicts
SET session_replication_role = 'replica';

-- 1. Truncate all application data tables
TRUNCATE TABLE IF EXISTS public.audit_logs CASCADE;
TRUNCATE TABLE IF EXISTS public.borrow_records CASCADE;
TRUNCATE TABLE IF EXISTS public.auth_otps CASCADE;
TRUNCATE TABLE IF EXISTS public.inventory CASCADE;
TRUNCATE TABLE IF EXISTS public.items CASCADE;
TRUNCATE TABLE IF EXISTS public.users CASCADE;

-- Re-enable normal trigger execution
SET session_replication_role = 'origin';

-- 2. Insert the fresh Master Admin account (cicrinventory@gmail.com / VardaanSaxena@0009)
INSERT INTO public.users (name, email, password_hash, role)
VALUES (
  'CICR Admin',
  'cicrinventory@gmail.com',
  '$2b$10$5jALhgWWRG33FuvEEnPoBu.tYnGRWS8vEIqjXYd3oSNbqmA/8UXTu',
  'ADMIN'
);

-- 3. Verify clean state
SELECT id, name, email, role, created_at FROM public.users;
