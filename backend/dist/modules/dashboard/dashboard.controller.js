"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditLogs = exports.getDashboardStats = void 0;
const database_1 = require("../../config/database");
// GET /api/stats (Dashboard Analytics)
const getDashboardStats = async (req, res) => {
    try {
        const { count: totalItems } = await database_1.dbRead.from('inventory').select('*', { count: 'exact', head: true });
        const { count: totalUsers } = await database_1.dbRead.from('users').select('*', { count: 'exact', head: true });
        const { count: activeBorrows } = await database_1.dbRead
            .from('borrow_records')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'BORROWED');
        const { data: items } = await database_1.dbRead.from('inventory').select('quantity, available_quantity');
        const totalQuantity = items?.reduce((acc, curr) => acc + curr.quantity, 0) || 0;
        const availableQuantity = items?.reduce((acc, curr) => acc + curr.available_quantity, 0) || 0;
        return res.status(200).json({
            status: 'success',
            data: {
                total_items: totalItems || 0,
                total_users: totalUsers || 0,
                active_borrows: activeBorrows || 0,
                total_quantity: totalQuantity,
                available_quantity: availableQuantity,
                borrowed_quantity: totalQuantity - availableQuantity
            }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.getDashboardStats = getDashboardStats;
// GET /api/audit (Audit Logs List)
const getAuditLogs = async (req, res) => {
    try {
        const { data: logs, error } = await database_1.dbRead
            .from('audit_logs')
            .select('*, users(name, email), inventory(name)')
            .order('timestamp', { ascending: false })
            .limit(50);
        if (error)
            throw error;
        return res.status(200).json({ status: 'success', count: logs.length, data: logs });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.getAuditLogs = getAuditLogs;
