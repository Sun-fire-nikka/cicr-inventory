"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopReminderScheduler = exports.startReminderScheduler = exports.runReminderSweep = exports.describeDueWindow = exports.reminderCutoff = exports.resolveReminderConfig = exports.DEFAULT_REMINDER_LEAD_HOURS = exports.DEFAULT_REMINDER_INTERVAL_MS = void 0;
const app_1 = require("../app");
const emailService_1 = require("./emailService");
const boteService_1 = require("./boteService");
exports.DEFAULT_REMINDER_INTERVAL_MS = 60 * 60 * 1000; // hourly sweep
exports.DEFAULT_REMINDER_LEAD_HOURS = 24; // warn a day before the due date
/**
 * Reads scheduler tuning from the environment, falling back to safe defaults.
 * The batch limit is derived from the BOTE reminder-worker budget so a single
 * sweep can never blow through the SMTP daily cap in one burst.
 */
const resolveReminderConfig = (env = process.env) => {
    const intervalMs = Number(env.REMINDER_INTERVAL_MS);
    const leadHours = Number(env.REMINDER_LEAD_HOURS);
    const batchLimit = Number(env.REMINDER_BATCH_LIMIT);
    return {
        intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : exports.DEFAULT_REMINDER_INTERVAL_MS,
        leadHours: Number.isFinite(leadHours) && leadHours >= 0 ? leadHours : exports.DEFAULT_REMINDER_LEAD_HOURS,
        batchLimit: Number.isFinite(batchLimit) && batchLimit > 0 ? batchLimit : boteService_1.DEFAULT_BOTE_CONFIG.reminderWorkers * 4
    };
};
exports.resolveReminderConfig = resolveReminderConfig;
/** Latest due_date that should be reminded about on this sweep. */
const reminderCutoff = (now, leadHours) => new Date(now.getTime() + leadHours * 60 * 60 * 1000);
exports.reminderCutoff = reminderCutoff;
/** Human-readable window used in the subject line and body, e.g. "overdue by 2 day(s)". */
const describeDueWindow = (dueDate, now) => {
    const due = new Date(dueDate).getTime();
    if (Number.isNaN(due))
        return 'due soon';
    const diffMs = due - now.getTime();
    const hours = Math.floor(Math.abs(diffMs) / (60 * 60 * 1000));
    const unit = hours >= 24 ? `${Math.floor(hours / 24)} day(s)` : `${hours} hour(s)`;
    return diffMs < 0 ? `overdue by ${unit}` : `due in ${unit}`;
};
exports.describeDueWindow = describeDueWindow;
/**
 * One pass over borrow_records: find active borrows that are due within the lead
 * window (or already overdue) and have not been reminded, email each borrower,
 * then stamp reminder_sent_at so the next sweep skips them.
 */
const runReminderSweep = async (now = new Date()) => {
    const { leadHours, batchLimit } = (0, exports.resolveReminderConfig)();
    const { data: records, error } = await app_1.supabase
        .from('borrow_records')
        .select('id, user_id, inventory_id, quantity, due_date')
        .eq('status', 'BORROWED')
        .is('reminder_sent_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', (0, exports.reminderCutoff)(now, leadHours).toISOString())
        .order('due_date', { ascending: true })
        .limit(batchLimit);
    if (error)
        throw error;
    const pending = records || [];
    if (!pending.length)
        return { scanned: 0, sent: 0, failed: 0 };
    // Resolve borrowers and items manually, mirroring getBorrowHistory
    const userIds = [...new Set(pending.map((r) => r.user_id).filter(Boolean))];
    const itemIds = [...new Set(pending.map((r) => r.inventory_id).filter(Boolean))];
    const [usersRes, itemsRes] = await Promise.all([
        userIds.length
            ? app_1.supabase.from('users').select('id, name, email').in('id', userIds)
            : Promise.resolve({ data: [] }),
        itemIds.length
            ? app_1.supabase.from('inventory').select('id, name').in('id', itemIds)
            : Promise.resolve({ data: [] })
    ]);
    const userMap = Object.fromEntries((usersRes.data || []).map((u) => [u.id, u]));
    const itemMap = Object.fromEntries((itemsRes.data || []).map((i) => [i.id, i]));
    let sent = 0;
    let failed = 0;
    for (const record of pending) {
        const borrower = userMap[record.user_id];
        const itemName = itemMap[record.inventory_id]?.name || 'a borrowed item';
        if (!borrower?.email) {
            failed++;
            console.warn(`[REMINDER] Skipped borrow ${record.id}: borrower has no email on file.`);
            continue;
        }
        const result = await (0, emailService_1.sendDueReminder)(borrower.email, borrower.name || 'Borrower', itemName, record.quantity, record.due_date, (0, exports.describeDueWindow)(record.due_date, now));
        if (!result.success) {
            failed++;
            continue;
        }
        // Stamp only if still unstamped, so two overlapping sweeps can't double-count
        const { error: stampErr } = await app_1.supabase
            .from('borrow_records')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', record.id)
            .is('reminder_sent_at', null);
        if (stampErr) {
            console.error(`[REMINDER] Reminder for borrow ${record.id} was sent but could not be stamped:`, stampErr.message);
        }
        sent++;
    }
    return { scanned: pending.length, sent, failed };
};
exports.runReminderSweep = runReminderSweep;
let timer = null;
let sweepInProgress = false;
/**
 * Starts the recurring due-date reminder sweep. Set REMINDERS_ENABLED=false to
 * disable it (useful for local development and for non-primary instances, so a
 * multi-instance deploy doesn't email every borrower N times).
 */
const startReminderScheduler = () => {
    if (process.env.REMINDERS_ENABLED === 'false') {
        console.log('[REMINDER] Scheduler disabled via REMINDERS_ENABLED=false.');
        return null;
    }
    if (timer)
        return timer;
    const { intervalMs, leadHours } = (0, exports.resolveReminderConfig)();
    const tick = async () => {
        if (sweepInProgress) {
            console.warn('[REMINDER] Previous sweep still running; skipping this tick.');
            return;
        }
        sweepInProgress = true;
        try {
            const { scanned, sent, failed } = await (0, exports.runReminderSweep)();
            if (scanned > 0) {
                console.log(`[REMINDER] Sweep complete — scanned ${scanned}, sent ${sent}, failed ${failed}.`);
            }
        }
        catch (err) {
            console.error('[REMINDER] Sweep failed:', err.message);
        }
        finally {
            sweepInProgress = false;
        }
    };
    timer = setInterval(tick, intervalMs);
    timer.unref();
    console.log(`⏰ Reminder scheduler started — sweeping every ${Math.round(intervalMs / 60000)} min with a ${leadHours}h lead time.`);
    void tick();
    return timer;
};
exports.startReminderScheduler = startReminderScheduler;
const stopReminderScheduler = () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};
exports.stopReminderScheduler = stopReminderScheduler;
