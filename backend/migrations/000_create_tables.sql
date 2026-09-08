-- ============ 000_create_tables.sql ============
-- Base schema for CICR Inventory (Supabase / PostgreSQL).
-- Run this FIRST before 001_* and 002_* migrations.

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  roll_number   TEXT,
  role          TEXT NOT NULL DEFAULT 'MEMBER'
                CHECK (role IN ('ADMIN', 'MEMBER')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. inventory
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  description       TEXT,
  category          TEXT NOT NULL,
  location          TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity >= 0),
  available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
  image             TEXT,
  tags              JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. borrow_records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.borrow_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL,
  inventory_id  UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  purpose       TEXT NOT NULL,
  borrowed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date      TIMESTAMPTZ,
  returned_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'BORROWED'
                CHECK (status IN ('BORROWED', 'RETURNED'))
);

-- ============================================================
-- 4. audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      TEXT NOT NULL,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  item_id     UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
  description TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory (category);
CREATE INDEX IF NOT EXISTS idx_borrow_records_user_id ON public.borrow_records (user_id);
CREATE INDEX IF NOT EXISTS idx_borrow_records_inventory_id ON public.borrow_records (inventory_id);
CREATE INDEX IF NOT EXISTS idx_borrow_records_status ON public.borrow_records (status);
CREATE INDEX IF NOT EXISTS idx_borrow_records_due_date ON public.borrow_records (due_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_item_id ON public.audit_logs (item_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs (timestamp);
