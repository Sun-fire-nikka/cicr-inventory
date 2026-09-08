"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startReminderScheduler = exports.runDueReminderCheck = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("../config/database");
const emailService_1 = require("./emailService");
const DAILY_SCHEDULE = process.env.REMINDER_CRON || '0 9 * * *';
let running = false;
const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};
const endOfToday = () => {
    const d = startOfToday();
    d.setDate(d.getDate() + 1);
    return d;
};
const startOfTomorrow = () => {
    const d = startOfToday();
    d.setDate(d.getDate() + 1);
    return d;
};
const endOfTomorrow = () => {
    const d = startOfToday();
    d.setDate(d.getDate() + 2);
    return d;
};
const daysOverdue = (dueDate, todayStart) => {
    const due = new Date(dueDate);
    if (isNaN(due.getTime()) || due >= todayStart)
        return 0;
    return Math.floor((todayStart.getTime() - due.getTime()) / 86400000);
};
const runDueReminderCheck = async () => {
    if (running)
        return { checked: 0, sent: 0, skipped: 0, failed: 0, upcoming_sent: 0 };
    running = true;
    const todayStart = startOfToday();
    try {
        const [dueRes, upcomingRes] = await Promise.all([
            database_1.dbRead
                .from('borrow_records')
                .select('id, inventory_id, borrower_name, quantity, due_date, user_id')
                .eq('status', 'BORROWED')
                .lt('due_date', endOfToday().toISOString()),
            database_1.dbRead
                .from('borrow_records')
                .select('id, inventory_id, borrower_name, quantity, due_date, user_id')
                .eq('status', 'BORROWED')
                .gte('due_date', startOfTomorrow().toISOString())
                .lt('due_date', endOfTomorrow().toISOString())
        ]);
        if (dueRes.error || upcomingRes.error) {
            console.error('[REMINDER SERVICE] Scan failed:', dueRes.error?.message || upcomingRes.error?.message);
            return { checked: 0, sent: 0, skipped: 0, failed: 1, upcoming_sent: 0 };
        }
        const dueList = dueRes.data || [];
        const upcomingList = upcomingRes.data || [];
        const allRecords = [...dueList, ...upcomingList];
        console.log(`[REMINDER SERVICE] Scan found ${dueList.length} due/overdue and ${upcomingList.length} due-tomorrow borrow(s).`);
        const userIds = [...new Set(allRecords.map((r) => r.user_id).filter(Boolean))];
        const itemIds = [...new Set(allRecords.map((r) => r.inventory_id).filter(Boolean))];
        const [usersRes, itemsRes] = await Promise.all([
            userIds.length
                ? database_1.dbRead.from('users').select('id, name, email').in('id', userIds)
                : Promise.resolve({ data: [] }),
            itemIds.length
                ? database_1.dbRead.from('inventory').select('id, name').in('id', itemIds)
                : Promise.resolve({ data: [] })
        ]);
        const userMap = Object.fromEntries((usersRes.data || []).map((u) => [u.id, u]));
        const itemMap = Object.fromEntries((itemsRes.data || []).map((i) => [i.id, i]));
        let sent = 0;
        let skipped = 0;
        let failed = 0;
        let upcomingSent = 0;
        for (const record of allRecords) {
            const user = userMap[record.user_id];
            if (!user?.email) {
                console.warn(`[REMINDER SERVICE] Skipping borrow ${record.id}: no registered email for user ${record.user_id || '(missing user_id)'}.`);
                skipped++;
                continue;
            }
            const itemName = itemMap[record.inventory_id]?.name || record.inventory_id;
            const isUpcoming = dueList.every((r) => r.id !== record.id);
            const result = isUpcoming
                ? await (0, emailService_1.sendUpcomingReminder)(user.email, user.name, itemName, record.due_date)
                : await (0, emailService_1.sendReturnReminder)(user.email, user.name, itemName, record.due_date, daysOverdue(record.due_date, todayStart));
            if (result.success) {
                if (isUpcoming)
                    upcomingSent++;
                else
                    sent++;
            }
            else {
                failed++;
            }
        }
        return { checked: allRecords.length, sent, skipped, failed, upcoming_sent: upcomingSent };
    }
    finally {
        running = false;
    }
};
exports.runDueReminderCheck = runDueReminderCheck;
const startReminderScheduler = () => {
    (0, exports.runDueReminderCheck)().catch((err) => console.error('[REMINDER SERVICE] Boot-time check failed:', err.message));
    node_cron_1.default.schedule(DAILY_SCHEDULE, () => {
        (0, exports.runDueReminderCheck)().catch((err) => console.error('[REMINDER SERVICE] Scheduled check failed:', err.message));
    });
    console.log(`[REMINDER SERVICE] Return reminder scheduler started (cron: "${DAILY_SCHEDULE}").`);
};
exports.startReminderScheduler = startReminderScheduler;
