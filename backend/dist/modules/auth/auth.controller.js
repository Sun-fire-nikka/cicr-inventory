"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.changeUserRole = exports.rejectUser = exports.approveUser = exports.listUsersForAdmin = exports.getProfile = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../../app");
const database_1 = require("../../config/database");
const email_validator_1 = require("../../validators/email.validator");
const userApprovalService_1 = require("./userApprovalService");
const emailService_1 = require("../../services/emailService");
const register = async (req, res) => {
    try {
        const { name, email, password, roll_number } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ status: 'error', message: 'Name, email, and password required.' });
        }
        if (!(0, email_validator_1.isValidEmail)(email)) {
            return res.status(400).json({
                status: 'error',
                message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can create an account.'
            });
        }
        const normEmail = email.trim().toLowerCase();
        // Check if email already registered in DB or managed approval state
        const { data: existingUser } = await database_1.dbRead
            .from('users')
            .select('id')
            .eq('email', normEmail)
            .maybeSingle();
        if (existingUser || (0, userApprovalService_1.isManagedUser)(normEmail)) {
            return res.status(400).json({ status: 'error', message: 'Email already registered. Please log in.' });
        }
        const isMasterAdmin = (0, userApprovalService_1.isSuperAdminEmail)(normEmail);
        const userRole = isMasterAdmin ? 'ADMIN' : 'MEMBER';
        const initialStatus = isMasterAdmin ? 'APPROVED' : 'PENDING';
        // Auto-extract enrollment number from student email if roll_number not provided
        let userRoll = roll_number ? String(roll_number).trim() : null;
        if (!userRoll) {
            const match = normEmail.match(/^(\d+)@mail\.jiit\.ac\.in$/i);
            if (match) {
                userRoll = match[1];
            }
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const password_hash = await bcryptjs_1.default.hash(password, salt);
        (0, userApprovalService_1.unpurgeEmail)(normEmail);
        let newUser = {
            name: name.trim(),
            email: normEmail,
            roll_number: userRoll,
            role: userRole,
            created_at: new Date().toISOString()
        };
        const { data: insertedUser, error: insertError } = await app_1.supabase
            .from('users')
            .insert([{ name: name.trim(), email: normEmail, password_hash, roll_number: userRoll, role: userRole }])
            .select('id, name, email, roll_number, role, created_at')
            .single();
        if (insertError || !insertedUser) {
            console.error('[AUTH REGISTER ERROR] Supabase insert failed:', insertError);
            return res.status(500).json({ status: 'error', message: 'Failed to create user account. Please try again.' });
        }
        newUser = insertedUser;
        // Track approval status: all students and non-admins strictly set to PENDING
        (0, userApprovalService_1.setUserApproval)(normEmail, initialStatus, isMasterAdmin ? 'SYSTEM' : undefined);
        // Send instant email notification to Admins if non-master-admin registers
        if (!isMasterAdmin) {
            (0, emailService_1.sendAdminNewUserRegistrationAlert)(userApprovalService_1.SUPER_ADMIN_EMAILS, {
                userName: name.trim(),
                userEmail: normEmail,
                rollNumber: userRoll,
                registeredAt: newUser.created_at || new Date().toISOString()
            }).catch((e) => console.error('[EMAIL ERROR] Failed to send admin registration alert:', e));
        }
        const message = isMasterAdmin
            ? 'Admin registered and approved successfully!'
            : 'Account registration submitted! Your request has been sent to CICR Admins for approval.';
        return res.status(201).json({
            status: 'success',
            message,
            data: { ...newUser, status: initialStatus }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, username, password } = req.body;
        const identifier = (email || username || '').trim();
        if (!identifier || !password) {
            return res.status(400).json({ status: 'error', message: 'Email/Username and password required.' });
        }
        if (identifier.includes('@') && !(0, email_validator_1.isValidEmail)(identifier)) {
            return res.status(403).json({
                status: 'forbidden',
                message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can log in.'
            });
        }
        const { data: user, error } = await database_1.dbRead
            .from('users')
            .select('*')
            .or(`email.ilike.${identifier},name.ilike.${identifier}`)
            .limit(1)
            .maybeSingle();
        if (error || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials. User not found.' });
        }
        if (!(0, email_validator_1.isValidEmail)(user.email) && user.role !== 'ADMIN') {
            return res.status(403).json({
                status: 'forbidden',
                message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can log in.'
            });
        }
        const isMasterAdmin = (0, userApprovalService_1.isSuperAdminEmail)(user.email);
        if (!isMasterAdmin && (0, userApprovalService_1.isPurgedUser)(user.email)) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials. Account not found or has been removed.' });
        }
        const validPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials. Incorrect password.' });
        }
        if (isMasterAdmin && user.role !== 'ADMIN') {
            try {
                await app_1.supabase.from('users').update({ role: 'ADMIN' }).eq('id', user.id);
            }
            catch (err) {
                console.warn('Could not sync master admin role in DB:', err);
            }
        }
        const approval = isMasterAdmin
            ? { status: 'APPROVED', role: 'ADMIN' }
            : (0, userApprovalService_1.getUserApproval)(user.email, user.role);
        if (approval.status === 'PENDING') {
            return res.status(403).json({
                status: 'pending_approval',
                message: 'Your account is pending admin approval. You will receive access once approved by CICR Admin.'
            });
        }
        if (approval.status === 'REJECTED') {
            return res.status(403).json({
                status: 'rejected',
                message: 'Your access request was rejected by the CICR Admin.'
            });
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('FATAL: JWT_SECRET environment variable is not set.');
            return res.status(500).json({ status: 'error', message: 'Server misconfiguration.' });
        }
        // Strict enforcement: Official JIIT student accounts are strictly MEMBER role
        const effectiveRole = isMasterAdmin
            ? 'ADMIN'
            : (user.email.endsWith('@mail.jiit.ac.in') || user.email.endsWith('@jiit.ac.in') ? 'MEMBER' : approval.role);
        const token = jsonwebtoken_1.default.sign({ id: user.id, name: user.name, email: user.email, role: effectiveRole }, secret, { expiresIn: '7d' });
        // Dispatch autogenerated login email alert to user and CC/Super Admin
        (0, emailService_1.sendLoginSecurityAlertEmail)({
            userEmail: user.email,
            userName: user.name,
            role: effectiveRole,
            ip: req.headers['x-forwarded-for'] || req.ip,
            userAgent: req.headers['user-agent'],
            loginTime: new Date()
        }).catch((e) => console.error('[EMAIL ERROR] Failed to send login alert:', e));
        return res.status(200).json({
            status: 'success',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                roll_number: user.roll_number,
                role: effectiveRole,
                status: approval.status
            }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.login = login;
const getProfile = async (req, res) => {
    try {
        const { data: user, error } = await database_1.dbRead
            .from('users')
            .select('id, name, email, roll_number, role, created_at')
            .eq('id', req.user?.id)
            .single();
        if (error || !user)
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        const isMasterAdmin = (0, userApprovalService_1.isSuperAdminEmail)(user.email);
        const approval = isMasterAdmin
            ? { status: 'APPROVED', role: 'ADMIN' }
            : (0, userApprovalService_1.getUserApproval)(user.email, user.role);
        return res.status(200).json({
            status: 'success',
            data: { ...user, role: approval.role, status: approval.status }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.getProfile = getProfile;
// ==========================================
// Admin Member Management Endpoints
// ==========================================
const listUsersForAdmin = async (req, res) => {
    try {
        const { data: users, error } = await database_1.dbRead
            .from('users')
            .select('id, name, email, roll_number, role, created_at')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        const allApprovals = (0, userApprovalService_1.getAllUserApprovals)();
        const userList = (users || [])
            .map((u) => {
            const normEmail = u.email.toLowerCase();
            const isMasterAdmin = (0, userApprovalService_1.isSuperAdminEmail)(normEmail);
            const record = isMasterAdmin
                ? { status: 'APPROVED', role: 'ADMIN' }
                : allApprovals[normEmail] || (0, userApprovalService_1.getUserApproval)(normEmail, u.role || 'MEMBER');
            return {
                id: u.id,
                name: u.name,
                email: u.email,
                roll_number: u.roll_number,
                role: record.role,
                status: record.status,
                isMasterAdmin,
                created_at: u.created_at
            };
        });
        return res.status(200).json({ status: 'success', count: userList.length, data: userList });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.listUsersForAdmin = listUsersForAdmin;
const approveUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: user, error } = await database_1.dbRead.from('users').select('id, email, name').eq('id', id).single();
        if (error || !user)
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        const approver = req.user?.name || 'Admin';
        const updated = (0, userApprovalService_1.setUserApproval)(user.email, 'APPROVED', approver);
        // Send instant approval confirmation email to user
        (0, emailService_1.sendUserApprovalSuccessEmail)(user.email, user.name).catch((e) => console.error('[EMAIL ERROR] Failed to send user approval email:', e));
        // Instant alert to all superadmins
        (0, emailService_1.sendAdminUserStatusAlert)(userApprovalService_1.SUPER_ADMIN_EMAILS, user.name, user.email, 'APPROVED', approver).catch((e) => console.error('[EMAIL ERROR] Failed to send admin status alert:', e));
        return res.status(200).json({
            status: 'success',
            message: `User ${user.name} approved successfully.`,
            data: updated,
            user: { id: user.id, name: user.name, email: user.email }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.approveUser = approveUser;
const rejectUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: user, error } = await database_1.dbRead.from('users').select('id, email, name').eq('id', id).single();
        if (error || !user)
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        const rejector = req.user?.name || 'Admin';
        const updated = (0, userApprovalService_1.setUserApproval)(user.email, 'REJECTED', rejector);
        // Send rejection notification email to user
        (0, emailService_1.sendUserRejectionNotificationEmail)(user.email, user.name).catch((e) => console.error('[EMAIL ERROR] Failed to send user rejection email:', e));
        // Instant alert to all superadmins
        (0, emailService_1.sendAdminUserStatusAlert)(userApprovalService_1.SUPER_ADMIN_EMAILS, user.name, user.email, 'REJECTED', rejector).catch((e) => console.error('[EMAIL ERROR] Failed to send admin status alert:', e));
        return res.status(200).json({ status: 'success', message: `User ${user.name} registration rejected.`, data: updated });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.rejectUser = rejectUser;
const changeUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (role !== 'ADMIN' && role !== 'MEMBER') {
            return res.status(400).json({ status: 'error', message: 'Role must be ADMIN or MEMBER.' });
        }
        const { data: user, error } = await database_1.dbRead.from('users').select('id, email, name').eq('id', id).single();
        if (error || !user)
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        if ((0, userApprovalService_1.isSuperAdminEmail)(user.email) && role !== 'ADMIN') {
            return res.status(400).json({ status: 'error', message: 'Cannot demote a Super Admin.' });
        }
        const updated = (0, userApprovalService_1.setUserRole)(user.email, role);
        await app_1.supabase.from('users').update({ role }).eq('id', id);
        return res.status(200).json({ status: 'success', message: `Role for ${user.name} changed to ${role}.`, data: updated });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.changeUserRole = changeUserRole;
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: user, error } = await database_1.dbRead.from('users').select('id, email, name').eq('id', id).single();
        if (error || !user)
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        if ((0, userApprovalService_1.isSuperAdminEmail)(user.email)) {
            return res.status(400).json({ status: 'error', message: 'Cannot delete Super Admin.' });
        }
        (0, userApprovalService_1.deleteUserApproval)(user.email);
        await app_1.supabase.from('users').delete().eq('id', id);
        return res.status(200).json({ status: 'success', message: `User ${user.name} deleted.` });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.deleteUser = deleteUser;
