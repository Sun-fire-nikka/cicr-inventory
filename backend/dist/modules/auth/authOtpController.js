"use strict";
// Auth OTP controller (v1.7.0).
//
// Handles OTP-based login + signup flow:
//   POST /api/auth/send-otp   — generates OTP, sends to user's email, returns success
//   POST /api/auth/verify-otp — verifies OTP; logs in existing users or creates new
//                               student accounts for any valid @mail.jiit.ac.in address.
//
// Email validation:
//   - Students: MUST match @mail.jiit.ac.in (any valid prefix)
//   - Admins: MUST be in the admin directory (adminDirectory.ts)
//   - Invalid/unknown formats → 400 Bad Request
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyOtp = exports.sendOtp = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../../config/database");
const app_1 = require("../../app");
const authOtpService_1 = require("./authOtpService");
const email_validator_1 = require("../../validators/email.validator");
const adminDirectory_1 = require("../borrow/adminDirectory");
const emailService_1 = require("../../services/emailService");
const userApprovalService_1 = require("./userApprovalService");
// POST /api/auth/send-otp
const sendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ status: 'error', message: 'Email is required.' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        // Determine role based on email domain
        let role = 'MEMBER';
        if ((0, email_validator_1.isStudentEmail)(normalizedEmail)) {
            role = 'MEMBER';
        }
        else {
            // Check if it's a known admin email
            const admin = (0, adminDirectory_1.getAdminByEmail)(normalizedEmail);
            if (admin) {
                role = 'ADMIN';
            }
            else {
                return res.status(400).json({
                    status: 'error',
                    message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can access this portal.'
                });
            }
        }
        // Generate and store OTP — no account lookup required.
        // Any valid @mail.jiit.ac.in email can request an OTP; unverified users
        // will be auto-provisioned on verify-otp.
        const otp = (0, authOtpService_1.generateAuthOtp)();
        (0, authOtpService_1.storeAuthOtp)(otp, { email: normalizedEmail, role });
        // Send OTP via email — in dev mode or on failure, fall back to console.
        const recipientName = normalizedEmail.split('@')[0];
        let emailDelivered = false;
        const isDev = process.env.NODE_ENV !== 'production';
        try {
            const emailResult = await (0, emailService_1.sendLoginOtpEmail)(normalizedEmail, recipientName, otp);
            emailDelivered = emailResult.success === true;
        }
        catch {
            emailDelivered = false;
        }
        if (!emailDelivered || isDev) {
            console.log(`[DEV OTP] Code for ${normalizedEmail}: ${otp}`);
            return res.status(200).json({
                status: 'success',
                message: 'OTP sent successfully (Logged to server console in DEV mode).',
                data: { expires_in_seconds: 300 }
            });
        }
        return res.status(200).json({
            status: 'success',
            message: `OTP sent to ${normalizedEmail}. It expires in 5 minutes.`,
            data: { expires_in_seconds: 300 }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.sendOtp = sendOtp;
// POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ status: 'error', message: 'Email is required.' });
        }
        if (!otp || typeof otp !== 'string') {
            return res.status(400).json({ status: 'error', message: 'OTP is required.' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        // Verify OTP
        const payload = (0, authOtpService_1.verifyAuthOtp)(otp);
        if (!payload) {
            return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP.' });
        }
        if (payload.email !== normalizedEmail) {
            return res.status(400).json({ status: 'error', message: 'OTP was sent to a different email.' });
        }
        // Consume OTP (one-time use)
        (0, authOtpService_1.consumeAuthOtp)(otp);
        // Find or create user
        let user;
        let isNewUser = false;
        const { data: existingUser } = await database_1.dbRead
            .from('users')
            .select('id, name, email, roll_number, role, created_at')
            .eq('email', normalizedEmail)
            .single();
        if (existingUser) {
            user = existingUser;
        }
        else {
            // Auto-provision new student account
            const displayName = normalizedEmail.split('@')[0];
            const match = normalizedEmail.match(/^(\d+)@mail\.jiit\.ac\.in$/i);
            const userRoll = match ? match[1] : null;
            const isSuperAdmin = (0, userApprovalService_1.isSuperAdminEmail)(normalizedEmail);
            const userRole = isSuperAdmin ? 'ADMIN' : 'MEMBER';
            const initialStatus = isSuperAdmin ? 'APPROVED' : 'PENDING';
            const { data: newUser, error: createErr } = await app_1.supabase
                .from('users')
                .insert([{
                    name: displayName,
                    email: normalizedEmail,
                    password_hash: '', // OTP-only account — no password
                    roll_number: userRoll,
                    role: userRole
                }])
                .select('id, name, email, roll_number, role, created_at')
                .single();
            if (createErr || !newUser) {
                return res.status(500).json({ status: 'error', message: 'Failed to create account. Please try again.' });
            }
            user = newUser;
            isNewUser = true;
            // Track approval status
            (0, userApprovalService_1.setUserApproval)(normalizedEmail, initialStatus, isSuperAdmin ? 'SYSTEM' : undefined);
            if (!isSuperAdmin) {
                (0, emailService_1.sendAdminNewUserRegistrationAlert)(userApprovalService_1.SUPER_ADMIN_EMAILS, {
                    userName: displayName,
                    userEmail: normalizedEmail,
                    rollNumber: userRoll,
                    registeredAt: user.created_at || new Date().toISOString()
                }).catch((e) => console.error('[EMAIL ERROR] Failed to send admin registration alert for OTP signup:', e));
                return res.status(200).json({
                    status: 'pending_approval',
                    message: 'Account registered successfully! Your access request has been sent to the CICR Admin for approval.',
                    user: { id: user.id, name: user.name, email: user.email, roll_number: user.roll_number, role: 'MEMBER', status: 'PENDING' }
                });
            }
        }
        const isSuperAdmin = (0, userApprovalService_1.isSuperAdminEmail)(user.email);
        const approval = isSuperAdmin
            ? { status: 'APPROVED', role: 'ADMIN' }
            : (0, userApprovalService_1.getUserApproval)(user.email, user.role || 'MEMBER');
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
        // Generate JWT
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('FATAL: JWT_SECRET environment variable is not set.');
            return res.status(500).json({ status: 'error', message: 'Server misconfiguration.' });
        }
        // Official JIIT student accounts are strictly MEMBER role
        const effectiveRole = isSuperAdmin
            ? 'ADMIN'
            : (user.email.endsWith('@mail.jiit.ac.in') || user.email.endsWith('@jiit.ac.in') ? 'MEMBER' : approval.role);
        const token = jsonwebtoken_1.default.sign({ id: user.id, name: user.name, email: user.email, role: effectiveRole }, secret, { expiresIn: '7d' });
        return res.status(200).json({
            status: 'success',
            message: isNewUser ? 'Account created and authenticated.' : 'Authenticated.',
            token,
            user: { id: user.id, name: user.name, email: user.email, roll_number: user.roll_number, role: effectiveRole, status: approval.status }
        });
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
};
exports.verifyOtp = verifyOtp;
