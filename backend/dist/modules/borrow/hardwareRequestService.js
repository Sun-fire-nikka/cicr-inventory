"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectHardwareRequest = exports.approveHardwareRequest = exports.getHardwareRequestById = exports.getAllHardwareRequests = exports.createHardwareRequest = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const emailService_1 = require("../../services/emailService");
const database_1 = require("../../config/database");
const app_1 = require("../../app");
const borrow_controller_1 = require("./borrow.controller");
const STORAGE_FILE = path_1.default.resolve(process.cwd(), 'hardware_requests_data.json');
let requestsState = {};
// Load persisted requests state
try {
    if (fs_1.default.existsSync(STORAGE_FILE)) {
        const raw = fs_1.default.readFileSync(STORAGE_FILE, 'utf-8');
        requestsState = JSON.parse(raw);
    }
}
catch (err) {
    console.warn('[HARDWARE REQUESTS] Failed to load request storage file, using memory:', err);
}
const saveState = () => {
    try {
        fs_1.default.writeFileSync(STORAGE_FILE, JSON.stringify(requestsState, null, 2), 'utf-8');
    }
    catch (err) {
        console.warn('[HARDWARE REQUESTS] Failed to save request storage file:', err);
    }
};
const createHardwareRequest = async (payload) => {
    const id = `req_${Date.now()}_${crypto_1.default.randomBytes(4).toString('hex')}`;
    const requestedAt = new Date().toISOString();
    const durationDays = payload.durationDays || 7;
    let itemName = payload.itemName || 'Hardware Component';
    let category = 'Robotics';
    // Fetch actual item details from database if possible
    try {
        const { data: item } = await database_1.dbRead
            .from('inventory')
            .select('name, category')
            .eq('id', payload.itemId)
            .single();
        if (item) {
            itemName = item.name;
            category = item.category || 'Robotics';
        }
    }
    catch (e) {
        // Non-blocking
    }
    const defaultDueDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dueDate = payload.dueDate || defaultDueDate;
    const newRequest = {
        id,
        itemId: payload.itemId,
        itemName,
        category,
        borrowerName: payload.borrowerName,
        borrowerEmail: payload.borrowerEmail,
        rollNumber: payload.rollNumber || null,
        userId: payload.userId,
        quantity: payload.quantity,
        purpose: payload.purpose,
        durationDays,
        dueDate,
        status: 'PENDING',
        requestedAt
    };
    requestsState[id] = newRequest;
    saveState();
    // Instant notification to Super Admins (Zero Emojis, Authentic High-Priority Cyber Notification)
    (0, emailService_1.sendAdminHardwareRequestAlert)(emailService_1.SUPER_ADMIN_EMAILS, {
        requestId: id,
        itemName,
        category,
        quantity: payload.quantity,
        borrowerName: payload.borrowerName,
        borrowerEmail: payload.borrowerEmail,
        rollNumber: payload.rollNumber,
        purpose: payload.purpose,
        durationDays,
        dueDate,
        requestedAt
    }).catch((err) => console.error('[HARDWARE REQUEST] Admin email alert failed:', err));
    return newRequest;
};
exports.createHardwareRequest = createHardwareRequest;
const getAllHardwareRequests = async () => {
    const localList = Object.values(requestsState);
    // Also query pending rows from Supabase borrow_records
    try {
        const { data: dbRecords } = await database_1.dbRead
            .from('borrow_records')
            .select('*, inventory(name, category)')
            .eq('status', 'PENDING')
            .order('borrowed_at', { ascending: false });
        if (dbRecords && dbRecords.length > 0) {
            for (const rec of dbRecords) {
                const exists = localList.some(r => r.id === rec.id || (r.itemId === rec.inventory_id && r.purpose === rec.purpose));
                if (!exists) {
                    localList.push({
                        id: rec.id,
                        itemId: rec.inventory_id,
                        itemName: rec.inventory?.name || 'Hardware Component',
                        category: rec.inventory?.category || 'Robotics',
                        borrowerName: rec.borrower_name || 'Member',
                        borrowerEmail: rec.roll_number ? `${rec.roll_number}@mail.jiit.ac.in` : 'student@mail.jiit.ac.in',
                        rollNumber: rec.roll_number,
                        userId: rec.user_id,
                        quantity: rec.quantity || 1,
                        purpose: rec.purpose || 'Testing',
                        durationDays: 7,
                        dueDate: rec.due_date ? rec.due_date.split('T')[0] : '',
                        status: 'PENDING',
                        requestedAt: rec.borrowed_at || new Date().toISOString()
                    });
                }
            }
        }
    }
    catch (err) {
        console.warn('[HARDWARE REQUEST] Error reading pending records from Supabase:', err);
    }
    return localList.sort((a, b) => {
        return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    });
};
exports.getAllHardwareRequests = getAllHardwareRequests;
const getHardwareRequestById = (id) => {
    return requestsState[id];
};
exports.getHardwareRequestById = getHardwareRequestById;
const approveHardwareRequest = async (id, adminName, adminEmail) => {
    let req = requestsState[id];
    if (!req) {
        // Check if it exists in Supabase borrow_records with status = 'PENDING'
        const { data: dbRec } = await database_1.dbRead.from('borrow_records').select('*, inventory(name, category)').eq('id', id).maybeSingle();
        if (dbRec) {
            req = {
                id: dbRec.id,
                itemId: dbRec.inventory_id,
                itemName: dbRec.inventory?.name || 'Hardware Component',
                category: dbRec.inventory?.category || 'Robotics',
                borrowerName: dbRec.borrower_name || 'Member',
                borrowerEmail: dbRec.roll_number ? `${dbRec.roll_number}@mail.jiit.ac.in` : 'student@mail.jiit.ac.in',
                rollNumber: dbRec.roll_number,
                userId: dbRec.user_id,
                quantity: dbRec.quantity || 1,
                purpose: dbRec.purpose || 'Testing',
                durationDays: 7,
                dueDate: dbRec.due_date ? dbRec.due_date.split('T')[0] : '',
                status: dbRec.status,
                requestedAt: dbRec.borrowed_at || new Date().toISOString()
            };
            requestsState[id] = req;
        }
    }
    if (!req) {
        return { success: false, error: 'Request not found.' };
    }
    if (req.status !== 'PENDING') {
        return { success: false, error: `Request has already been ${req.status.toLowerCase()}.` };
    }
    // Finalize borrow in database / inventory
    const result = await (0, borrow_controller_1.finalizeBorrow)({
        userId: req.userId || '',
        userName: req.borrowerName,
        itemId: req.itemId,
        quantity: req.quantity,
        purpose: req.purpose,
        durationDays: req.durationDays
    });
    if (result.error) {
        return { success: false, error: result.error.message };
    }
    req.status = 'APPROVED';
    req.reviewedAt = new Date().toISOString();
    req.reviewedBy = adminName || adminEmail || 'ADMIN';
    saveState();
    const { borrowRecord, item, newAvailableQty, dueDate } = result;
    // Send approval status email to borrower (with CC to admins)
    if (req.borrowerEmail) {
        (0, emailService_1.sendHardwareRequestStatusEmail)(req.borrowerEmail, req.borrowerName, req.itemName, req.quantity, 'APPROVED', req.reviewedBy).catch((e) => console.error('[EMAIL ERROR] Failed to send approval status email to borrower:', e));
        const { data: activeHolders } = await database_1.dbRead
            .from('borrow_records')
            .select('borrower_name, roll_number, quantity, borrowed_at')
            .eq('inventory_id', req.itemId)
            .eq('status', 'BORROWED')
            .neq('id', borrowRecord.id);
        (0, emailService_1.sendBorrowConfirmation)(req.borrowerEmail, req.borrowerName, {
            itemName: item.name,
            category: item.category,
            quantity: req.quantity,
            remainingStock: newAvailableQty,
            holders: activeHolders || [],
            durationDays: req.durationDays,
            dueDate
        }).catch((e) => console.error('[EMAIL ERROR] Failed to send borrower confirmation on approval:', e));
    }
    // Send admin borrow alert
    (0, emailService_1.sendAdminBorrowNotification)(emailService_1.SUPER_ADMIN_EMAILS, {
        borrowerName: req.borrowerName,
        borrowerEmail: req.borrowerEmail,
        rollNumber: req.rollNumber,
        itemName: item.name,
        category: item.category,
        quantity: req.quantity,
        remainingStock: newAvailableQty,
        purpose: req.purpose,
        durationDays: req.durationDays,
        dueDate
    }).catch((e) => console.error('[EMAIL ERROR] Failed to send admin borrow alert on approval:', e));
    return { success: true, request: req };
};
exports.approveHardwareRequest = approveHardwareRequest;
const rejectHardwareRequest = async (id, adminName, adminEmail, reason) => {
    let req = requestsState[id];
    if (!req) {
        const { data: dbRec } = await database_1.dbRead.from('borrow_records').select('*, inventory(name, category)').eq('id', id).maybeSingle();
        if (dbRec) {
            req = {
                id: dbRec.id,
                itemId: dbRec.inventory_id,
                itemName: dbRec.inventory?.name || 'Hardware Component',
                category: dbRec.inventory?.category || 'Robotics',
                borrowerName: dbRec.borrower_name || 'Member',
                borrowerEmail: dbRec.roll_number ? `${dbRec.roll_number}@mail.jiit.ac.in` : 'student@mail.jiit.ac.in',
                rollNumber: dbRec.roll_number,
                userId: dbRec.user_id,
                quantity: dbRec.quantity || 1,
                purpose: dbRec.purpose || 'Testing',
                durationDays: 7,
                dueDate: dbRec.due_date ? dbRec.due_date.split('T')[0] : '',
                status: dbRec.status,
                requestedAt: dbRec.borrowed_at || new Date().toISOString()
            };
            requestsState[id] = req;
        }
    }
    if (!req) {
        return { success: false, error: 'Request not found.' };
    }
    if (req.status !== 'PENDING') {
        return { success: false, error: `Request has already been ${req.status.toLowerCase()}.` };
    }
    // If persisted in Supabase borrow_records, delete it
    try {
        await app_1.supabase.from('borrow_records').delete().eq('id', id);
    }
    catch (e) {
        // Non-blocking
    }
    req.status = 'REJECTED';
    req.reviewedAt = new Date().toISOString();
    req.reviewedBy = adminName || adminEmail || 'ADMIN';
    req.reviewNote = reason || 'Declined by administrator.';
    saveState();
    // Send rejection email to user
    if (req.borrowerEmail) {
        (0, emailService_1.sendHardwareRequestStatusEmail)(req.borrowerEmail, req.borrowerName, req.itemName, req.quantity, 'REJECTED', req.reviewedBy, req.reviewNote).catch((e) => console.error('[EMAIL ERROR] Failed to send rejection email to requester:', e));
    }
    // Log audit
    try {
        await app_1.supabase.from('audit_logs').insert([
            {
                action: 'Rejected Request',
                user_id: req.userId || null,
                item_id: req.itemId,
                description: `Admin ${adminName} rejected ${req.borrowerName}'s request for ${req.quantity}x ${req.itemName}.`
            }
        ]);
    }
    catch (e) {
        // Non-blocking
    }
    return { success: true, request: req };
};
exports.rejectHardwareRequest = rejectHardwareRequest;
