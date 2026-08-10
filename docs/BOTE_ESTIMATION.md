# Back-of-the-Envelope (BOTE) Estimation & System Capacity Analysis

> Quick, napkin-style math for the CICR Inventory **email pipeline** (borrow/return confirmations + daily due/overdue reminders). Assumptions are stated up front; every figure is derived, not measured, unless noted. Treat numbers as planning guidance, not guarantees.

**Current pipeline (as implemented):**

- `backend/src/services/emailService.ts` — synchronous Nodemailer `transporter.sendMail()` over Gmail SMTP (`smtp.gmail.com:587`, STARTTLS).
- `backend/src/modules/borrow/borrow.controller.ts` — borrow/return confirmation emails are fired **asynchronously** (`.catch()` fire-and-forget), so they never block the HTTP response.
- `backend/src/services/reminderService.ts` — `node-cron` runs a due/overdue scan **daily at 09:00** + on server boot, then sends reminders **sequentially** (`await` per recipient).

---

## 1. Gmail SMTP daily limits

Gmail's free tier caps outbound mail at **500 emails / day / account**. Each email is one `sendMail()` call.

| Email type | Emails per event |
|------------|------------------|
| Borrow confirmation | 1 per borrow |
| Return confirmation | 1 per return |
| Due / overdue reminder | 1 per active due borrower / day |

So a full borrow cycle (borrow → return) consumes **2 emails**.

**Max sustainable borrow transactions / day**

```
max_transactions = daily_email_cap / emails_per_transaction
                 = 500 / 2
                 = 250 borrow transactions / day
```

**Monthly headroom**

```
250 transactions/day × 30 days = 7,500 transactions / month
                               = 15,000 emails / month
```

| Metric | Value |
|--------|-------|
| Gmail free daily cap | 500 emails / account / day |
| Emails per borrow cycle | 2 (borrow + return) |
| **Max transactions / day** | **~250** |
| Max transactions / month | ~7,500 |
| Peak reminder burst (all 250 active) | +250 emails on top of the 500 budget |

> **Headroom check:** reminders share the same 500/day pool. If all 250 daily borrowers also have a due/overdue reminder the same day, the daily budget is `500 borrows/returns` already at cap, and reminders push **past** it. Realistically only a fraction of borrows are due on any given day, but the burst must be scheduled to not collide with the transaction cap.

### Traffic model (per-day formula)

```
daily_emails = borrows_today × 1          (borrow confirmations)
             + returns_today × 1          (return confirmations)
             + due_borrowers_today × 1    (reminders)

constraint: daily_emails ≤ 500
```

For a club-scale deployment (hundreds of members, a few dozen borrows/day) Gmail's cap is comfortable. For **10,000 active students** (see §3) it is 40× short of the requirement.

---

## 2. Latency analysis — synchronous SMTP vs. BullMQ/Redis async job queue

### Where latency currently exists

1. **Borrow / return path:** the HTTP handler returns immediately (fire-and-forget), but each `sendMail()` still consumes event-loop time in the Node process. Under burst traffic, SMTP socket timeouts and TLS handshakes add event-loop pressure even though the API response isn't blocked.
2. **Reminder job:** `reminderService.ts` awaits `sendReturnReminder(...)` in a **strict `for` loop**. Total time scales linearly with the number of due borrowers.

### Back-of-envelope latency

Typical Gmail SMTP round-trip ≈ **0.3–1.5 s** (TLS handshake + SMTP dialogue + queueing). Use **~1 s** for planning.

| Scenario | Emails | Sequential `await` (current) | Parallel workers (BullMQ, concurrency 25) |
|----------|--------:|:---:|:---:|
| Average club day | 20 | ~20 s | ~1 s |
| Busy club day | 250 | ~4.2 min | ~10 s |
| 10,000-user rollout | 1,333 | ~22 min | ~53 s |
| Worst-case overdue flood | 10,000 | ~2.8 h | ~6.7 min |

```
sequential_time = emails × 1 s
parallel_time   = emails × 1 s / workers
```

> The 10,000-user scenario comes from §3/§4 (≈1,333 transactional emails/day). At that scale the sequential reminder job alone would run for ~22 minutes — well beyond a "daily 09:00" job window.

### Why a queue (BullMQ + Redis) wins

| Concern | Synchronous SMTP (current) | BullMQ / Redis queue |
|---------|---------------------------|----------------------|
| HTTP latency impact | None (fire-and-forget), but event-loop load | None — enqueue is O(1), `<1 ms` |
| Send throughput | 1 email at a time (reminders), serial | N workers in parallel (`concurrency`) |
| Failure handling | Logged and dropped, no retry | Automatic retries with exponential backoff |
| Crash resilience | In-flight email lost on process restart | Job persists in Redis, re-run after restart |
| Visibility | Console logs only | Job states, metrics, dead-letter queue |

Queue recommendation (when scaling past Gmail):

```
API (borrow/return) ──enqueue(<1ms)──► BullMQ ──► Workers (SMTP / SES / Resend)
                                          ▲
cron (reminder scan) ────produce──────────┘
```

---

## 3. Memory calculations — 10,000 active student users

A BullMQ job occupies roughly **~2 KB** in memory: job metadata (id, attempts, timestamps, ~0.5 KB) + JSON payload (`{ user_id, email, item_id, item_name, due_date, purpose }`, ~0.5–1.5 KB).

**Queued reminder batch for 10,000 users**

```
queue_memory = jobs × job_size
             = 10,000 × 2 KB
             = 20 MB
```

| Metric | Estimate |
|--------|----------|
| Jobs to enqueue (one reminder per user) | 10,000 |
| Avg job size (meta + payload) | ~2 KB |
| **Estimated queue memory footprint** | **~20 MB** |
| Redis-side mirror (lists + metadata) | ~10–15 MB |
| Per-request latency impact | negligible (<1 ms enqueue) |

**Context check — is 10,000 users realistic for the mail volume?**

```
10,000 students × 2 borrows / month × 2 emails per cycle
    = 40,000 transactional emails / month
    ≈ 1,333 emails / day
```

- **Gmail cap:** 1,333/day vs. 500/day → **needs 3× Gmail accounts**, or a proper ESP (below).
- **Queue memory:** 20 MB is trivially small for any Node process or Redis instance — the queue is **not** the bottleneck; the SMTP daily cap is.

---

## 4. Capacity comparison — Gmail vs. Resend vs. AWS SES

Pricing is approximate (back-of-envelope) for 2026 public tiers; verify on provider sites before committing.

| Provider | Free tier | Price per 1,000 | Daily cap (free) | Latency | Suited for |
|----------|-----------|-----------------:|:---:|:---:|-----------|
| **Gmail SMTP** (current) | 500 emails/day | $0 | 500/day/account | ~1 s/msg, serial | Small club (< 250 transactions/day) |
| **Resend** | 100 emails/day | ~$20 per 100k ($0.20) | 100/day free, none when paid | ~100–300 ms, parallel | Mid-scale teams, dev-friendly API + webhooks |
| **AWS SES** | 3,000 emails/day (12-mo trial*) | $0.10 | 3,000/day | ~100–300 ms, parallel | High-volume / production at lowest cost |

\* Trial allowance applies to EC2-originated sending; new SES accounts start in the sandbox with 200 emails/day and require a support ticket to lift.

### Projected monthly cost at 10,000 users (40,000 emails/month)

```
Gmail:   $0.00     (but exceeds 500/day cap → infeasible)
Resend:  40,000 × $0.20 / 1,000 = $8.00 / month
AWS SES: 40,000 × $0.10 / 1,000 = $4.00 / month
```

| Scenario | Emails/month | Gmail | Resend | AWS SES |
|----------|-------------:|:---:|:---:|:---:|
| Club today (~7,500 cycles) | ~15,000 | ⚠️ 500/day cap OK (≈500/day) | $3.00 | $1.50 |
| 10,000 students | ~40,000 | ❌ cap exceeded 3× | $8.00 | $4.00 |

### Decision matrix

- **Stay on Gmail** while `transactions/day ≤ 250` and reminder bursts are scheduled off-peak (e.g. run the cron after 18:00 so the 09:00 reminder batch doesn't compete with the transaction cap).
- **Move to Resend** for a drop-in API replacement, generous webhooks/analytics, and instant parallelism without operating Redis.
- **Move to AWS SES** for lowest cost at sustained high volume; adds sender reputation management (warm-up, DKIM/SPF) and a slightly heavier SDK/API.

---

## Summary

| Question | Answer |
|----------|--------|
| How many borrow transactions/day can Gmail sustain? | **~250** (500 emails ÷ 2 emails/cycle) |
| What happens at 10,000 students? | ~1,333 emails/day — **3× over Gmail's cap** |
| Reminder job latency at scale (sequential)? | 10,000 × ~1 s = **~2.8 h** — use a queue + workers |
| Memory for a 10,000-job queue? | **~20 MB** — non-issue for the process/Redis |
| Cheapest production ESP at 40k emails/month? | **AWS SES ≈ $4/month** (Resend ≈ $8/month) |

**Next-step recommendation:** keep Gmail for current club scale; when cross-user volume approaches ~250 transactions/day, introduce a BullMQ/Redis worker pool for reminders (or switch `emailService.ts` to the Resend/SES SDK) before the daily cap becomes the bottleneck.

---

*Numbers are estimates for planning only — measure with real SMTP timing and queue metrics before making infrastructure decisions.*
