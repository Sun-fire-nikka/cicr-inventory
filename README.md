<div align="center">

<img src="./logo.png" width="90" alt="CICR Logo" />

# CICR Inventory Hub

**Creative & Innovative Cell in Robotics — Inventory System**

Track, reserve, and deploy microcontrollers, sensors, and actuators from JIIT's robotics vault with a full-stack web platform: **React-free Vite + Three.js frontend**, **Node.js/Express REST API**, **Supabase (PostgreSQL)** persistence, and **Nodemailer** email automation.

[![Live Demo](https://img.shields.io/badge/LIVE-cicrinventory.vercel.app-00f0ff?style=for-the-badge&logo=vercel&logoColor=white)](https://cicrinventory.vercel.app/)
[![Repo](https://img.shields.io/badge/GITHUB-CICR__Inventory-bd00ff?style=for-the-badge&logo=github&logoColor=white)](https://github.com/simplyvardaan/CICR_Inventory)
[![License](https://img.shields.io/badge/LICENSE-MIT-1e2327?style=for-the-badge)](#-license)

</div>

---

## Table of Contents

- [Version History](#-version-history)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Repository Structure](#-repository-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Email Notification Workflow](#-email-notification-workflow)
- [Back-of-the-Envelope (BOTE) Estimation & Scalability](#-back-of-the-envelope-bote-estimation--scalability)
- [Database Schema](#-database-schema)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Known Issues & Roadmap](#-known-issues--roadmap)
- [License](#-license)

---

## 📌 Version History

| Version | Status | Highlights |
|---------|--------|-----------|
| **v1.0.0** | ✅ Released | Frontend-only prototype. Vite + Three.js + TypeScript with a hardcoded sample inventory catalog. No persistence, no backend. |
| **v1.1.0** | ✅ Released | Backend foundation. Node.js/Express + Supabase REST API; JWT auth (`register`/`login`/`profile`); admin-gated inventory CRUD; borrow/return flows with `borrowed_at`/`returned_at`; dashboard stats + audit log. Frontend wired to the live API. |
| **v1.2.1** | ✅ Released | Email automation. Nodemailer SMTP (Gmail App Password); borrow/return confirmation receipts; context-rich borrow email (remaining stock, current-holder summary, 5-day due-date notice); `node-cron` reminder scheduler (due-today / overdue); `due_date` migration; full test suite (41 tests). |
| **v1.3.0** | ✅ Released | Request/approval workflow. Non-admin borrows now go through a `PENDING` → `APPROVED`/`REJECTED` admin review queue instead of instant checkout. New automated due-date reminder scheduler with mock-mode fallback and duplicate-send protection (`reminder_sent_at` migration). New BOTE capacity analytics API (`/api/system/bote-metrics`, `/api/system/simulate-scale`). Frontend theme switcher (dark/light/pink) + collapsible mobile sidebar nav. |
| **v2.5.1** | 🚧 In progress | Frontend visual overhaul. Live out-of-stock dashboard stat, color-coded transaction/inventory logs, interactive background gridlines. New animated themes — Cherry Blossom (60fps falling-petal canvas) and Avengers (Captain America shield / Iron Man Arc Reactor motifs) — replacing the earlier Synthwave theme. Vault Index relocated to the sidebar; simplified hero section. |

> The root `package.json` still tracks the frontend package as `0.0.0`; the versioning table above reflects the *project* release milestones as tracked in commit/PR history, not the npm package version.

---

## 🏗️ System Architecture

```
┌──────────────────────┐      HTTPS (JSON)      ┌──────────────────────────┐
│       FRONTEND       │ ─────────────────────► │        BACKEND API       │
│  Vite + Three.js +   │    /api/*             │  Node.js + Express + TS  │
│  TypeScript (Vanilla)│ ◄───────────────────── │  src/modules/*           │
│  src/main.ts         │   JSON responses      │  src/services/           │
└──────────────────────┘                       └────────────┬─────────────┘
                                                             │ PostgREST (anon key)
                                                             ▼
                                             ┌────────────────────────────┐
                                             │         SUPABASE            │
                                             │  PostgreSQL (users,         │
                                             │  inventory, borrow_records, │
                                             │  request_records,           │
                                             │  audit_logs) + RLS          │
                                             └────────────┬─────────────┘
                                                          │ SMTP (nodemailer)
                                                          ▼
                                             ┌────────────────────────────┐
                                             │      Gmail (App Password)   │
                                             │  Borrow / Return / Reminder │
                                             └────────────────────────────┘
```

**Request lifecycle (borrow request example, v1.3.0+):**

1. Frontend sends `POST /api/requests` with `Authorization: Bearer <JWT>` — a non-admin member creates a `PENDING` request rather than borrowing directly.
2. `auth.middleware.ts` verifies the JWT and populates `req.user { id, name, email, role }`.
3. An admin reviews the pending-requests queue and calls `PATCH /api/requests/:id` to `APPROVE` or `REJECT`.
4. On approval, the controller creates the `borrow_records` row with `due_date = borrowed_at + duration_days`, decrements `available_quantity`, and dispatches `emailService.sendBorrowConfirmation(...)` asynchronously (fire-and-forget, never blocks the HTTP response).
5. The `reminderScheduler` (node-cron) independently scans for due/overdue borrows and emails borrowers.
6. `boteService.ts` continuously derives live capacity metrics (today's borrows/returns, active borrows, items due today) exposed via `/api/system/bote-metrics`.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vite 8, TypeScript, Three.js, lucide icons, vanilla DOM/CSS (dark neon-glass UI, theme switcher: dark/light/pink/Cherry Blossom/Avengers) |
| **Backend** | Node.js ≥ 18, Express 4, TypeScript 5 (strict), ts-node, nodemon |
| **Database** | Supabase (PostgreSQL) via `@supabase/supabase-js` PostgREST client |
| **Auth** | `bcryptjs` password hashing + `jsonwebtoken` (JWT, 7-day expiry) |
| **Email** | Nodemailer (SMTP, Gmail App Password) |
| **Scheduling** | node-cron (daily 09:00 + boot-time due/overdue check) |
| **Tests** | Node built-in test runner (`node --test`) — 41+ tests, including reminder and BOTE service coverage |
| **Deployment** | Backend: Render (`cicr-inventory-backend.onrender.com`) · Frontend: Vercel (`cicrinventory.vercel.app`) |

---

## 📁 Repository Structure

```
CICR_Inventory/
├── backend/                      # Express + TypeScript API
│   ├── src/
│   │   ├── server.ts             # Entry point (HTTP listen + reminder scheduler)
│   │   ├── app.ts                # Express app + Supabase client singleton
│   │   ├── modules/
│   │   │   ├── auth/             # register, login, profile (+ routes)
│   │   │   ├── inventory/        # items CRUD (+ routes)
│   │   │   ├── borrow/           # borrow, return, history (+ routes)
│   │   │   ├── requests/         # borrow requests: create, approve, reject (+ routes)
│   │   │   ├── system/           # BOTE capacity analytics (+ routes)
│   │   │   └── dashboard/        # stats + audit log (+ routes)
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts# JWT verify + requireAdmin
│   │   └── services/
│   │       ├── emailService.ts   # Nodemailer transport + email templates
│   │       ├── reminderScheduler.ts # node-cron due/overdue reminder job
│   │       └── boteService.ts    # Live capacity/load metrics calculation engine
│   ├── migrations/
│   │   ├── 001_add_due_date_to_borrow_records.sql
│   │   └── 002_add_reminder_sent_at_to_borrow_records.sql
│   ├── test/                     # auth.middleware, API integration, reminder, BOTE tests (.cjs)
│   ├── .env                      # local secrets (gitignored)
│   ├── .env.example              # template (committed)
│   ├── package.json
│   └── tsconfig.json
├── src/                          # Frontend (Vite + Three.js)
│   ├── main.ts                   # UI logic; API_BASE constant (line 11)
│   ├── types.ts
│   ├── style.css
│   └── assets/
├── public/                       # Static images/icons
├── docs/
│   └── BOTE_ESTIMATION.md        # Back-of-the-envelope email-pipeline capacity math
├── index.html
├── package.json                  # Frontend deps & scripts
├── tsconfig.json
└── README.md                     # You are here
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18 (tested on v24)
- npm ≥ 9
- A Supabase project (PostgreSQL + PostgREST)
- A Gmail account with 2-Step Verification + App Password (for email)

### 1. Clone & install

```bash
git clone https://github.com/simplyvardaan/CICR_Inventory.git
cd CICR_Inventory

# Frontend
npm install

# Backend
cd backend
npm install
```

### 2. Configure backend environment

```bash
cd backend
cp .env.example .env
```

Fill in `.env` (see [Environment Variables](#-environment-variables)).

### 3. Create the database schema

Run the [Database Schema](#-database-schema) SQL in the Supabase SQL Editor.

### 4. Run the backend

```bash
cd backend
npm run build        # tsc → dist/
npm start            # http://localhost:5000
# or during development:
npm run dev          # nodemon + ts-node (watch mode)
```

### 5. Run the frontend

```bash
cd CICR_Inventory
npm run dev          # Vite dev server → http://localhost:5173
```

> **Frontend API target:** the frontend reads a single `API_BASE` constant in `src/main.ts:11`. It defaults to the deployed Render backend (`https://cicr-inventory-backend.onrender.com/api`). To run against your local backend, change it to `http://localhost:5000/api`.

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Backend listen port (default `5000`) |
| `SUPABASE_URL` | Yes | Supabase project API URL — `https://<project-ref>.supabase.co` (**not** `/rest/v1`, **not** the dashboard URL) |
| `SUPABASE_ANON_KEY` | Yes | Supabase public anon key (safe to ship to the client; RLS protects data) |
| `JWT_SECRET` | Yes | Secret used to sign/verify JWTs |
| `SMTP_HOST` | No | SMTP server (default `smtp.gmail.com`) |
| `SMTP_PORT` | No | SMTP port (default `587`) |
| `SMTP_USER` | No | Authenticating Gmail account. If empty → mock mode (emails logged, not sent) |
| `SMTP_PASS` | No | Gmail **16-character App Password** (requires 2FA on `SMTP_USER`) |
| `SMTP_FROM` | No | From header. **Must match `SMTP_USER`** (Gmail rejects mismatched senders) |
| `REMINDER_CRON` | No | Reminder schedule (default `0 9 * * *` — daily 09:00) |
| `REMINDERS_ENABLED` | No | Set to `false` to disable the reminder scheduler entirely (default enabled) |

---

## 📡 API Reference

Base URL (local): `http://localhost:5000` · Base URL (deployed): `https://cicr-inventory-backend.onrender.com`

Auth scheme: `Authorization: Bearer <JWT>`

### System

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | Public | Health check → `{ status, message }` |
| `GET` | `/api/system/bote-metrics` | Bearer | Live capacity snapshot — today's borrows/returns, active borrows, items due today, total users, inventory quantities |
| `GET` | `/api/system/simulate-scale` | Bearer | Projects the above metrics under a simulated higher load, for capacity planning |

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | Public | Register. Body: `{ name, email, password, roll_number?, role? }` → `201` |
| `POST` | `/api/auth/login` | Public | Login. Body: `{ email, password }` → `{ token, user }` (JWT 7d) |
| `GET` | `/api/auth/profile` | Bearer | Current user profile |

### Inventory

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/items` | Public | List items. Query: `?category=` `?search=` |
| `GET` | `/api/items/categories` | Public | Static categories: Controllers, Sensors, Power, Actuators, Tools |
| `GET` | `/api/items/:id` | Public | Single item |
| `POST` | `/api/items` | Admin | Create item. Body: `{ name, description?, category, location, quantity, image?, tags? }` |
| `PATCH` | `/api/items/:id` | Admin | Update item (auto-recalcs `available_quantity` when `quantity` changes) |
| `DELETE` | `/api/items/:id` | Admin | Delete item |

### Borrow Requests (v1.3.0+)

Non-admin members no longer borrow directly — they submit a request that an admin reviews.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/requests` | Bearer | Create a borrow request. Body: `{ inventory_id, quantity, purpose, duration_days? }` → creates a `PENDING` request → `201` |
| `GET` | `/api/requests` | Bearer | List requests. Members see only their own; Admins see all pending + reviewed |
| `PATCH` | `/api/requests/:id` | Admin | Approve or reject. Body: `{ status: "APPROVED" \| "REJECTED", reviewer_notes? }`. On approval, creates the underlying `borrow_records` entry and sends the borrow confirmation email |

### Borrow / Return

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/borrow/return` | Bearer | Return item. Body: `{ borrow_id }`. Sets `status=RETURNED`, `returned_at`, restores `available_quantity`, sends **return confirmation email** → `200` |
| `GET` | `/api/borrow/history` | Bearer | Borrow history. Members see only their own; Admins see all (joins resolved manually via `users` + `inventory`) |

> **Note:** direct `POST /api/borrow` (bypassing the request/approval queue) is retained for admin-initiated checkouts in some flows — confirm current behavior against `borrow.controller.ts` before relying on it for member-facing UI.

### Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/stats` | Public | `{ total_items, total_users, active_borrows, total_quantity, available_quantity, borrowed_quantity }` |
| `GET` | `/api/audit` | Bearer | Latest 50 audit log entries (joins `users` + `inventory`) |

### Example: Create a borrow request

```bash
curl -X POST http://localhost:5000/api/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "inventory_id": "<item-uuid>", "quantity": 2, "purpose": "Robo Soccer Project", "duration_days": 5 }'
```

```json
{
  "status": "success",
  "message": "Borrow request submitted for review.",
  "data": {
    "id": "...",
    "requester_id": "...",
    "requester_name": "Kushagra Garg",
    "inventory_id": "...",
    "quantity": 2,
    "purpose": "Robo Soccer Project",
    "status": "PENDING",
    "requested_at": "2026-08-15T10:02:11Z"
  }
}
```

---

## ✉️ Email Notification Workflow

All email logic lives in `backend/src/services/emailService.ts`. When `SMTP_USER` is unset, the service runs in **mock mode** (logs the email instead of sending) so development never breaks. When set, real SMTP delivery via Gmail.

```
                 ┌─────────────────────────────────────────────────────────────┐
                 │                     emailService.ts                         │
                 │  sendBorrowConfirmation()  sendReturnConfirmation()         │
                 │  sendReturnReminder()      sendDueReminder()                │
                 │  formatSmtpError()                                          │
                 └───────────────┬─────────────────────────────────────────────┘
                                 │ nodemailer (STARTTLS :587)
                                 ▼
                       Gmail App Password (SMTP_USER/SMTP_PASS)
```

### 1. Borrow confirmation (on approval)

Triggered when an admin approves a `PENDING` request via `PATCH /api/requests/:id`. Sent **asynchronously** (`.catch()` fire-and-forget) to the requester's email. Includes:

- **Item details** — name + category, quantity borrowed
- **Remaining available stock** — `available_quantity` after decrement
- **Current holders summary** — other active (`BORROWED`) records for the same item: name/roll, units, borrowed-on date
- **5-day due-date notice** — exact deadline (`borrowed_at + duration_days`, default 5) with a highlighted policy warning

### 2. Return confirmation

Triggered on `POST /api/borrow/return`. Sent to `req.user.email` with the item name and `returned_at` timestamp.

### 3. Due-today / overdue reminders (automated)

`backend/src/services/reminderScheduler.ts` starts in `server.ts` and runs:

- **Immediately on server boot**, and
- **Daily at 09:00** (configurable via `REMINDER_CRON`), unless `REMINDERS_ENABLED=false`.

The scheduler:

1. Selects all `borrow_records` with `status = 'BORROWED'` and `due_date < end-of-today`.
2. Resolves each borrower's **registered email** from `users.user_id`.
3. Sends `sendReturnReminder(...)` — subject `[CICR Inventory] OVERDUE Return: <item>` when `daysOverdue > 0`, otherwise `[CICR Inventory] Return Due Today: <item>`.
4. Stamps `reminder_sent_at` on the record to avoid duplicate sends within the same day.

> **Gmail notes:** App Passwords require 2-Step Verification on the account. `SMTP_FROM` must use the same account as `SMTP_USER`. Errors are caught, logged with `message / code / response / responseCode`, and never crash the API.

---

## 🧮 Back-of-the-Envelope (BOTE) Estimation & Scalability

Quick napkin math for the email pipeline, now backed by a **live analytics API** (`boteService.ts`, `GET /api/system/bote-metrics`) that turns current usage into the same figures below. Full derivation lives in [`docs/BOTE_ESTIMATION.md`](./docs/BOTE_ESTIMATION.md).

### Gmail daily throughput — the hard ceiling

Gmail's free tier caps outbound mail at **500 emails/day/account**. A borrow cycle costs **2 emails** (borrow + return confirmation), so:

```
max_transactions/day = 500 ÷ 2 = ~250 borrow transactions/day
```

| Metric | Value |
|--------|-------|
| Gmail free cap | 500 emails / day / account |
| Emails per borrow cycle | 2 (borrow + return) |
| **Max transactions / day** | **~250** |
| Max transactions / month | ~7,500 |

### Latency — synchronous SMTP vs. async queue

Current `emailService.ts` sends synchronously via Nodemailer; the reminder job (`reminderScheduler.ts`) awaits each recipient **sequentially** (~1 s per email).

| Scenario | Emails | Sequential `await` (current) | BullMQ workers (concurrency 25) |
|----------|-------:|:---:|:---:|
| Average club day | 20 | ~20 s | ~1 s |
| Busy club day | 250 | ~4.2 min | ~10 s |
| 10,000-user rollout | ~1,333 | ~22 min | ~53 s |

```
sequential_time = emails × 1 s        parallel_time = emails × 1 s / workers
```

### Memory at 10,000 students — a non-issue

A BullMQ job is ~2 KB (metadata + payload). A full reminder batch:

```
10,000 jobs × 2 KB = ~20 MB queue memory footprint
```

10,000 students × 2 borrows/month × 2 emails/cycle = **~40,000 emails/month ≈ 1,333/day** — 3× over Gmail's cap, yet only ~20 MB of queue memory.

### Provider comparison at 40,000 emails/month

| Provider | Free tier | Price per 1,000 | Daily cap (free) | Cost @ 40k/mo |
|----------|-----------|----------------:|:---:|:---:|
| **Gmail SMTP** (current) | 500 emails/day | $0 | 500/day | $0 (❌ cap exceeded) |
| **Resend** | 100 emails/day | ~$0.20 | 100/day | ~$8/mo |
| **AWS SES** | 3,000 emails/day* | $0.10 | 3,000/day | ~$4/mo |

\* New SES accounts start sandboxed (200/day); the 3,000/day trial applies to EC2-originated sending.

**Bottom line:** Gmail's ~250 transactions/day is plenty for club scale. At ~10,000 students, switch `emailService.ts` to the **Resend** or **AWS SES** SDK and run reminders through a **BullMQ/Redis** worker pool before the daily cap becomes the bottleneck.

---

## 🗄️ Database Schema

Tables: `users`, `inventory`, `borrow_records`, `request_records`, `audit_logs`.

### Schema diagram

```
users ─────────────────────────────┐
  id UUID PK                       │ user_id (no FK)      borrow_records
  name TEXT                        │                     ├─ id UUID PK
  email TEXT UNIQUE                │                     ├─ inventory_id UUID FK ──► inventory
  password_hash TEXT               │                     ├─ borrower_name TEXT        id UUID PK
  roll_number TEXT                 ├────────────────────►├─ roll_number TEXT          name TEXT
  role TEXT (ADMIN|MEMBER)         │                     ├─ purpose TEXT              description TEXT
  created_at TIMESTAMPTZ           │                     ├─ quantity INT              category TEXT
                                   │                     ├─ borrowed_at TIMESTAMPTZ  quantity INT
audit_logs                         │                     ├─ returned_at TIMESTAMPTZ  available_quantity INT
  id UUID PK                       ├──── user_id (FK)    ├─ status TEXT (BORROWED|RETURNED) location TEXT
  action TEXT                      │                     ├─ due_date TIMESTAMPTZ     tags, image, status...
  item_id UUID (FK) ► inventory ───┘                     └─ reminder_sent_at TIMESTAMPTZ

request_records
  id UUID PK
  requester_id UUID (no FK)
  inventory_id UUID FK ──► inventory
  quantity INT
  purpose TEXT
  status TEXT (PENDING|APPROVED|REJECTED)
  reviewer_notes TEXT
  requested_at TIMESTAMPTZ
  reviewed_at TIMESTAMPTZ
```

### DDL — run in the Supabase SQL Editor

```sql
-- ============ users ============
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  roll_number   TEXT,
  role          TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ inventory ============
CREATE TABLE IF NOT EXISTS public.inventory (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  description        TEXT,
  category           TEXT,
  quantity           INT  NOT NULL DEFAULT 0,
  available_quantity INT  NOT NULL DEFAULT 0,
  location           TEXT,
  tags               JSONB DEFAULT '[]'::jsonb,
  image              TEXT,
  status             TEXT DEFAULT 'AVAILABLE',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ borrow_records ============
CREATE TABLE IF NOT EXISTS public.borrow_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,                     -- logical link to users; NO FK constraint
  inventory_id  UUID REFERENCES public.inventory (id),
  borrower_name TEXT,
  roll_number   TEXT,
  purpose       TEXT,
  quantity      INT  NOT NULL DEFAULT 1,
  borrowed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'BORROWED' CHECK (status IN ('BORROWED', 'RETURNED'))
);

-- ============ due_date (v1.2.1 migration) ============
ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- ============ reminder_sent_at (v1.3.0 migration) ============
ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- ============ request_records (v1.3.0) ============
CREATE TABLE IF NOT EXISTS public.request_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id   UUID,                    -- logical link to users; NO FK constraint
  inventory_id   UUID REFERENCES public.inventory (id),
  quantity       INT  NOT NULL DEFAULT 1,
  purpose        TEXT,
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewer_notes TEXT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);

-- ============ audit_logs ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT,
  user_id     UUID REFERENCES public.users (id),
  item_id     UUID REFERENCES public.inventory (id),
  description TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_borrow_inventory   ON public.borrow_records (inventory_id);
CREATE INDEX IF NOT EXISTS idx_borrow_user        ON public.borrow_records (user_id);
CREATE INDEX IF NOT EXISTS idx_borrow_status      ON public.borrow_records (status);
CREATE INDEX IF NOT EXISTS idx_borrow_due_date    ON public.borrow_records (due_date);
CREATE INDEX IF NOT EXISTS idx_request_status     ON public.request_records (status);
CREATE INDEX IF NOT EXISTS idx_request_inventory  ON public.request_records (inventory_id);
```

### Notes

- `borrow_records.user_id` and `request_records.requester_id` intentionally have **no FK** — PostgREST embedding on a missing FK breaks, so the backend resolves names/emails manually in `getBorrowHistory` and the reminder/request services.
- **RLS:** anonymous-key deletes on `public.users` are blocked by RLS. Use the Supabase SQL Editor for user cleanup (e.g. `DELETE FROM public.users WHERE email LIKE '%@cicr.test';`).
- Backfill: if `available_quantity` was ever out of sync, recompute via `UPDATE public.inventory i SET available_quantity = i.quantity - COALESCE((SELECT SUM(b.quantity) FROM public.borrow_records b WHERE b.inventory_id = i.id AND b.status = 'BORROWED'), 0);`
- Run migrations `001_add_due_date_to_borrow_records.sql` and `002_add_reminder_sent_at_to_borrow_records.sql` in order against existing databases.

---

## 🧪 Testing

```bash
cd backend
npm test          # node --test "test/*.test.cjs"
```

- `test/auth.middleware.test.cjs` — unit tests for JWT auth middleware.
- `test/api.integration.test.cjs` — integration tests against the live Supabase project (health, auth, inventory, borrow/return, audit).
- `test/reminder.test.cjs` — coverage for the due-date reminder scheduler.
- `test/bote.test.cjs` — coverage for the BOTE capacity analytics service and endpoints.

> Integration tests register `*@cicr.test` users. RLS prevents anonymous deletion, so leftovers accumulate — clean them via the SQL Editor.

---

## 🚢 Deployment

### Backend → Render

```bash
# Build produces dist/ via tsc
cd backend
npm run build
npm start         # node dist/server.js
```

Render free tier will run the reminder scheduler on boot (boot-time due/overdue check + daily 09:00 job). Set the env vars from `.env.example` in the Render dashboard.

### Frontend → Vercel

```bash
npm run build     # tsc && vite build → dist/
npm run preview   # verify
```

The built frontend reads `API_BASE` from `src/main.ts:11` — point it at the Render backend URL.

---

## ⚠️ Known Issues & Roadmap

**Known issues:**

- `register` accepts `role: 'ADMIN'` from the client (role spoofing).
- `createItem` accepts negative `quantity`.
- `GET /api/stats` is public; `GET /api/audit` is visible to any authenticated member.
- Real email delivery requires a valid Gmail App Password; placeholders produce `535 BadCredentials`.
- A recent frontend PR (#12) was merged and then reverted (#13) before landing again in patched form (#14) — double-check current UI behavior against `main` if you're building on top of it.

**Roadmap:**

- [x] Role-based access (admin vs. member) — partial (admin middleware exists)
- [x] Overdue-loan notifications — automated reminder scheduler
- [x] PENDING borrow-request approval workflow
- [x] Live capacity/scale analytics (BOTE API)
- [ ] QR-code component tagging for instant lookup
- [ ] Export vault data (CSV / PDF reports)
- [ ] Move synchronous reminder emails to a queue (BullMQ/Redis) ahead of Gmail's daily cap

---

## 📜 License

Distributed under the MIT License. Built with 🧠 + 🔧 by the Creative & Innovative Cell in Robotics, JIIT-128.

<div align="center">

**© 2026 CICR Inventory Hub — Creative & Innovative Cell in Robotics**

[![Live Demo](https://img.shields.io/badge/VISIT-VAULT-00f0ff?style=for-the-badge)](https://cicrinventory.vercel.app/)

</div>
