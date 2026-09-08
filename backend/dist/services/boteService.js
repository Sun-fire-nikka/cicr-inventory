"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateScale = exports.buildBoteSnapshot = exports.computeRedisMemory = exports.computeLatency = exports.computePeakLoad = exports.computeCapacity = exports.DEFAULT_BOTE_CONFIG = void 0;
exports.DEFAULT_BOTE_CONFIG = {
    smtpDailyCap: 500,
    emailsPerBorrowCycle: 2,
    smtpAvgLatencyMs: 1000,
    reminderWorkers: 25,
    jobSizeBytes: 2048,
    redisOverheadFactor: 1.5
};
const clampNonNegative = (value) => Math.max(0, value);
const round1 = (value) => Math.round(value * 10) / 10;
const formatDuration = (ms) => {
    const totalSec = ms / 1000;
    if (totalSec < 60)
        return `${Math.round(totalSec)}s`;
    const min = Math.floor(totalSec / 60);
    const sec = Math.round(totalSec % 60);
    if (min < 60)
        return `${min}m ${sec}s`;
    const hr = Math.floor(min / 60);
    return `${hr}h ${min % 60}m`;
};
const computeCapacity = (emailsUsedToday, config = exports.DEFAULT_BOTE_CONFIG) => {
    const used = clampNonNegative(emailsUsedToday);
    const cap = clampNonNegative(config.smtpDailyCap);
    const remaining = Math.max(0, cap - used);
    const utilization = cap > 0 ? (used / cap) * 100 : 0;
    const maxTransactions = Math.floor(cap / config.emailsPerBorrowCycle);
    const transactionsUsed = Math.floor(used / config.emailsPerBorrowCycle);
    return {
        daily_cap: cap,
        emails_used_today: used,
        emails_remaining_today: remaining,
        utilization_pct: round1(utilization),
        max_transactions_per_day: maxTransactions,
        transactions_used_today: transactionsUsed,
        transactions_remaining_today: Math.max(0, maxTransactions - transactionsUsed)
    };
};
exports.computeCapacity = computeCapacity;
const computePeakLoad = (activeBorrows, dueTodayEmails, emailsUsedToday, config = exports.DEFAULT_BOTE_CONFIG) => {
    const cap = clampNonNegative(config.smtpDailyCap);
    const used = clampNonNegative(emailsUsedToday);
    const due = clampNonNegative(dueTodayEmails);
    const burst = used + due;
    return {
        active_borrows: clampNonNegative(activeBorrows),
        due_today_emails: due,
        peak_burst_emails: burst,
        exceeds_daily_cap: burst > cap,
        headroom_emails: Math.max(0, cap - burst)
    };
};
exports.computePeakLoad = computePeakLoad;
const computeLatency = (emails, config = exports.DEFAULT_BOTE_CONFIG) => {
    const count = clampNonNegative(emails);
    const sequentialMs = count * config.smtpAvgLatencyMs;
    const workers = Math.max(1, config.reminderWorkers);
    const parallelMs = (count * config.smtpAvgLatencyMs) / workers;
    return {
        total_emails: count,
        smtp_avg_latency_ms: config.smtpAvgLatencyMs,
        reminder_workers: workers,
        sequential_ms: Math.round(sequentialMs),
        sequential_human: formatDuration(sequentialMs),
        parallel_ms: Math.round(parallelMs),
        parallel_human: formatDuration(parallelMs),
        speedup_x: round1(sequentialMs / Math.max(1, parallelMs))
    };
};
exports.computeLatency = computeLatency;
const computeRedisMemory = (users, jobsPerUser = 1, config = exports.DEFAULT_BOTE_CONFIG) => {
    const count = clampNonNegative(users);
    const perUser = clampNonNegative(jobsPerUser);
    const totalJobs = count * perUser;
    const queueBytes = totalJobs * config.jobSizeBytes;
    const redisBytes = queueBytes * config.redisOverheadFactor;
    return {
        users: count,
        jobs_per_user: perUser,
        total_jobs: totalJobs,
        job_size_bytes: config.jobSizeBytes,
        queue_bytes: queueBytes,
        queue_mb: round1(queueBytes / (1024 * 1024)),
        redis_overhead_factor: config.redisOverheadFactor,
        redis_bytes: Math.round(redisBytes),
        redis_mb: round1(redisBytes / (1024 * 1024))
    };
};
exports.computeRedisMemory = computeRedisMemory;
const buildBoteSnapshot = (inputs, config = exports.DEFAULT_BOTE_CONFIG) => {
    const emailsUsedToday = clampNonNegative(inputs.emailsUsedToday);
    return {
        generated_at: new Date().toISOString(),
        capacity: (0, exports.computeCapacity)(emailsUsedToday, config),
        peak: (0, exports.computePeakLoad)(inputs.activeBorrows, inputs.dueTodayEmails, emailsUsedToday, config),
        latency: (0, exports.computeLatency)(emailsUsedToday + clampNonNegative(inputs.dueTodayEmails), config),
        memory: (0, exports.computeRedisMemory)(inputs.totalUsers, 1, config)
    };
};
exports.buildBoteSnapshot = buildBoteSnapshot;
const simulateScale = (input, config = exports.DEFAULT_BOTE_CONFIG) => {
    const users = clampNonNegative(input.users);
    const borrowsPerUser = clampNonNegative(input.borrowsPerUserPerMonth);
    const jobsPerUser = clampNonNegative(input.jobsPerUser);
    const transactionsPerMonth = users * borrowsPerUser;
    const emailsPerMonth = transactionsPerMonth * config.emailsPerBorrowCycle;
    const emailsPerDay = emailsPerMonth / 30;
    const transactionsPerDay = transactionsPerMonth / 30;
    const gmailAccountsNeeded = emailsPerDay > 0 ? Math.ceil(emailsPerDay / config.smtpDailyCap) : 0;
    return {
        scenario: {
            users,
            borrows_per_user_per_month: borrowsPerUser,
            jobs_per_user: jobsPerUser,
            emails_per_month: emailsPerMonth,
            emails_per_day: round1(emailsPerDay),
            transactions_per_day: round1(transactionsPerDay)
        },
        gmail_accounts_needed: gmailAccountsNeeded,
        exceeds_single_gmail_cap: emailsPerDay > config.smtpDailyCap,
        cost: {
            ses_usd_per_month: round1((emailsPerMonth / 1000) * 0.1),
            resend_usd_per_month: round1((emailsPerMonth / 1000) * 0.2)
        },
        capacity: (0, exports.computeCapacity)(emailsPerDay, config),
        latency: (0, exports.computeLatency)(emailsPerDay, config),
        memory: (0, exports.computeRedisMemory)(users, jobsPerUser, config)
    };
};
exports.simulateScale = simulateScale;
