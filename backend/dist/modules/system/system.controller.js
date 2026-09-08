"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSimulateScale = exports.getBoteMetrics = void 0;
const database_1 = require("../../config/database");
const boteService_1 = require("../../services/boteService");
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
const countToday = async (from, column) => {
    const { count } = await database_1.dbRead
        .from(from)
        .select('*', { count: 'exact', head: true })
        .gte(column, startOfToday().toISOString());
    return count || 0;
};
// GET /api/system/bote-metrics — live capacity, peak-load, latency & memory snapshot
const getBoteMetrics = async (req, res) => {
    try {
        const [borrowsToday, returnsToday, activeBorrows, dueToday, totalUsers, items] = await Promise.all([
            countToday('borrow_records', 'borrowed_at'),
            countToday('borrow_records', 'returned_at'),
            database_1.dbRead.from('borrow_records').select('*', { count: 'exact', head: true }).eq('status', 'BORROWED'),
            database_1.dbRead.from('borrow_records').select('*', { count: 'exact', head: true }).eq('status', 'BORROWED').lt('due_date', endOfToday().toISOString()),
            database_1.dbRead.from('users').select('*', { count: 'exact', head: true }),
            database_1.dbRead.from('inventory').select('quantity, available_quantity')
        ]);
        const inputs = {
            emailsUsedToday: (borrowsToday || 0) + (returnsToday || 0),
            activeBorrows: activeBorrows.count || 0,
            dueTodayEmails: dueToday.count || 0,
            totalUsers: totalUsers.count || 0,
            totalItems: items.data?.length || 0,
            availableQuantity: items.data?.reduce((acc, curr) => acc + (curr.available_quantity || 0), 0) || 0,
            borrowedQuantity: items.data?.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0
        };
        return res.status(200).json({
            status: 'success',
            data: {
                ...(0, boteService_1.buildBoteSnapshot)(inputs),
                inventory: {
                    total_items: inputs.totalItems,
                    available_quantity: inputs.availableQuantity,
                    borrowed_quantity: Math.max(0, inputs.borrowedQuantity - inputs.availableQuantity)
                }
            }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.getBoteMetrics = getBoteMetrics;
// GET /api/system/simulate-scale?users=&borrowsPerUserPerMonth=&jobsPerUser=
const getSimulateScale = async (req, res) => {
    try {
        const users = Number(req.query.users);
        const borrowsPerUserPerMonth = Number(req.query.borrowsPerUserPerMonth ?? 2);
        const jobsPerUser = Number(req.query.jobsPerUser ?? 1);
        if (!Number.isFinite(users) || users < 0) {
            return res.status(400).json({ status: 'error', message: 'Query param "users" is required and must be a non-negative number.' });
        }
        if (!Number.isFinite(borrowsPerUserPerMonth) || borrowsPerUserPerMonth < 0) {
            return res.status(400).json({ status: 'error', message: '"borrowsPerUserPerMonth" must be a non-negative number.' });
        }
        if (!Number.isFinite(jobsPerUser) || jobsPerUser < 0) {
            return res.status(400).json({ status: 'error', message: '"jobsPerUser" must be a non-negative number.' });
        }
        return res.status(200).json({
            status: 'success',
            data: (0, boteService_1.simulateScale)({ users, borrowsPerUserPerMonth, jobsPerUser }, boteService_1.DEFAULT_BOTE_CONFIG)
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.getSimulateScale = getSimulateScale;
