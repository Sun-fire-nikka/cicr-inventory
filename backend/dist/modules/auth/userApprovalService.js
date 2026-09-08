"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllUserApprovals = exports.deleteUserApproval = exports.setUserRole = exports.setUserApproval = exports.getUserApproval = exports.unpurgeEmail = exports.isPurgedUser = exports.isManagedUser = exports.isSuperAdminEmail = exports.SUPER_ADMIN_EMAILS = exports.MASTER_ADMIN_EMAIL = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.MASTER_ADMIN_EMAIL = 'vardaansaxena096@gmail.com';
exports.SUPER_ADMIN_EMAILS = [
    'vardaansaxena096@gmail.com',
    'cicrinventory@gmail.com'
];
const isSuperAdminEmail = (email) => {
    const norm = email.trim().toLowerCase();
    return exports.SUPER_ADMIN_EMAILS.some((admin) => admin.toLowerCase() === norm);
};
exports.isSuperAdminEmail = isSuperAdminEmail;
const STORAGE_FILE = path_1.default.resolve(process.cwd(), 'user_approval_data.json');
let approvalState = {};
let purgedEmails = new Set();
// Load persisted approval state
try {
    if (fs_1.default.existsSync(STORAGE_FILE)) {
        const raw = fs_1.default.readFileSync(STORAGE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.approvalState) {
            approvalState = parsed.approvalState;
            purgedEmails = new Set(parsed.purgedEmails || []);
        }
        else {
            approvalState = parsed;
        }
    }
}
catch (err) {
    console.warn('[USER APPROVAL] Failed to load user approval file, using memory:', err);
}
const saveState = () => {
    try {
        fs_1.default.writeFileSync(STORAGE_FILE, JSON.stringify({
            approvalState,
            purgedEmails: Array.from(purgedEmails)
        }, null, 2), 'utf-8');
    }
    catch (err) {
        console.warn('[USER APPROVAL] Failed to save user approval file:', err);
    }
};
const isManagedUser = (email) => {
    const normEmail = email.trim().toLowerCase();
    if ((0, exports.isSuperAdminEmail)(normEmail))
        return true;
    if (purgedEmails.has(normEmail))
        return false;
    return Boolean(approvalState[normEmail]);
};
exports.isManagedUser = isManagedUser;
const isPurgedUser = (email) => {
    const normEmail = email.trim().toLowerCase();
    if ((0, exports.isSuperAdminEmail)(normEmail))
        return false;
    return purgedEmails.has(normEmail);
};
exports.isPurgedUser = isPurgedUser;
const unpurgeEmail = (email) => {
    purgedEmails.delete(email.trim().toLowerCase());
    saveState();
};
exports.unpurgeEmail = unpurgeEmail;
const getUserApproval = (email, initialRole = 'MEMBER') => {
    const normEmail = email.trim().toLowerCase();
    if ((0, exports.isSuperAdminEmail)(normEmail)) {
        return {
            status: 'APPROVED',
            role: 'ADMIN',
            approvedAt: new Date().toISOString(),
            approvedBy: 'SYSTEM'
        };
    }
    if (!approvalState[normEmail]) {
        const isStudent = normEmail.endsWith('@mail.jiit.ac.in') || normEmail.endsWith('@jiit.ac.in');
        approvalState[normEmail] = {
            status: 'PENDING',
            role: isStudent ? 'MEMBER' : (initialRole === 'ADMIN' ? 'ADMIN' : 'MEMBER')
        };
        saveState();
    }
    return approvalState[normEmail];
};
exports.getUserApproval = getUserApproval;
const setUserApproval = (email, status, approvedBy) => {
    const normEmail = email.trim().toLowerCase();
    if ((0, exports.isSuperAdminEmail)(normEmail)) {
        return {
            status: 'APPROVED',
            role: 'ADMIN',
            approvedAt: new Date().toISOString(),
            approvedBy: 'SYSTEM'
        };
    }
    purgedEmails.delete(normEmail);
    const current = approvalState[normEmail] || { status: 'PENDING', role: 'MEMBER' };
    current.status = status;
    if (status === 'APPROVED') {
        current.approvedAt = new Date().toISOString();
        current.approvedBy = approvedBy || 'ADMIN';
    }
    else {
        current.approvedAt = undefined;
        current.approvedBy = undefined;
    }
    approvalState[normEmail] = current;
    saveState();
    return current;
};
exports.setUserApproval = setUserApproval;
const setUserRole = (email, role) => {
    const normEmail = email.trim().toLowerCase();
    if ((0, exports.isSuperAdminEmail)(normEmail)) {
        return {
            status: 'APPROVED',
            role: 'ADMIN',
            approvedAt: new Date().toISOString(),
            approvedBy: 'SYSTEM'
        };
    }
    purgedEmails.delete(normEmail);
    const current = approvalState[normEmail] || { status: 'APPROVED', role: 'MEMBER' };
    current.role = role;
    approvalState[normEmail] = current;
    saveState();
    return current;
};
exports.setUserRole = setUserRole;
const deleteUserApproval = (email) => {
    const normEmail = email.trim().toLowerCase();
    if ((0, exports.isSuperAdminEmail)(normEmail))
        return;
    delete approvalState[normEmail];
    purgedEmails.add(normEmail);
    saveState();
};
exports.deleteUserApproval = deleteUserApproval;
const getAllUserApprovals = () => {
    const base = {};
    exports.SUPER_ADMIN_EMAILS.forEach((adm) => {
        base[adm.toLowerCase()] = {
            status: 'APPROVED',
            role: 'ADMIN',
            approvedAt: '2026-09-08T00:00:00.000Z',
            approvedBy: 'SYSTEM'
        };
    });
    return {
        ...approvalState,
        ...base
    };
};
exports.getAllUserApprovals = getAllUserApprovals;
