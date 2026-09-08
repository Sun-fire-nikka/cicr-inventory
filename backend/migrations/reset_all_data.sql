-- ============================================================
-- CICR Inventory - COMPLETE SUPABASE DATA RESET
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Truncate all tables clean with CASCADE
TRUNCATE TABLE public.audit_logs, public.borrow_records, public.inventory, public.users CASCADE;

-- 2. Insert only the single Master Admin account (cicrinventory@gmail.com / VardaanSaxena@0009)
INSERT INTO public.users (name, email, password_hash, role)
VALUES (
  'CICR Admin',
  'cicrinventory@gmail.com',
  '$2b$10$5jALhgWWRG33FuvEEnPoBu.tYnGRWS8vEIqjXYd3oSNbqmA/8UXTu',
  'ADMIN'
);

-- 3. Confirm clean state
SELECT id, name, email, role, created_at FROM public.users;
