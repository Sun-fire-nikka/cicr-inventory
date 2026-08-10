export interface BoteConfig {
  smtpDailyCap: number;
  emailsPerBorrowCycle: number;
  smtpAvgLatencyMs: number;
  reminderWorkers: number;
  jobSizeBytes: number;
  redisOverheadFactor: number;
}

export const DEFAULT_BOTE_CONFIG: BoteConfig = {
  smtpDailyCap: 500,
  emailsPerBorrowCycle: 2,
  smtpAvgLatencyMs: 1000,
  reminderWorkers: 25,
  jobSizeBytes: 2048,
  redisOverheadFactor: 1.5
};

export interface CapacityMetrics {
  daily_cap: number;
  emails_used_today: number;
  emails_remaining_today: number;
  utilization_pct: number;
  max_transactions_per_day: number;
  transactions_used_today: number;
  transactions_remaining_today: number;
}

export interface PeakLoadMetrics {
  active_borrows: number;
  due_today_emails: number;
  peak_burst_emails: number;
  exceeds_daily_cap: boolean;
  headroom_emails: number;
}

export interface LatencyMetrics {
  total_emails: number;
  smtp_avg_latency_ms: number;
  reminder_workers: number;
  sequential_ms: number;
  sequential_human: string;
  parallel_ms: number;
  parallel_human: string;
  speedup_x: number;
}

export interface RedisMemoryMetrics {
  users: number;
  jobs_per_user: number;
  total_jobs: number;
  job_size_bytes: number;
  queue_bytes: number;
  queue_mb: number;
  redis_overhead_factor: number;
  redis_bytes: number;
  redis_mb: number;
}

export interface BoteInputs {
  emailsUsedToday: number;
  activeBorrows: number;
  dueTodayEmails: number;
  totalUsers: number;
  totalItems: number;
  availableQuantity: number;
  borrowedQuantity: number;
}

export interface BoteSnapshot {
  generated_at: string;
  capacity: CapacityMetrics;
  peak: PeakLoadMetrics;
  latency: LatencyMetrics;
  memory: RedisMemoryMetrics;
}

export interface ScaleSimulationInput {
  users: number;
  borrowsPerUserPerMonth: number;
  jobsPerUser: number;
}

export interface ScaleSimulationResult {
  scenario: {
    users: number;
    borrows_per_user_per_month: number;
    jobs_per_user: number;
    emails_per_month: number;
    emails_per_day: number;
    transactions_per_day: number;
  };
  gmail_accounts_needed: number;
  exceeds_single_gmail_cap: boolean;
  cost: {
    ses_usd_per_month: number;
    resend_usd_per_month: number;
  };
  capacity: CapacityMetrics;
  latency: LatencyMetrics;
  memory: RedisMemoryMetrics;
}

const clampNonNegative = (value: number): number => Math.max(0, value);

const round1 = (value: number): number => Math.round(value * 10) / 10;

const formatDuration = (ms: number): string => {
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${Math.round(totalSec)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
};

export const computeCapacity = (emailsUsedToday: number, config: BoteConfig = DEFAULT_BOTE_CONFIG): CapacityMetrics => {
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

export const computePeakLoad = (
  activeBorrows: number,
  dueTodayEmails: number,
  emailsUsedToday: number,
  config: BoteConfig = DEFAULT_BOTE_CONFIG
): PeakLoadMetrics => {
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

export const computeLatency = (emails: number, config: BoteConfig = DEFAULT_BOTE_CONFIG): LatencyMetrics => {
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

export const computeRedisMemory = (users: number, jobsPerUser: number = 1, config: BoteConfig = DEFAULT_BOTE_CONFIG): RedisMemoryMetrics => {
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

export const buildBoteSnapshot = (inputs: BoteInputs, config: BoteConfig = DEFAULT_BOTE_CONFIG): BoteSnapshot => {
  const emailsUsedToday = clampNonNegative(inputs.emailsUsedToday);
  return {
    generated_at: new Date().toISOString(),
    capacity: computeCapacity(emailsUsedToday, config),
    peak: computePeakLoad(inputs.activeBorrows, inputs.dueTodayEmails, emailsUsedToday, config),
    latency: computeLatency(emailsUsedToday + clampNonNegative(inputs.dueTodayEmails), config),
    memory: computeRedisMemory(inputs.totalUsers, 1, config)
  };
};

export const simulateScale = (
  input: ScaleSimulationInput,
  config: BoteConfig = DEFAULT_BOTE_CONFIG
): ScaleSimulationResult => {
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
    capacity: computeCapacity(emailsPerDay, config),
    latency: computeLatency(emailsPerDay, config),
    memory: computeRedisMemory(users, jobsPerUser, config)
  };
};
