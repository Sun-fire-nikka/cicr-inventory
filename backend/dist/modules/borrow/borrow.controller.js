"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectHardwareRequestHandler = exports.approveHardwareRequestHandler = exports.getHardwareRequestsHandler = exports.createHardwareRequestHandler = exports.getBorrowHistory = exports.returnItem = exports.verifyOtp = exports.requestOtp = exports.borrowItem = exports.getAdmins = exports.finalizeBorrow = exports.DEFAULT_RENTAL_DAYS = exports.MAX_RENTAL_DAYS = exports.MIN_RENTAL_DAYS = void 0;
const app_1 = require("../../app");
const database_1 = require("../../config/database");
const emailService_1 = require("../../services/emailService");
const adminDirectory_1 = require("./adminDirectory");
const otpService_1 = require("./otpService");
const redis_1 = require("../../config/redis");
const inventory_controller_1 = require("../inventory/inventory.controller");
const ADMIN_DIRECTORY_CACHE_TTL = 60; // seconds
exports.MIN_RENTAL_DAYS = 1;
exports.MAX_RENTAL_DAYS = 30;
exports.DEFAULT_RENTAL_DAYS = 5;
// Fire-and-forget wrapper: catches and logs errors without blocking the response.
function dispatchBackground(label, promise) {
    promise.catch((err) => console.error(`[BACKGROUND] ${label} failed:`, err));
}
// Helper function to insert into audit_logs
async function logAudit(action, userId, itemId, description) {
    try {
        const isUUID = (str) => Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));
        await app_1.supabase.from('audit_logs').insert([
            { action, user_id: isUUID(userId) ? userId : null, item_id: isUUID(itemId) ? itemId : null, description }
        ]);
    }
    catch (err) {
        console.error('Audit log failed:', err);
    }
}
const parseRentalDays = (value) => {
    if (value === undefined || value === null || value === '')
        return exports.DEFAULT_RENTAL_DAYS;
    const days = Number(value);
    if (!Number.isInteger(days) || days < exports.MIN_RENTAL_DAYS || days > exports.MAX_RENTAL_DAYS)
        return null;
    return days;
};
const daysErrorMessage = `duration_days must be an integer between ${exports.MIN_RENTAL_DAYS} and ${exports.MAX_RENTAL_DAYS}.`;
const finalizeBorrow = async (payload) => {
    const { userId, userName, itemId, quantity, purpose, durationDays } = payload;
    // 1. Fetch item details (name, category, etc.) for the response and audit log.
    const { data: item, error: itemErr } = await database_1.dbRead
        .from('inventory')
        .select('*')
        .eq('id', itemId)
        .single();
    if (itemErr || !item) {
        return { error: { status: 404, message: 'Item not found.' } };
    }
    // 2. Atomic decrement: only succeed if sufficient stock exists.
    //    This WHERE clause prevents concurrent borrows from over-allocating.
    const { data: updatedRows, error: updateErr } = await app_1.supabase
        .from('inventory')
        .update({
        available_quantity: item.available_quantity - quantity,
        updated_at: new Date().toISOString()
    })
        .eq('id', itemId)
        .gte('available_quantity', quantity)
        .select('available_quantity');
    if (updateErr)
        return { error: { status: 500, message: updateErr.message } };
    // If no rows were updated, the WHERE condition failed (insufficient stock).
    if (!updatedRows || updatedRows.length === 0) {
        // Re-read the current stock to give an accurate error message.
        const { data: fresh } = await database_1.dbRead
            .from('inventory')
            .select('available_quantity')
            .eq('id', itemId)
            .single();
        const currentStock = fresh?.available_quantity ?? 0;
        return {
            error: {
                status: 400,
                message: `Requested quantity (${quantity}) exceeds available stock (${currentStock}).`
            }
        };
    }
    const newAvailableQty = updatedRows[0].available_quantity;
    // 3. Create the borrow record.
    const borrowedAt = new Date();
    const dueDate = new Date(borrowedAt);
    dueDate.setDate(dueDate.getDate() + durationDays);
    const isUUID = (str) => Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));
    const safeUserId = isUUID(userId) ? userId : null;
    const { data: borrowRecord, error: borrowErr } = await app_1.supabase
        .from('borrow_records')
        .insert([
        {
            user_id: safeUserId,
            borrower_name: userName,
            inventory_id: itemId,
            quantity,
            purpose,
            borrowed_at: borrowedAt.toISOString(),
            due_date: dueDate.toISOString(),
            status: 'BORROWED'
        }
    ])
        .select()
        .single();
    if (borrowErr)
        return { error: { status: 500, message: borrowErr.message } };
    await (0, inventory_controller_1.invalidateItemsCache)(itemId);
    await logAudit('Borrowed', userId, itemId, `Borrowed ${quantity} units of "${item.name}" for purpose: ${purpose}`);
    return { borrowRecord, item, newAvailableQty, dueDate };
};
exports.finalizeBorrow = finalizeBorrow;
// GET /api/borrow/admins (Admin directory) — cached 60s
const getAdmins = async (req, res) => {
    const cacheKey = 'cicr:cache:admins';
    const cached = await (0, redis_1.cacheGetJSON)(cacheKey);
    if (cached) {
        return res.status(200).json(cached);
    }
    const payload = {
        status: 'success',
        count: adminDirectory_1.ADMIN_DIRECTORY.length,
        data: adminDirectory_1.ADMIN_DIRECTORY
    };
    await (0, redis_1.cacheSetJSON)(cacheKey, payload, ADMIN_DIRECTORY_CACHE_TTL);
    return res.status(200).json(payload);
};
exports.getAdmins = getAdmins;
// POST /api/borrow (Borrow Item)
const borrowItem = async (req, res) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.body.borrower_email || req.user?.email || 'vardaansaxena096@gmail.com';
        const userName = req.body.borrower_name || req.user?.name || 'Borrower';
        const userRoll = req.body.roll_number || req.user?.roll_number || null;
        const inventory_id = req.body.inventory_id || req.body.itemId || req.body.item_id;
        const { quantity, purpose } = req.body;
        if (!inventory_id || !quantity || !purpose) {
            return res.status(400).json({ status: 'error', message: 'inventory_id, quantity, and purpose are required.' });
        }
        const qty = Number(quantity);
        if (qty <= 0) {
            return res.status(400).json({ status: 'error', message: 'Quantity must be greater than 0.' });
        }
        const days = parseRentalDays(req.body.duration_days);
        if (days === null) {
            return res.status(400).json({ status: 'error', message: daysErrorMessage });
        }
        const result = await (0, exports.finalizeBorrow)({ userId: userId || '', userName, itemId: inventory_id, quantity: qty, purpose, durationDays: days });
        if (result.error) {
            return res.status(result.error.status).json({ status: 'error', message: result.error.message });
        }
        const { borrowRecord, item, newAvailableQty, dueDate } = result;
        if (userEmail) {
            const { data: activeHolders } = await database_1.dbRead
                .from('borrow_records')
                .select('borrower_name, roll_number, quantity, borrowed_at')
                .eq('inventory_id', inventory_id)
                .eq('status', 'BORROWED')
                .neq('id', borrowRecord.id);
            dispatchBackground('borrow-confirmation', (0, emailService_1.sendBorrowConfirmation)(userEmail, userName, {
                itemName: item.name,
                category: item.category,
                quantity: qty,
                remainingStock: newAvailableQty,
                holders: activeHolders || [],
                durationDays: days,
                dueDate
            }));
        }
        // Instant notification to all superadmins
        dispatchBackground('admin-borrow-alert', (0, emailService_1.sendAdminBorrowNotification)(emailService_1.SUPER_ADMIN_EMAILS, {
            borrowerName: userName,
            borrowerEmail: userEmail || 'N/A',
            rollNumber: userRoll,
            itemName: item.name,
            category: item.category,
            quantity: qty,
            remainingStock: newAvailableQty,
            purpose,
            durationDays: days,
            dueDate
        }));
        return res.status(201).json({
            status: 'success',
            message: 'Item borrowed successfully!',
            data: borrowRecord
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.borrowItem = borrowItem;
// POST /api/borrow/request-otp (Request Admin OTP approval)
const requestOtp = async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const userEmail = req.user?.email || '';
        const userName = req.user?.name || 'Borrower';
        const { item_id, quantity = 1, purpose = 'Admin OTP approved borrow', duration_days, selected_admin_id } = req.body;
        if (!item_id || !selected_admin_id) {
            return res.status(400).json({ status: 'error', message: 'item_id, duration_days, and selected_admin_id are required.' });
        }
        const days = parseRentalDays(duration_days);
        if (days === null) {
            return res.status(400).json({ status: 'error', message: daysErrorMessage });
        }
        const qty = Number(quantity);
        if (qty <= 0) {
            return res.status(400).json({ status: 'error', message: 'Quantity must be greater than 0.' });
        }
        const admin = (0, adminDirectory_1.getAdminById)(String(selected_admin_id));
        if (!admin) {
            return res.status(404).json({ status: 'error', message: 'Selected admin not found in the admin directory.' });
        }
        const { data: item, error: itemErr } = await database_1.dbRead
            .from('inventory')
            .select('*')
            .eq('id', item_id)
            .single();
        if (itemErr || !item) {
            return res.status(404).json({ status: 'error', message: 'Item not found.' });
        }
        if (item.available_quantity < qty) {
            return res.status(400).json({
                status: 'error',
                message: `Requested quantity (${qty}) exceeds available stock (${item.available_quantity}).`
            });
        }
        const otp = (0, otpService_1.generateOtp)();
        (0, otpService_1.storeOtp)(otp, {
            userId,
            userName,
            userEmail,
            itemId: item_id,
            quantity: qty,
            purpose,
            durationDays: days,
            adminId: admin.id
        });
        const emailResult = await (0, emailService_1.sendOtpEmail)(admin.email, admin.name, userName, otp, item.name, days);
        if (!emailResult.success) {
            return res.status(502).json({ status: 'error', message: 'OTP generated but failed to send to admin email.', data: emailResult });
        }
        await logAudit('OTP Requested', userId, item_id, `OTP approval requested from ${admin.name} (${admin.email}) for "${item.name}" (${days} days)`);
        return res.status(200).json({
            status: 'success',
            message: `OTP sent to admin ${admin.name} (${admin.email}). It expires in 10 minutes.`,
            data: {
                expires_in_seconds: 600,
                item_id,
                duration_days: days,
                selected_admin: { id: admin.id, name: admin.name, email: admin.email }
            }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.requestOtp = requestOtp;
// POST /api/borrow/verify-otp (Verify admin OTP and confirm borrow)
const verifyOtp = async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const userEmail = req.user?.email || '';
        const userName = req.user?.name || 'Borrower';
        const { otp } = req.body;
        if (!otp) {
            return res.status(400).json({ status: 'error', message: 'otp is required.' });
        }
        const payload = (0, otpService_1.verifyOtp)(String(otp));
        if (!payload) {
            return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP.' });
        }
        if (payload.userId !== userId) {
            return res.status(400).json({ status: 'error', message: 'OTP was issued to a different user.' });
        }
        (0, otpService_1.consumeOtp)(String(otp));
        const result = await (0, exports.finalizeBorrow)({
            userId,
            userName,
            itemId: payload.itemId,
            quantity: payload.quantity,
            purpose: payload.purpose,
            durationDays: payload.durationDays
        });
        if (result.error) {
            return res.status(result.error.status).json({ status: 'error', message: result.error.message });
        }
        const { borrowRecord, item, newAvailableQty, dueDate } = result;
        if (userEmail) {
            const { data: activeHolders } = await database_1.dbRead
                .from('borrow_records')
                .select('borrower_name, roll_number, quantity, borrowed_at')
                .eq('inventory_id', payload.itemId)
                .eq('status', 'BORROWED')
                .neq('id', borrowRecord.id);
            dispatchBackground('borrow-confirmation', (0, emailService_1.sendBorrowConfirmation)(userEmail, userName, {
                itemName: item.name,
                category: item.category,
                quantity: payload.quantity,
                remainingStock: newAvailableQty,
                holders: activeHolders || [],
                durationDays: payload.durationDays,
                dueDate
            }));
        }
        // Instant notification to all superadmins
        dispatchBackground('admin-borrow-alert', (0, emailService_1.sendAdminBorrowNotification)(emailService_1.SUPER_ADMIN_EMAILS, {
            borrowerName: userName,
            borrowerEmail: userEmail || 'N/A',
            rollNumber: req.user?.roll_number,
            itemName: item.name,
            category: item.category,
            quantity: payload.quantity,
            remainingStock: newAvailableQty,
            purpose: payload.purpose,
            durationDays: payload.durationDays,
            dueDate
        }));
        return res.status(201).json({
            status: 'success',
            message: 'OTP verified. Borrow confirmed successfully!',
            data: {
                borrow: borrowRecord,
                approved_by_admin_id: payload.adminId
            }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.verifyOtp = verifyOtp;
// POST /api/borrow/return (Return Item)
const returnItem = async (req, res) => {
    try {
        const userId = req.user?.id;
        const borrow_id = req.body.borrow_id || req.body.borrowId || req.body.id;
        if (!borrow_id) {
            return res.status(400).json({ status: 'error', message: 'borrow_id is required.' });
        }
        // 1. Fetch borrow record (read pool)
        const { data: record, error: recordErr } = await database_1.dbRead
            .from('borrow_records')
            .select('*, inventory(name, available_quantity)')
            .eq('id', borrow_id)
            .single();
        if (recordErr || !record) {
            return res.status(404).json({ status: 'error', message: 'Borrow record not found.' });
        }
        if (record.status === 'RETURNED') {
            return res.status(400).json({ status: 'error', message: 'Item has already been returned.' });
        }
        const returnTimestamp = new Date();
        // 2. Atomic status flip: only transition BORROWED -> RETURNED.
        //    If another concurrent request already flipped it, this affects 0 rows.
        const { data: updatedRecord, error: updateRecordErr } = await app_1.supabase
            .from('borrow_records')
            .update({
            status: 'RETURNED',
            returned_at: returnTimestamp.toISOString()
        })
            .eq('id', borrow_id)
            .eq('status', 'BORROWED') // atomic guard: only if still BORROWED
            .select()
            .single();
        if (updateRecordErr)
            throw updateRecordErr;
        // If no row was updated, a concurrent request already returned this record.
        if (!updatedRecord) {
            return res.status(400).json({ status: 'error', message: 'Item has already been returned.' });
        }
        // 3. Restore available_quantity — read then write is safe here because
        //    only one request can win the BORROWED -> RETURNED flip above.
        const { data: currentItem } = await database_1.dbRead
            .from('inventory')
            .select('available_quantity')
            .eq('id', record.inventory_id)
            .single();
        const restoredQty = (currentItem?.available_quantity || 0) + record.quantity;
        const { error: restoreErr } = await app_1.supabase
            .from('inventory')
            .update({ available_quantity: restoredQty, updated_at: new Date().toISOString() })
            .eq('id', record.inventory_id);
        if (restoreErr)
            throw restoreErr;
        await (0, inventory_controller_1.invalidateItemsCache)(record.inventory_id);
        // 4. Audit Log
        const itemName = record.inventory?.name || record.inventory_id;
        await logAudit('Returned', userId, record.inventory_id, `Returned ${record.quantity} units of "${itemName}"`);
        // 5. Send Return Confirmation Receipt Email to borrower
        const userEmail = req.user?.email;
        const userName = req.user?.name || 'Borrower';
        if (userEmail) {
            dispatchBackground('return-confirmation', (0, emailService_1.sendReturnConfirmation)(userEmail, userName, itemName, returnTimestamp));
        }
        // 6. Instant notification to all superadmins
        dispatchBackground('admin-return-alert', (0, emailService_1.sendAdminReturnNotification)(emailService_1.SUPER_ADMIN_EMAILS, {
            borrowerName: userName,
            borrowerEmail: userEmail,
            itemName,
            quantity: record.quantity,
            returnedAt: returnTimestamp
        }));
        return res.status(200).json({
            status: 'success',
            message: 'Item returned successfully! Return logged on server.',
            data: updatedRecord
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.returnItem = returnItem;
// GET /api/borrow/history (Borrow History)
const getBorrowHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        let query = database_1.dbRead
            .from('borrow_records')
            .select('*')
            .order('borrowed_at', { ascending: false });
        // Members see only their own history; Admins see all
        if (userRole !== 'ADMIN') {
            query = query.eq('user_id', userId);
        }
        const { data: records, error } = await query;
        if (error)
            throw error;
        // Resolve related users and items manually
        const userIds = [...new Set((records || []).map((r) => r.user_id).filter(Boolean))];
        const itemIds = [...new Set((records || []).map((r) => r.inventory_id).filter(Boolean))];
        const [usersRes, itemsRes] = await Promise.all([
            userIds.length
                ? database_1.dbRead.from('users').select('id, name, email, roll_number').in('id', userIds)
                : Promise.resolve({ data: [] }),
            itemIds.length
                ? database_1.dbRead.from('inventory').select('id, name, category, image').in('id', itemIds)
                : Promise.resolve({ data: [] })
        ]);
        const userMap = Object.fromEntries((usersRes.data || []).map((u) => [u.id, u]));
        const itemMap = Object.fromEntries((itemsRes.data || []).map((i) => [i.id, i]));
        const history = (records || []).map((r) => ({
            ...r,
            users: userMap[r.user_id] || null,
            inventory: itemMap[r.inventory_id] || null
        }));
        return res.status(200).json({ status: 'success', count: history.length, data: history });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.getBorrowHistory = getBorrowHistory;
// ==========================================
// HARDWARE ISSUE REQUEST HANDLERS (ADMIN PORTAL QUEUE)
// ==========================================
const createHardwareRequestHandler = async (req, res) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email || req.body.email || req.body.borrowerEmail;
        const userName = req.user?.name || req.body.name || req.body.borrowerName;
        const rollNumber = req.user?.roll_number || req.body.roll || req.body.roll_number;
        const itemId = req.body.itemId || req.body.inventory_id || req.body.item_id;
        const itemName = req.body.itemName;
        const quantity = Number(req.body.quantity || req.body.qty || 1);
        const purpose = req.body.purpose;
        const durationDays = req.body.duration_days || req.body.durationDays || 7;
        const dueDate = req.body.dueDate || req.body.due_date;
        if (!itemId || !quantity || !purpose) {
            return res.status(400).json({ status: 'error', message: 'itemId, quantity, and purpose are required.' });
        }
        if (quantity <= 0 || isNaN(quantity)) {
            return res.status(400).json({ status: 'error', message: 'Quantity must be greater than zero.' });
        }
        if (!userName || !userEmail) {
            return res.status(400).json({ status: 'error', message: 'Borrower name and email are required.' });
        }
        const { createHardwareRequest } = await Promise.resolve().then(() => __importStar(require('./hardwareRequestService')));
        const requestRecord = await createHardwareRequest({
            itemId,
            itemName,
            borrowerName: userName,
            borrowerEmail: userEmail,
            rollNumber,
            userId,
            quantity,
            purpose,
            durationDays,
            dueDate
        });
        return res.status(201).json({
            status: 'success',
            message: 'Component issue request queued for Admin approval.',
            data: requestRecord
        });
    }
    catch (err) {
        console.error('Error creating hardware request:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.createHardwareRequestHandler = createHardwareRequestHandler;
const getHardwareRequestsHandler = async (req, res) => {
    try {
        const { getAllHardwareRequests } = await Promise.resolve().then(() => __importStar(require('./hardwareRequestService')));
        const requests = await getAllHardwareRequests();
        return res.status(200).json({
            status: 'success',
            count: requests.length,
            data: requests
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.getHardwareRequestsHandler = getHardwareRequestsHandler;
const approveHardwareRequestHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const adminName = req.user?.name || 'ADMIN';
        const adminEmail = req.user?.email || 'cicrinventory@gmail.com';
        const { approveHardwareRequest } = await Promise.resolve().then(() => __importStar(require('./hardwareRequestService')));
        const result = await approveHardwareRequest(id, adminName, adminEmail);
        if (!result.success) {
            return res.status(400).json({ status: 'error', message: result.error });
        }
        return res.status(200).json({
            status: 'success',
            message: `Hardware request ${id} approved and checked out.`,
            data: result.request
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.approveHardwareRequestHandler = approveHardwareRequestHandler;
const rejectHardwareRequestHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminName = req.user?.name || 'ADMIN';
        const adminEmail = req.user?.email || 'cicrinventory@gmail.com';
        const { rejectHardwareRequest } = await Promise.resolve().then(() => __importStar(require('./hardwareRequestService')));
        const result = await rejectHardwareRequest(id, adminName, adminEmail, reason);
        if (!result.success) {
            return res.status(400).json({ status: 'error', message: result.error });
        }
        return res.status(200).json({
            status: 'success',
            message: `Hardware request ${id} rejected.`,
            data: result.request
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.rejectHardwareRequestHandler = rejectHardwareRequestHandler;
