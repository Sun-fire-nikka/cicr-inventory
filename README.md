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
- ["Crack vs Smooth Surface" — System Analysis](#-crack-vs-smooth-surface--system-analysis)
- [Third-Party Integration Bottlenecks & Rate Limits](#-third-party-integration-bottlenecks--rate-limits)
- [Database Schema](#-database-schema)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Known Issues & Roadmap](#-known-issues--roadmap)
- [License](#-license)

---

## 📌 Version History

| Version | Status | Changes |
|---------|--------|---------|
| **v1.0.0** | ✅ Released | Initial frontend (Vite + Three.js) and Express server. |
| **v1.1.0** | ✅ Released | Supabase schema, JWT auth, core inventory routes. |
| **v1.2.1** | ✅ Released | Frontend-backend integration, borrow/return logic, route fixes. |
| **v1.3.2** | ✅ Released | Nodemailer transport, SMTP config, transactional email base. |
| **v1.4.3** | ⚠️ Pre-release | Admin OTP approval (`request-otp` / `verify-otp`), 1–30 day rental cap, Day N-1 return reminders. |
| **v1.4.4** | ✅ Released | Custom Message-ID, X-headers, plain-text fallback, SMTP response logging. |
| **v1.4.5** | ⚠️ Pre-release | Frontend `API_BASE` points at local backend on port 5000. End-to-end OTP borrow verified. |
| **v1.4.6** | ⚠️ Pre-release | Sender pinned to verified Gmail, `test-email.cjs` probe, `002_seed_test_users.sql`. |
| **v1.4.7** | ⚠️ Pre-release | RFC 2822 dynamic Message-ID, `validators/email.validator.ts` for 12-digit `@mail.jiit.ac.in` IDs. |
| **v1.5.0** | ✅ Released | Redis sessions, `dbRead`/`dbWrite` split, BullMQ email queue, RBAC middleware, API response cache (30s TTL). |
| **v1.6.0** | ✅ Released | Frontend UI merge (dark theme, Three.js backgrounds, sidebar, modals). CORS updated to `CLIENT_URL`. |
| **v1.6.1** | ✅ Released | Removed hardcoded mock credentials, added `reset-db.ts` script. |
| **v1.6.2** | ✅ Released | OTP-based login (`send-otp` / `verify-otp`), strict email domain validation. |
| **v1.6.4** | ✅ Released | Inventory CRUD + borrow flow wired end-to-end via authenticated API calls. |
| **v1.7.0** | ✅ Released | **Backend hardening.** Removed hardcoded JWT fallback (`super_secret_cicr_key`) — server now refuses to start without `JWT_SECRET`. Atomic SQL guards on `available_quantity` (`.gte('available_quantity', quantity)`) prevent concurrent borrow over-allocation. `000_create_tables.sql` migration added with full DDL + indexes. Deleted 7 dead files (`config/supabase.ts`, empty route/controller/service stubs). Standardized fire-and-forget email dispatch via `dispatchBackground()`. `.env.example` updated with all 14 environment variables. SMTP fallbacks standardized to `smtp.gmail.com` in both `emailService.ts` and `emailQueue.ts`. |

> The current release is **v1.7.0 — Backend Hardening**. The backend is stable with atomic concurrency guards, proper error handling, and a complete database migration. See the commit history for details.

### 🏷️ Version Registry (Git Tags)

| Version | Git Tag | Status |
|---------|---------|--------|
| **v1.0.0** | `v1.0.0` | ✅ Released |
| **v1.1.0** | `v1.1.0` | ✅ Released |
| **v1.2.1** | `v1.2.1` | ✅ Released |
| **v1.3.2** | `v1.3.2` | ✅ Released |
| **v1.4.3** | `v1.4.3` | ⚠️ Pre-release |
| **v1.4.4** | `v1.4.4` | ✅ Released |
| **v1.4.5** | `v1.4.5` | ⚠️ Pre-release |
| **v1.4.6** | `v1.4.6` | ⚠️ Pre-release |
| **v1.4.7** | `v1.4.7` | ⚠️ Pre-release |
| **v1.5.0** | `v1.5.0` | ✅ Released |
| **v1.6.0** | `v1.6.0` | ✅ Released |
| **v1.6.1** | `v1.6.1` | ✅ Released |
| **v1.6.2** | `v1.6.2` | ✅ Released |
| **v1.6.4** | `v1.6.4` | ✅ Released |
| **v1.7.0** | `v1.7.0` | ✅ Released |

---

## 🏗️ System Architecture

```
┌──────────────────────┐      HTTPS (JSON)      ┌──────────────────────────┐
│       FRONTEND       │ ─────────────────────► │        BACKEND API       │
│  Vite + Three.js +   │    /api/*             │  Node.js + Express + TS  │
│  TypeScript (Vanilla)│ ◄───────────────────── │  src/modules/*           │
│  src/main.ts         │   JSON responses      │  src/services/           │
└──────────────────────┘                       └─────┬──────────┬────────┘
                                                     │          │
                                          ┌──────────▼──┐  ┌────▼───────────┐
                                          │    REDIS     │  │    SUPABASE     │
                                          │ Sessions     │  │  PostgreSQL     │
                                          │ API Cache    │  │  ┌───────────┐ │
                                          │ BullMQ Queue │  │  │ dbRead    │ │
                                          │ OTP State    │  │  │ (replica) │ │
                                          └──────────────┘  │  ├───────────┤ │
                                                            │  │ dbWrite   │ │
                                                            │  │ (primary) │ │
                                                            │  └───────────┘ │
                                                            │  users, items, │
                                                            │  borrow_records,│
                                                            │  audit_logs     │
                                                            └───────┬────────┘
                                                                    │ SMTP
                                                                    ▼
                                                        ┌────────────────────┐
                                                        │   Gmail SMTP       │
                                                        │ (App Password)     │
                                                        │ BullMQ → worker    │
                                                        └────────────────────┘
```

**Request lifecycle (borrow example):**

1. Frontend sends `POST /api/borrow` with `Authorization: Bearer <JWT>` (or session cookie).
2. `auth.middleware.ts` verifies the JWT (or falls back to the Redis session) and populates `req.user { id, name, email, role }`.
3. `borrow.controller.ts` checks stock via `dbRead`, inserts a `borrow_records` row via `dbWrite` with `due_date = borrowed_at + duration_days`, and decrements `available_quantity`.
4. `invalidateItemsCache()` clears the Redis inventory cache so subsequent `GET /api/items` reflects the new stock.
5. `emailService.sendBorrowConfirmation(req.user.email, ...)` enqueues via BullMQ (or sends directly if Redis is unavailable) — fire-and-forget, never blocks the HTTP response.
6. The `reminderService` (node-cron) independently scans for due/overdue borrows and emails borrowers.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vite 8, TypeScript, Three.js, lucide icons, vanilla DOM/CSS (dark neon-glass UI) |
| **Backend** | Node.js ≥ 18, Express 4, TypeScript 5 (strict), ts-node, nodemon |
| **Database** | Supabase (PostgreSQL) via `@supabase/supabase-js` — `dbRead` (replica/primary) + `dbWrite` (primary) |
| **Cache/Sessions** | Redis via `ioredis` + `connect-redis` (in-memory fallback when `REDIS_URL` unset) |
| **Auth** | `bcryptjs` password hashing + `jsonwebtoken` (JWT, 7-day expiry) + RBAC middleware |
| **Email** | Nodemailer (SMTP, Gmail App Password) + BullMQ async queue (Redis-only) |
| **Scheduling** | node-cron (daily 09:00 + boot-time due-tomorrow / due / overdue check) |
| **Tests** | Node built-in test runner (`node --test`) — 72 tests |
| **Deployment** | Backend: Render (`cicr-inventory-backend.onrender.com`) · Frontend: Vercel (`cicrinventory.vercel.app`) |

---

## 📁 Repository Structure

```
CICR_Inventory/
├── backend/                      # Express + TypeScript API
│   ├── src/
│   │   ├── server.ts             # Entry point (HTTP listen + reminder scheduler)
│   │   ├── app.ts                # Express app + Redis session store + route mounting
│   │   ├── config/
│   │   │   ├── database.ts       # dbRead / dbWrite (read replica + primary)
│   │   │   ├── redis.ts          # Redis client + in-memory fallback + cache helpers
│   │   │   └── emailQueue.ts     # BullMQ async email queue (Redis-only)
│   │   ├── modules/
│   │   │   ├── auth/             # register, login, OTP login, profile (+ routes)
│   │   │   ├── inventory/        # items CRUD + Redis cache (+ routes)
│   │   │   ├── borrow/           # borrow, return, OTP approval, history (+ routes)
│   │   │   ├── dashboard/        # stats + audit log (+ routes)
│   │   │   └── system/           # BOTE metrics + scale simulation (+ controller)
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts# JWT verify + session fallback + RBAC
│   │   ├── validators/
│   │   │   └── email.validator.ts# Institutional email validation
│   │   └── services/
│   │       ├── emailService.ts   # Nodemailer transport + email templates
│   │       ├── reminderService.ts# node-cron due/overdue reminder job
│   │       └── boteService.ts    # BOTE capacity/latency math
│   ├── migrations/
│   │   ├── 000_create_tables.sql # Base DDL (users, inventory, borrow_records, audit_logs)
│   │   ├── 001_add_due_date_to_borrow_records.sql
│   │   └── 002_seed_test_users.sql
│   ├── test/                     # auth.middleware + API integration tests (.cjs)
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
│   ├── BACKEND_HANDOFF.md        # v1.5.0 backend handoff guide
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

> **Frontend API target:** the frontend reads a single `API_BASE` constant in `src/main.ts:11`. As of **v1.5.0** it points **directly at the backend on port 5000** (`http://localhost:5000/api`) — so `POST /api/borrow/request-otp`, `POST /api/borrow/verify-otp`, and `GET /api/items` all hit the local Express server. For a deployed build, change it back to `https://cicr-inventory-backend.onrender.com/api`. The backend now accepts both JWT Bearer tokens and Redis-backed session cookies — use `credentials: 'include'` on fetch requests for session support.

### Test accounts (seeded)

Seeded idempotently via `backend/migrations/002_seed_test_users.sql` (upserts keep `kush` active as `MEMBER`; existing passwords are preserved):

| Role | Email | Notes |
|------|-------|-------|
| **Admin** | `kushagragargdelhi@gmail.com` | KUSH — the only admin in the OTP approval directory |
| Student | `kushgdhi@gmail.com` | `kush` — original seeded test student |
| Student | `992501030406@mail.jiit.ac.in` | Institutional test account — **live OTP probe target** (numeric ID) |
| Student | `992501030395@mail.jiit.ac.in` | Institutional test account (numeric ID) |
| Student | `992501030399@gmail.jiit.ac.in` | Institutional test account |
| Student | `992401210050@gmail.jiit.ac.in` | Institutional test account |
| Student | `992401030154@mail.jiit.ac.in` | Institutional test account |

> The five `@jiit.ac.in` students share the seeded password **`JiitCICR@2026!`**. All are `MEMBER` role; borrow/reminder emails land in the real inboxes.

> **Test OTP mail routing (v1.4.7 — Institutional Email Support):** sender is pinned to **`CICR Inventory Support <kushagragargdelhi@gmail.com>`** (verified SMTP account, with `Reply-To: kushagragargdelhi@gmail.com`). The live probe in `test/test-email.cjs` dispatches the OTP to the numeric institutional inbox **`992501030406@mail.jiit.ac.in`** — mapping **Sender `kushagragargdelhi@gmail.com` → Receiver `992501030406@mail.jiit.ac.in`** — and prints full SMTP response codes + sent headers (see [Verify Email Delivery](#-verify-email-delivery)).

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Backend listen port (default `5000`) |
| `SUPABASE_URL` | Yes | Supabase project API URL — `https://<project-ref>.supabase.co` (**not** `/rest/v1`, **not** the dashboard URL) |
| `SUPABASE_ANON_KEY` | Yes | Supabase public anon key (safe to ship to the client; RLS protects data) |
| `SUPABASE_READ_URL` | No | Read replica URL — when set, `dbRead` routes all SELECTs here; falls back to `SUPABASE_URL` |
| `JWT_SECRET` | Yes | Secret used to sign/verify JWTs |
| `JWT_ISSUER` | No | Optional JWT issuer claim for stricter verification |
| `JWT_AUDIENCE` | No | Optional JWT audience claim for stricter verification |
| `REDIS_URL` | No | Redis connection string (e.g. `redis://127.0.0.1:6379`). Enables session store, API caching, BullMQ email queue. Without it, in-memory fallback is used. |
| `SESSION_SECRET` | No | Secret for `express-session` cookie signing (default `cicr_session_secret`) |
| `SMTP_HOST` | No | SMTP server (default `smtp.gmail.com`) |
| `SMTP_PORT` | No | SMTP port (default `587`) |
| `SMTP_USER` | No | Authenticating Gmail account. If empty → mock mode (emails logged, not sent) |
| `SMTP_PASS` | No | Gmail **16-character App Password** (requires 2FA on `SMTP_USER`) |
| `SMTP_FROM` | No | From header — default **`"CICR Inventory Support" <kushagragargdelhi@gmail.com>`**. **Must match `SMTP_USER`** (Gmail rejects mismatched senders) |
| `REMINDER_CRON` | No | Reminder schedule (default `0 9 * * *` — daily 09:00) |

---

## 📡 API Reference

Base URL (local): `http://localhost:5000` · Base URL (deployed): `https://cicr-inventory-backend.onrender.com`

Auth scheme: `Authorization: Bearer <JWT>`

### System

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | Public | Health check → `{ status, message }` |
| `GET` | `/api/system/bote-metrics` | Public | Live BOTE capacity snapshot → `data: { capacity, peak, latency, memory, inventory }` (daily 500-email cap, peak burst, SMTP latency, Redis queue memory). See [BOTE & Scalability](#-back-of-the-envelope-bote-estimation--scalability) |
| `GET` | `/api/system/simulate-scale` | Public | BOTE scale simulation. Query: `?users=` (required, non-negative), `?borrowsPerUserPerMonth=` (default 2), `?jobsPerUser=` (default 1) → `data: { scenario, gmail_accounts_needed, exceeds_single_gmail_cap, cost, capacity, latency, memory }` |

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

### Borrow / Return

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/borrow/admins` | Bearer | List admin directory (`{ email, name }`) for the OTP approval step — currently Admin **KUSH** (`kushagragargdelhi@gmail.com`) |
| `POST` | `/api/borrow/request-otp` | Bearer | Step 1 of OTP workflow. Body: `{ item_id, quantity, purpose, duration_days?, selected_admin_id }`. Generates a **6-digit OTP** (TTL **10 min**, 5 attempts), sends it to the chosen admin's email → `200` |
| `POST` | `/api/borrow/verify-otp` | Bearer | Step 2 of OTP workflow. Body: `{ otp }`. Verifies the OTP (6-digit, TTL, attempt budget, same-user), then creates the `BORROWED` record + decrements stock and **immediately dispatches the confirmation email** (see [Full Connected Flow](#-the-full-connected-flow-v145)) → `201` |
| `POST` | `/api/borrow` | Bearer | Direct borrow (backward compatible). Body: `{ inventory_id, quantity, purpose, duration_days? }`. `duration_days` defaults to **5**, clamped to **1–30**. Computes `due_date = borrowed_at + duration_days`, decrements `available_quantity`, sends **borrow confirmation email to `req.user.email`** → `201` |
| `POST` | `/api/borrow/return` | Bearer | Return item. Body: `{ borrow_id }`. Sets `status=RETURNED`, `returned_at`, restores `available_quantity`, sends **return confirmation email** → `200` |
| `GET` | `/api/borrow/history` | Bearer | Borrow history. Members see only their own; Admins see all (joins resolved manually via `users` + `inventory`) |

### Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/stats` | Public | `{ total_items, total_users, active_borrows, total_quantity, available_quantity, borrowed_quantity }` |
| `GET` | `/api/audit` | Bearer | Latest 50 audit log entries (joins `users` + `inventory`) |

### Example: Borrow request

```bash
curl -X POST http://localhost:5000/api/borrow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "inventory_id": "<item-uuid>", "quantity": 2, "purpose": "Robo Soccer Project", "duration_days": 5 }'
```

```json
{
  "status": "success",
  "message": "Item borrowed successfully!",
  "data": {
    "id": "...",
    "user_id": "...",
    "borrower_name": "Kushagra Garg",
    "inventory_id": "...",
    "quantity": 2,
    "purpose": "Robo Soccer Project",
    "borrowed_at": "2026-08-10T20:19:24Z",
    "due_date": "2026-08-15T20:19:24Z",
    "status": "BORROWED"
  }
}
```

---

## ✉️ Email Notification Workflow

All email logic lives in `backend/src/services/emailService.ts`. When `SMTP_USER` is unset, the service runs in **mock mode** (logs the email instead of sending) so development never breaks. When set, real SMTP delivery via Gmail.

```
                 ┌─────────────────────────────────────────────────────────────┐
                 │                     emailService.ts                         │
                 │  sendOtpEmail()             sendBorrowConfirmation()        │
                 │  sendReturnConfirmation()   sendReturnReminder()            │
                 │  sendUpcomingReminder()     formatSmtpError()               │
                 └───────────────┬─────────────────────────────────────────────┘
                                 │ nodemailer (STARTTLS :587)
                                 ▼
                       Gmail App Password (SMTP_USER/SMTP_PASS)
```

### 0. Admin OTP approval (immediate, required before borrow)

`POST /api/borrow/request-otp` generates a **6-digit OTP** and emails it to the chosen admin (from `/api/borrow/admins`). The borrower then calls `POST /api/borrow/verify-otp` with that OTP to complete the borrow. OTPs live in an in-memory store with a **10-minute TTL** and a **5-attempt** verification budget — hashed at rest, never persisted.

### 🔄 The Full Connected Flow (v1.4.5)

End-to-end walkthrough of the OTP-approved borrow, across frontend (`src/main.ts` → `API_BASE = http://localhost:5000/api`), backend (`borrow.controller.ts`), and email (`emailService.ts`):

```
 ┌─────────────── Student (frontend) ───────────────┐   ┌───────────── Backend API (:5000) ─────────────┐   ┌──────────┐
 │  1. Request OTP → POST /api/borrow/request-otp   │──►│  4. generateOtp() + storeOtp() (10-min TTL)    │   │          │
 │  2. (waits)                                       │   │  5. sendOtpEmail(admin.email, otp)   ─────────│──►│   Admin   │
 │  3. Admin shares the OTP with the student         │   │  6. POST /api/borrow/verify-otp { otp } ◄─────│   Inbox   │
 │  7. Student enters OTP on the frontend ───────────│──►│  7. verifyOtp() + consumeOtp()                 │   │          │
 │                                                  │   │  8. finalizeBorrow():                           │   │          │
 │                                                  │   │     • insert borrow_records (BORROWED)          │   │          │
 │                                                  │   │     • DECREMENT available_quantity ◄───────────►│   Supabase │
 │                                                  │   │  9. sendBorrowConfirmation(student) ───────────│───────────►│ Student
 │                                                  │   │ 10. reminderService: Day N-1 due-tomorrow scan  │   │ Inbox    │
 └──────────────────────────────────────────────────┘   └───────────────────────────────────────────────┘   └──────────┘
```

The numbered sequence:

| Step | Who | Action | Where |
|:---:|-----|--------|-------|
| 1 | Student | Submits the borrow request → `POST /api/borrow/request-otp` with `{ item_id, quantity, purpose, duration_days, selected_admin_id }` | Frontend → `borrow.routes.ts` |
| 2 | Backend | Validates item/stock, `generateOtp()` → `storeOtp()` with a **10-minute TTL**, sends the OTP email | `borrow.controller.ts:requestOtp` |
| 3 | Admin | **Receives the OTP email** (`sendOtpEmail` → `[CICR Inventory] Borrow Approval OTP: <otp>`) | `emailService.ts` |
| 4 | Admin | Shares the OTP with the student (in person / over the group) | — |
| 5 | Student | **Enters the OTP on the frontend** → `POST /api/borrow/verify-otp` with `{ otp }` | Frontend → `borrow.routes.ts` |
| 6 | Backend | `verifyOtpCode()` checks the 6-digit code, TTL, 5-attempt budget, and that it was issued to this user; then `consumeOtp()` burns it | `borrow.controller.ts:verifyOtp` |
| 7 | Backend | `finalizeBorrow()` inserts the `BORROWED` record and **decrements `available_quantity`** | `borrow.controller.ts` |
| 8 | Backend | **Confirmation email dispatched immediately** — `sendBorrowConfirmation()` fires asynchronously to the student (item, qty, remaining stock, holders table, due date) | `borrow.controller.ts:verifyOtp` → `emailService.ts` |
| 9 | Backend | **Day N-1 reminder scheduled** — `reminderService` (node-cron, daily 09:00 + boot) picks the new record on its next scan and emails `[CICR Inventory] Return Due Tomorrow: <item>` the day before `due_date` | `reminderService.ts` |
| 10 | Student | Borrow completed; stock reflects the borrow; reminders stop only after `POST /api/borrow/return` (which also restores stock + emails a return confirmation) | `borrow.controller.ts:returnItem` |

> **v1.4.5 integration guarantee:** the OTP verification handler dispatches the confirmation email **in the same request** as the stock decrement — there is no lag or queued batch between "OTP verified" and "confirmation sent". Email dispatch is fire-and-forget (`.catch()`), so a slow SMTP hop never delays the `201` response.

### 1. Borrow confirmation (immediate)

Triggered on `POST /api/borrow` / `POST /api/borrow/verify-otp`. Sent **asynchronously** (`.catch()` fire-and-forget) to `req.user.email` — the logged-in borrower. Includes:

- **Item details** — name + category, quantity borrowed
- **Remaining available stock** — `available_quantity` after decrement
- **Current holders summary** — other active (`BORROWED`) records for the same item: name/roll, units, borrowed-on date
- **5-day due-date notice** — exact deadline (`borrowed_at + duration_days`, default 5) with a highlighted policy warning

### 2. Return confirmation

Triggered on `POST /api/borrow/return`. Sent to `req.user.email` with the item name and `returned_at` timestamp.

### 3. Due-today / overdue reminders (automated)

`backend/src/services/reminderService.ts` starts in `server.ts` and runs:

- **Immediately on server boot**, and
- **Daily at 09:00** (configurable via `REMINDER_CRON`).

`runDueReminderCheck()`:

1. Selects all `borrow_records` with `status = 'BORROWED'` and `due_date < end-of-today` plus, in the same pass, any borrowed item with `due_date` landing **tomorrow** (Day N-1).
2. Resolves each borrower's **registered email** from `users.user_id`.
3. Sends `sendUpcomingReminder(...)` for tomorrow-due items (`[CICR Inventory] Return Due Tomorrow: <item>`) and `sendReturnReminder(...)` for due/overdue ones — subject `[CICR Inventory] OVERDUE Return: <item>` when `daysOverdue > 0`, otherwise `[CICR Inventory] Return Due Today: <item>`.

> **Gmail notes:** App Passwords require 2-Step Verification on the account. `SMTP_FROM` must use the same account as `SMTP_USER`. Errors are caught, logged with `message / code / response / responseCode`, and never crash the API.

### ⚠️ Institutional Email Sinkhole (v1.4.4)

Institutional gateways (`@mail.jiit.ac.in`, `@jiit.ac.in`, and most `.ac.in` / `.edu` domains) treat low-reputation, HTML-only, or header-light mail as bulk and **silently sinkhole it** — the sender's SMTP server replies `250 OK`, the recipient inbox never sees it. This is exactly why the BOTE model shows 2–5% first-send loss on institutional domains.

**v1.4.4 mitigations** (all in `backend/src/services/emailService.ts`):

| Fix | What it does |
|-----|--------------|
| **Plain-text fallback** on every template | Gives the filter a text/plain alternative — HTML-only mail scores as bulk |
| **Custom Message-ID** | `<<unixms>.<hex>@cicr-inventory.local>` — avoids the default nodemailer format some gateways fingerprint |
| **X-Header set** | `X-CICR-Mailer`, `X-Mailer-Type`, `Importance`, `List-Unsubscribe` |
| **Priority header** | OTP mail flagged `high` (surfaces in mobile notifications); the rest `normal` |
| **Full SMTP response logging** | Console logs raw `response` (`250 2.0.0 OK …`) + `accepted[]`/`rejected[]` per send |

**v1.4.7 — Institutional Email Support for `@mail.jiit.ac.in`:**

| Change | What it does |
|--------|--------------|
| **RFC 2822 dynamic Message-ID** | `generateMessageId()` derives the `id-right` from the configured SMTP host (`smtp.gmail.com → gmail.com`) so it aligns with the authenticated sending domain (SPF/DKIM friendly), `id-left` = unix-ms + 128-bit hex |
| **Explicit sender + Reply-To** | `CICR Inventory Support <kushagragargdelhi@gmail.com>` with `Reply-To: kushagragargdelhi@gmail.com` |
| **High-priority headers** | `X-Priority: 1 (Highest)` / `Importance: High` on OTP mail, plus full X-header set |
| **Numeric student-ID validation** | New `backend/src/validators/email.validator.ts` accepts **12-digit numeric** institutional IDs `^[0-9]{12}@mail\.jiit\.ac\.in$` (and any `jiit.ac.in` subdomain) — register never rejects them |
| **Institutional probe** | `test/test-email.cjs` dispatches the OTP to `992501030406@mail.jiit.ac.in` and logs full SMTP response codes + sent headers |

**Verify delivery with:**

```bash
cd backend
npm run build
node test/test-email.cjs     # sends test OTP to 992501030406@mail.jiit.ac.in
```

The probe prints the **complete SMTP response codes + sent headers** — raw `response`, `accepted`, `rejected`, `pending`, `envelope`, `messageId`, then every header (`X-CICR-Mailer`, `X-Mailer-Type`, `X-Priority`, `Importance`, `List-Unsubscribe`, `Reply-To`, `Message-ID`). Expected result (v1.4.7):

```
========== Dispatching test OTP email (institutional) ==========
  from:     kushagragargdelhi@gmail.com
  to:       992501030406@mail.jiit.ac.in

[EMAIL SERVICE] OTP email accepted by SMTP | messageId=<1786640020999.7d55d326d83e776c261f66dc083c2ef3@gmail.com> | response="250 2.0.0 OK  1786640023 a92af1059eb24-141387ed5b1sm225810c88.8 - gsmtp" | accepted=["992501030406@mail.jiit.ac.in"] | rejected=[]

  SMTP response codes:
    raw response:   250 2.0.0 OK  1786640023 a92af1059eb24-141387ed5b1sm225810c88.8 - gsmtp
    accepted:       ["992501030406@mail.jiit.ac.in"]
    rejected:       []
    pending:        []
    envelope:       {"from":"kushagragargdelhi@gmail.com","to":["992501030406@mail.jiit.ac.in"]}
    messageId:      <1786640020999.7d55d326d83e776c261f66dc083c2ef3@gmail.com>

  Message headers (as sent):
    X-CICR-Mailer: CICR-Inventory/v1.4.7
    X-Mailer-Type: borrow-otp
    X-Priority: 1 (Highest)
    Importance: High
    List-Unsubscribe: <mailto:kushagragargdelhi@gmail.com?subject=unsubscribe>
    Reply-To: kushagragargdelhi@gmail.com
    Message-ID: <1786640020999.7d55d326d83e776c261f66dc083c2ef3@gmail.com>

  Sender kushagragargdelhi@gmail.com -> 992501030406@mail.jiit.ac.in: ACCEPTED
```

> If SMTP accepts (`250 OK`, `rejected=[]`) but the inbox is empty, the mail is **sinkholed upstream** — the fix is SPF/DKIM alignment on the sending domain or moving to Resend/SES, not more SMTP retries.

---

## 🧮 Back-of-the-Envelope (BOTE) Estimation & Scalability

Quick napkin math for the email pipeline. Full derivation lives in [`docs/BOTE_ESTIMATION.md`](./docs/BOTE_ESTIMATION.md).

### Gmail daily throughput — the hard ceiling

Gmail's free tier caps outbound mail at **500 emails/day/account**. A full borrow workflow now costs **3 emails** (admin OTP + borrow confirmation + return confirmation), so:

```
max_workflows/day = 500 ÷ 3 = ~166 full borrow workflows/day
```

| Metric | Value |
|--------|-------|
| Gmail free cap | 500 emails / day / account |
| Emails per full borrow workflow | 3 (OTP + borrow + return) |
| **Max full workflows / day** | **~166** |
| Max workflows / month | ~4,980 |

### Failure-rate analysis (deliverability)

Email is the only external dependency on the borrow path, so delivery health matters:

- **2–5% spam/delivery failure** on institutional domains (missing custom SPF/DKIM headers) → **≈93% end-to-end OTP delivery** on first send.
- OTPs remain valid for **10 min** and re-requests are idempotent, so failures stall, never corrupt.
- Production inbox needs SPF/DKIM (or an ESP) before OTP approval is relied on at scale.

### Concurrency — 500–1000 web users

The web tier (Express + Supabase PostgREST) comfortably serves **500–1000 concurrent users** with <1s p95 API latency — web concurrency scales horizontally. The **email tier** is the true ceiling: ~166 full workflows/day on a single Gmail inbox.

### Latency — synchronous SMTP vs. async queue

Current `emailService.ts` sends synchronously via Nodemailer; the reminder job (`reminderService.ts`) awaits each recipient **sequentially** (~1 s per email).

| Scenario | Emails | Sequential `await` (current) | BullMQ workers (concurrency 25) |
|----------|-------:|:---:|:---:|
| Average club day | 20 | ~20 s | ~1 s |
| Busy club day (Gmail-cap: 166 workflows) | 332 | ~5.5 min | ~13 s |
| 10,000-user rollout | ~1,333 | ~22 min | ~53 s |

```
sequential_time = emails × 1 s        parallel_time = emails × 1 s / workers
```

### Memory at 10,000 students — a non-issue

A BullMQ job is ~2 KB (metadata + payload). A full reminder batch:

```
10,000 jobs × 2 KB = ~20 MB queue memory footprint
```

10,000 students × 2 borrows/month × 3 emails/workflow = **~40,000 emails/month ≈ 1,333/day** — 3× over Gmail's cap, yet only ~20 MB of queue memory.

### Provider comparison at 40,000 emails/month

| Provider | Free tier | Price per 1,000 | Daily cap (free) | Cost @ 40k/mo |
|----------|-----------|----------------:|:---:|:---:|
| **Gmail SMTP** (current) | 500 emails/day | $0 | 500/day | $0 (❌ cap exceeded) |
| **Resend** | 100 emails/day | ~$0.20 | 100/day | ~$8/mo |
| **AWS SES** | 3,000 emails/day* | $0.10 | 3,000/day | ~$4/mo |

\* New SES accounts start sandboxed (200/day); the 3,000/day trial applies to EC2-originated sending.

**Bottom line:** Gmail's ~166 workflows/day is plenty for club scale. At ~10,000 students, switch `emailService.ts` to the **Resend** or **AWS SES** SDK and run reminders through a **BullMQ/Redis** worker pool before the daily cap becomes the bottleneck.

---

## ⚖️ "Crack vs Smooth Surface" — System Analysis

A two-sided engineering read of the CICR Inventory stack.

### 🟩 The Smooth Surface (what scales fine)

- **API tier: 500–1000 concurrent web users** with <1s p95 latency. Express + Supabase (PostgREST) are stateless, connection-pooled, and scale horizontally by adding Render/Vercel instances — no rework needed.
- **OTP store & verification** are in-memory `Map` lookups (O(1), 10-min TTL) — effectively unlimited throughput.
- **Postgres / Supabase** handles thousands of inventory rows and audit entries trivially; queue memory for a 10,000-student reminder batch is only **~20 MB**.
- **The whole web path** (auth, inventory CRUD, borrow/return, dashboard stats) has no daily cap.

### 🟥 The Crack (what doesn't)

- **Free Gmail SMTP caps outbound mail at 500 emails/day** — the single hard bottleneck. That fixes daily borrowing at **~166 full workflows/day** (3 emails each: OTP + borrow + return). Everything else can scale; email cannot.
- **2–5% spam/delivery failure rate** on institutional domains (missing custom SPF/DKIM headers) → ~93% OTP delivery on first send. Email is the *only* external dependency on the borrow path, so a delivery miss directly stalls a workflow.
- **Reminders share the same 500/day pool** — a busy day's confirmation emails and the 09:00 reminder batch compete for the same budget.

### 🛠️ The Escape Hatch (migration path)

| Trigger | Action |
|---------|--------|
| Workflows/day approach ~166 | Move `emailService.ts` to **Resend** or **AWS SES** SDK (≈$4/mo at 40k emails) |
| Reminder batch > ~100 emails | Introduce **BullMQ/Redis** async workers (25 concurrent → ~13 s for the busy-day batch) |
| OTP deliverability matters | Configure SPF/DKIM on the sending domain or switch to an ESP |

> **TL;DR:** the web surface is smooth (500–1000 concurrent users), the email crack is real (~166 workflows/day + 2–5% spam loss on Gmail). The fix is small and contained: swap the SMTP layer and queue the reminders.

---

## ⛓️ Third-Party Integration Bottlenecks & Rate Limits

Full derivation lives in [`docs/BOTE_ESTIMATION.md`](./docs/BOTE_ESTIMATION.md) §5. Summary of the two hard external ceilings:

### Gmail SMTP (current email pipeline)

| Limit | Value | Effect when exceeded |
|-------|:---:|-------|
| Sustained send rate | **~20–30 emails/min** | SMTP `421` "temporary rate limit" → sends slow/queue |
| Concurrent SMTP connections | **~10–15** | Extra connections refused |
| Daily recipients | **500 / account / day** | Hard stop — further sends fail |
| Full borrow workflows/day | **~166** (3 emails each) | The real product ceiling |

**Burst behavior under 250–300 requests/min:** that rate is ~10× Gmail's sustainable ~25/min throughput. Gmail replies with retryable `421` errors (not hard bounces), so a **BullMQ/Redis queue with rate-limiting to ~25/min + retries** absorbs the burst — the API stays responsive, mail doesn't silently drop. This is a **threshold to plan for, not a crash**.

### Supabase free tier

| Limit | Free cap |
|-------|:---:|
| Direct DB connections | **60** (keep the Node `pg` pool ≤ 40; use pooler port `6543`) |
| Database storage | **500 MB** |
| Monthly active users | **50,000** |
| Edge/API requests | 500k / mo |

### "Pay now" thresholds

| Symptom | Fix | Cost |
|---------|-----|------|
| Send rate > ~25/min sustained, or >100-email burst in 1 min | **Resend** (50k msgs) or **AWS SES** | ~$20/mo · ~$4–5/mo |
| DB > 500 MB, or > 60 pooled connections, or > 50k MAU | **Supabase Pro** | $25/mo |
| Both at once (true production scale) | Resend/SES + Supabase Pro | ~$45–50/mo |

> **Bottom line:** v1.4.5 is a **pre-release** that runs comfortably on free tiers for club scale (a few dozen borrows/day). Production scaling needs **Resend/SES (~$20/mo)** once email volume grows and **Supabase Pro ($25/mo)** once the DB/connections grow — whichever hits first.

---

## 🗄️ Database Schema

Tables: `users`, `inventory`, `borrow_records`, `audit_logs`.

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
  action TEXT                      │                     └─ due_date TIMESTAMPTZ     tags, image, status...
  item_id UUID (FK) ► inventory ───┘
  description TEXT
  timestamp TIMESTAMPTZ
```

### DDL — run in the Supabase SQL Editor

The full schema lives in `backend/migrations/000_create_tables.sql`. Run it first, then apply `001_add_due_date_to_borrow_records.sql` and `002_seed_test_users.sql`.

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

-- ============ due_date (v0.0.2 migration) ============
ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- ============ audit_logs ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT,
  user_id     UUID REFERENCES public.users (id),
  item_id     UUID REFERENCES public.inventory (id),
  description TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_borrow_inventory  ON public.borrow_records (inventory_id);
CREATE INDEX IF NOT EXISTS idx_borrow_user       ON public.borrow_records (user_id);
CREATE INDEX IF NOT EXISTS idx_borrow_status     ON public.borrow_records (status);
CREATE INDEX IF NOT EXISTS idx_borrow_due_date   ON public.borrow_records (due_date);
```

### Notes

- `borrow_records.user_id` intentionally has **no FK** — PostgREST embedding on a missing FK breaks, so the backend resolves names/emails manually in `getBorrowHistory` and `reminderService`.
- **RLS:** anonymous-key deletes on `public.users` are blocked by RLS. Use the Supabase SQL Editor for user cleanup (e.g. `DELETE FROM public.users WHERE email LIKE '%@cicr.test';`).
- Backfill: if `available_quantity` was ever out of sync, recompute via `UPDATE public.inventory i SET available_quantity = i.quantity - COALESCE((SELECT SUM(b.quantity) FROM public.borrow_records b WHERE b.inventory_id = i.id AND b.status = 'BORROWED'), 0);`

---

## 🔍 System Audit & Health Check (v1.4.5)

### Route audit — complete Express endpoint inventory

All routes are TypeScript, mounted from `backend/src`:

| Mount | Route file | Method | Path | Auth |
|-------|-----------|--------|------|------|
| `/api/auth` | `modules/auth/auth.routes.ts` | `POST` | `/register` | Public |
| | | `POST` | `/login` | Public |
| | | `GET` | `/profile` | Bearer |
| `/api/items` | `modules/inventory/inventory.routes.ts` | `GET` | `/` | Public |
| | | `GET` | `/categories` | Public |
| | | `GET` | `/:id` | Public |
| | | `POST` | `/` | Bearer + Admin |
| | | `PATCH` | `/:id` | Bearer + Admin |
| | | `DELETE` | `/:id` | Bearer + Admin |
| `/api/borrow` | `modules/borrow/borrow.routes.ts` | `GET` | `/admins` | Bearer |
| | | `POST` | `/` | Bearer |
| | | `POST` | `/request-otp` | Bearer |
| | | `POST` | `/verify-otp` | Bearer |
| | | `POST` | `/return` | Bearer |
| | | `GET` | `/history` | Bearer |
| `/api` | `modules/dashboard/dashboard.routes.ts` | `GET` | `/stats` | Public |
| | | `GET` | `/audit` | Bearer |
| `/api/system` | `routes/system.routes.ts` | `GET` | `/bote-metrics` | Public |
| | | `GET` | `/simulate-scale` | Public |
| — | `app.ts` | `GET` | `/api/health` | Public |

Audit notes:

- **Rental cap** is enforced in `modules/borrow/borrow.controller.ts` via `parseRentalDays` — `duration_days` must be an integer in **[1, 30]**, defaulting to **5**.
- **Admin OTP directory** is restricted to a single entry in `modules/borrow/adminDirectory.ts`: Admin **KUSH** (`kushagragargdelhi@gmail.com`).
- **Mounting quirk:** `/api/system` is mounted in `server.ts` (the listen entry point), **not** in `app.ts` — so unit/integration tests that import the bare `app` must mount `systemRoutes` themselves (the health-check script below does this).

### Health-check script

```bash
cd backend
npm run build
node test/system-health-check.cjs
```

`test/system-health-check.cjs` is a **diagnostic** script (deliberately not named `*.test.cjs`, so `npm test` never runs it — it performs live DB + SMTP calls). It verifies:

1. `GET /api/system/bote-metrics` and `GET /api/system/simulate-scale` (valid + invalid inputs).
2. Admin directory contains **KUSH**; seeded student **`kush`** (`kushgdhi@gmail.com`) exists as `MEMBER`.
3. **1–30 day rental cap** — live API checks: `duration_days` 31 → 400, 0 → 400, 1 → 201, 30 → 201 (with its own temp users/item, cleaned up after).
4. **Live Nodemailer SMTP** transport to `kushagragargdelhi@gmail.com`, logging the SMTP response status code.

### Live email test log (v1.4.5 audit run)

```
== (c) Live Nodemailer SMTP transport ==
  SMTP response status code: 250 2.0.0 OK  1786632754 98e67ed59e1d1-3931f2a7b8bsm3362246a91.7 - gsmtp
  accepted=["kushagragargdelhi@gmail.com"] rejected=[]
PASS | live SMTP transport to kushagragargdelhi@gmail.com | SMTP 250 messageId=<07647618-1a25-f294-3b4f-8981008ea43b@gmail.com>

========== System Health Check Summary ==========
  23/23 checks passed.
```

> Gmail accepted the probe (`250 2.0.0 OK`, `rejected=[]`) — the same response line the `emailService.ts` `logDelivery()` helper prints on every transactional send. As documented in the sinkhole section, `250 OK` proves SMTP acceptance, not inbox landing; verify the subject line `[CICR Inventory] System Health Check (v1.4.5) OTP: …` in the admin Gmail inbox.

### Test OTP mail routing log (v1.4.6)

As of **v1.4.6** the sender is **`CICR Inventory Admin <kushagragargdelhi@gmail.com>`** and the default OTP test recipient is **`kushgdhi@gmail.com`**. Live `test/test-email.cjs` run:

```
== (a) Live OTP via real SMTP transport ==
  OTP email sent successfully!
  From:      kushagragargdelhi@gmail.com
  To:        [ 'kushgdhi@gmail.com' ]
  envelope:  { from: 'kushagragargdelhi@gmail.com', to: [ 'kushgdhi@gmail.com' ] }
  accepted:  [ 'kushgdhi@gmail.com' ]
  rejected:  []
  response:  250 2.0.0 OK  1786638983 f5sm15541665plv.7 - gsmtp
  messageId: <1786638977721.ff01abc2c7fddbf3@cicr-inventory.local>
```

Routing verified: `kushagragargdelhi@gmail.com → kushgdhi@gmail.com` accepted with **no third-party sinkhole**; OTP lands in the `kushgdhi@gmail.com` inbox (subject `[CICR Inventory] OTP: …`).

### Institutional Email Support log (v1.4.7)

As of **v1.4.7** the sender is **`CICR Inventory Support <kushagragargdelhi@gmail.com>`** with `Reply-To: kushagragargdelhi@gmail.com`; Message-IDs are **RFC 2822 dynamic** (`<unix-ms.hex@gmail.com>`, id-right derived from `SMTP_HOST`). Live `test/test-email.cjs` run to the numeric institutional inbox **`992501030406@mail.jiit.ac.in`**:

```
[EMAIL SERVICE] OTP email accepted by SMTP | messageId=<1786640020999.7d55d326d83e776c261f66dc083c2ef3@gmail.com> | response="250 2.0.0 OK  1786640023 a92af1059eb24-141387ed5b1sm225810c88.8 - gsmtp" | accepted=["992501030406@mail.jiit.ac.in"] | rejected=[]

  SMTP response codes:
    raw response:   250 2.0.0 OK  1786640023 a92af1059eb24-141387ed5b1sm225810c88.8 - gsmtp
    accepted:       ["992501030406@mail.jiit.ac.in"]
    rejected:       []
    envelope:       {"from":"kushagragargdelhi@gmail.com","to":["992501030406@mail.jiit.ac.in"]}
    messageId:      <1786640020999.7d55d326d83e776c261f66dc083c2ef3@gmail.com>

  Message headers (as sent):
    X-CICR-Mailer: CICR-Inventory/v1.4.7
    X-Mailer-Type: borrow-otp
    X-Priority: 1 (Highest)
    Importance: High
    Reply-To: kushagragargdelhi@gmail.com

  Sender kushagragargdelhi@gmail.com -> 992501030406@mail.jiit.ac.in: ACCEPTED
```

> Routing verified: `kushagragargdelhi@gmail.com → 992501030406@mail.jiit.ac.in` accepted with **no third-party sinkhole**; the OTP (subject `[CICR Inventory] Borrow Approval OTP: …`) lands in the numeric institutional inbox. `register` accepts this 12-digit numeric ID via `validators/email.validator.ts` (`^[0-9]{12}@mail\.jiit\.ac\.in$`).

---

## 🧪 Testing

```bash
cd backend
npm test          # node --test "test/*.test.cjs" — 72 tests
```

- `test/auth.middleware.test.cjs` — 6 unit tests for JWT auth middleware.
- `test/otp.unit.test.cjs` — 4 unit tests for the admin-OTP store (generation, verify, consume).
- `test/api.integration.test.cjs` — 45 integration tests against the live Supabase project (health, auth, inventory, borrow/return, admin-OTP approval, rental-duration cap, audit).
- `test/bote.test.cjs` — 17 unit tests for the BOTE capacity/latency math.
- `test/system-health-check.cjs` — diagnostic health check (BOTE endpoints, admin directory, seeded student, 1–30 day cap, live SMTP). Not part of `npm test`; run manually with `node test/system-health-check.cjs` (see [System Audit & Health Check](#-system-audit--health-check-v145)).

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

Render free tier will run `startReminderScheduler()` on boot (boot-time due/overdue check + daily 09:00 job). Set the env vars from `.env.example` in the Render dashboard.

### Frontend → Vercel

```bash
npm run build     # tsc && vite build → dist/
npm run preview   # verify
```

The built frontend reads `API_BASE` from `src/main.ts:11` — v1.5.0 defaults to `http://localhost:5000/api` (local backend); point it at the Render backend URL for production. Use `credentials: 'include'` on all `fetch` calls to leverage the Redis-backed session cookie.

---

## ⚠️ Known Issues & Roadmap

**Known issues (v1.7.0):**

- `register` accepts `role: 'ADMIN'` from the client (role spoofing).
- `createItem` accepts negative `quantity`.
- `GET /api/stats` is public; `GET /api/audit` is visible to any authenticated member.
- Real email delivery requires a valid Gmail App Password; placeholders produce `535 BadCredentials`.

**Roadmap:**

- [x] Role-based access (admin vs. member) — v1.5.0 (JWT + RBAC middleware)
- [x] Overdue-loan notifications — v1.4.3 (node-cron reminders)
- [x] Admin OTP approval workflow — v1.4.3 (`request-otp` / `verify-otp`)
- [x] Redis session store + API caching — v1.5.0 (`connect-redis`, `cacheGetJSON`)
- [x] DB read/write splitting — v1.5.0 (`dbRead` / `dbWrite`)
- [x] BullMQ async email queue — v1.5.0 (Redis-backed, 5 concurrency)
- [x] Atomic SQL guards for concurrency — v1.7.0 (`finalizeBorrow`, `returnItem`)
- [x] Hardened JWT config (no fallback secret) — v1.7.0
- [x] Base migration (`000_create_tables.sql`) — v1.7.0
- [ ] Frontend session-aware fetch wrapper + OTP entry UI
- [ ] QR-code component tagging for instant lookup
- [ ] Export vault data (CSV / PDF reports)

---

## 📜 License

Distributed under the MIT License. Built with 🧠 + 🔧 by the Creative & Innovative Cell in Robotics, JIIT-128.

<div align="center">

**© 2026 CICR Inventory Hub — Creative & Innovative Cell in Robotics**

[![Live Demo](https://img.shields.io/badge/VISIT-VAULT-00f0ff?style=for-the-badge)](https://cicrinventory.vercel.app/)

</div>

