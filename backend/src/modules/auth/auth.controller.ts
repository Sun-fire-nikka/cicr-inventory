import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../../app';
import { dbRead } from '../../config/database';
import { AuthRequest } from '../../middleware/auth.middleware';
import { isValidEmail } from '../../validators/email.validator';
import {
  MASTER_ADMIN_EMAIL,
  SUPER_ADMIN_EMAILS,
  isSuperAdminEmail,
  isManagedUser,
  isPurgedUser,
  unpurgeEmail,
  getUserApproval,
  setUserApproval,
  setUserRole,
  deleteUserApproval,
  getAllUserApprovals,
  findUserApprovalByIdentifier
} from './userApprovalService';
import {
  sendAdminNewUserRegistrationAlert,
  sendUserApprovalSuccessEmail,
  sendUserRejectionNotificationEmail,
  sendAdminUserStatusAlert,
  sendLoginSecurityAlertEmail,
  sendLoginOtpEmail
} from '../../services/emailService';
import { logAuditEvent } from '../../services/auditService';

interface PendingLoginOtp {
  otp: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRoll: string | null;
  role: string;
  status: string;
  username?: string;
  batch?: string;
  expiresAt: number;
  lastGeneratedAt: number;
  attempts: number;
}

const pendingLoginOtps = new Map<string, PendingLoginOtp>();

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, username, password, roll_number, batch } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ status: 'error', message: 'Name, email, and password required.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can create an account.'
      });
    }

    const normEmail = email.trim().toLowerCase();
    const normUsername = (username || name).trim();
    const userBatch = batch ? String(batch).trim() : null;

    // Check if email already registered in DB or managed approval state
    const { data: existingUser } = await dbRead
      .from('users')
      .select('id')
      .eq('email', normEmail)
      .maybeSingle();

    if (existingUser || isManagedUser(normEmail)) {
      return res.status(400).json({ status: 'error', message: 'Email already registered. Please log in.' });
    }

    const isMasterAdmin = isSuperAdminEmail(normEmail);
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

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    unpurgeEmail(normEmail);

    let newUser: any = {
      name: name.trim(),
      email: normEmail,
      roll_number: userRoll,
      role: userRole,
      created_at: new Date().toISOString()
    };

    const { data: insertedUser, error: insertError } = await supabase
      .from('users')
      .insert([{ name: name.trim(), email: normEmail, password_hash, roll_number: userRoll, role: userRole }])
      .select('id, name, email, roll_number, role, created_at')
      .single();

    if (insertError || !insertedUser) {
      console.error('[AUTH REGISTER ERROR] Supabase insert failed:', insertError);
      return res.status(500).json({ status: 'error', message: 'Failed to create user account. Please try again.' });
    }

    newUser = insertedUser;

    // Track approval status and registration metadata
    setUserApproval(normEmail, initialStatus, isMasterAdmin ? 'SYSTEM' : undefined, {
      username: normUsername,
      batch: userBatch,
      name: name.trim(),
      roll_number: userRoll
    });

    // Record in system audit trail
    logAuditEvent({
      action: 'Sign Up',
      userId: newUser.id,
      itemId: null,
      description: `New ${isMasterAdmin ? 'Admin' : 'Student'} registration: ${name.trim()} (@${normUsername}, ${normEmail}) [Batch: ${userBatch || 'N/A'}, Status: ${initialStatus}]`
    }).catch(() => {});

    // Send instant email notification to Admins if non-master-admin registers
    if (!isMasterAdmin) {
      sendAdminNewUserRegistrationAlert(SUPER_ADMIN_EMAILS, {
        userName: name.trim(),
        userEmail: normEmail,
        username: normUsername,
        rollNumber: userRoll,
        batch: userBatch,
        registeredAt: newUser.created_at || new Date().toISOString()
      }).catch((e) => console.error('[EMAIL ERROR] Failed to send admin registration alert:', e));
    }

    const message = isMasterAdmin
      ? 'Admin registered and approved successfully!'
      : 'Account registration submitted! Your request has been sent to CICR Admins for approval.';

    return res.status(201).json({
      status: 'success',
      message,
      data: { ...newUser, username: normUsername, batch: userBatch, status: initialStatus }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { identifier, email, username, name, password } = req.body;
    const loginId = (identifier || email || username || name || '').trim();

    if (!loginId || !password) {
      return res.status(400).json({ status: 'error', message: 'Email, Username, or Name and password required.' });
    }

    if (loginId.includes('@') && !isValidEmail(loginId)) {
      return res.status(403).json({
        status: 'forbidden',
        message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can log in.'
      });
    }

    // Resolve user by Email, Name, or Username
    let user: any = null;

    // 1. Direct email match if identifier is an email
    if (loginId.includes('@')) {
      const { data } = await dbRead
        .from('users')
        .select('*')
        .eq('email', loginId.toLowerCase())
        .maybeSingle();
      if (data) user = data;
    }

    // 2. Name or email ilike lookup in DB
    if (!user) {
      const { data } = await dbRead
        .from('users')
        .select('*')
        .or(`email.ilike.${loginId},name.ilike.${loginId}`)
        .limit(1)
        .maybeSingle();
      if (data) user = data;
    }

    // 3. Approval state lookup (matches username, name, roll_number, or email)
    if (!user) {
      const match = findUserApprovalByIdentifier(loginId);
      if (match) {
        const { data } = await dbRead
          .from('users')
          .select('*')
          .eq('email', match.email)
          .maybeSingle();
        if (data) user = data;
      }
    }

    // 4. Master Admin Aliases
    if (!user) {
      const lower = loginId.toLowerCase();
      if (['vardaan', 'vardaansaxena'].includes(lower)) {
        const { data } = await dbRead.from('users').select('*').eq('email', 'vardaansaxena096@gmail.com').maybeSingle();
        if (data) user = data;
      } else if (['cicradmin', 'cicrinventory', 'cicr admin'].includes(lower)) {
        const { data } = await dbRead.from('users').select('*').eq('email', 'cicrinventory@gmail.com').maybeSingle();
        if (data) user = data;
      }
    }

    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials. User not found by email, username, or name.' });
    }

    if (!isValidEmail(user.email) && user.role !== 'ADMIN') {
      return res.status(403).json({
        status: 'forbidden',
        message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can log in.'
      });
    }

    const isMasterAdmin = isSuperAdminEmail(user.email);
    if (!isMasterAdmin && isPurgedUser(user.email)) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials. Account not found or has been removed.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials. Incorrect password.' });
    }

    if (isMasterAdmin && user.role !== 'ADMIN') {
      try {
        await supabase.from('users').update({ role: 'ADMIN' }).eq('id', user.id);
      } catch (err) {
        console.warn('Could not sync master admin role in DB:', err);
      }
    }

    const approval = isMasterAdmin
      ? { status: 'APPROVED' as const, role: 'ADMIN' as const, username: user.email === 'vardaansaxena096@gmail.com' ? 'vardaan' : 'cicradmin', batch: undefined }
      : getUserApproval(user.email, user.role);

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

    // Enforce 10-minute gap to regenerate a new OTP
    const cooldownMs = 10 * 60 * 1000; // 10 minutes
    const normEmail = user.email.toLowerCase();
    const existing = pendingLoginOtps.get(normEmail);
    const now = Date.now();

    let otp: string;
    let remainingCooldownSeconds = 600;

    if (existing && (now - existing.lastGeneratedAt < cooldownMs)) {
      otp = existing.otp;
      remainingCooldownSeconds = Math.max(1, Math.ceil((existing.lastGeneratedAt + cooldownMs - now) / 1000));
    } else {
      // Generate single-use 6-digit OTP valid for 10 minutes
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = now + 10 * 60 * 1000;

      pendingLoginOtps.set(normEmail, {
        otp,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRoll: user.roll_number,
        role: effectiveRole,
        status: approval.status,
        username: approval.username || undefined,
        batch: approval.batch || undefined,
        expiresAt,
        lastGeneratedAt: now,
        attempts: 0
      });

      // Dispatch autogenerated login verification OTP email strictly to the user ONLY (valid for 10 mins)
      sendLoginOtpEmail(user.email, user.name, otp).catch((e) =>
        console.error('[EMAIL ERROR] Failed to send login OTP email:', e)
      );
    }

    return res.status(200).json({
      status: 'otp_required',
      message: 'A 6-digit verification code has been dispatched to your email. Valid for 10 minutes.',
      email: user.email,
      name: user.name,
      remainingCooldownSeconds
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const verifyLoginOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ status: 'error', message: 'Email and 6-digit verification code required.' });
    }

    const normEmail = email.trim().toLowerCase();
    const record = pendingLoginOtps.get(normEmail);

    if (!record || Date.now() > record.expiresAt) {
      pendingLoginOtps.delete(normEmail);
      return res.status(400).json({
        status: 'error',
        message: 'Verification code has expired or is invalid. Please sign in again.'
      });
    }

    if (record.attempts >= 5) {
      pendingLoginOtps.delete(normEmail);
      return res.status(400).json({
        status: 'error',
        message: 'Too many failed verification attempts. Please sign in again.'
      });
    }

    if (record.otp !== String(otp).trim()) {
      record.attempts += 1;
      const remaining = 5 - record.attempts;
      return res.status(400).json({
        status: 'error',
        message: `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      });
    }

    // OTP verified successfully
    pendingLoginOtps.delete(normEmail);

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ status: 'error', message: 'Server misconfiguration.' });
    }

    const token = jwt.sign(
      { id: record.userId, name: record.userName, email: record.userEmail, role: record.role },
      secret,
      { expiresIn: '7d' }
    );

    // Dispatch login security notice strictly to the user
    sendLoginSecurityAlertEmail({
      userEmail: record.userEmail,
      userName: record.userName,
      role: record.role,
      ip: (req.headers['x-forwarded-for'] as string) || req.ip,
      userAgent: req.headers['user-agent'],
      loginTime: new Date(),
      sessionCode: record.otp,
      validityMinutes: 10
    }).catch((e) => console.error('[EMAIL ERROR] Failed to send login alert:', e));

    logAuditEvent({
      action: 'Sign In',
      userId: record.userId,
      itemId: null,
      description: `User verified OTP and authenticated: ${record.userName} (${record.userEmail}) [Role: ${record.role}]`
    }).catch(() => {});

    return res.status(200).json({
      status: 'success',
      token,
      user: {
        id: record.userId,
        name: record.userName,
        email: record.userEmail,
        roll_number: record.userRoll,
        role: record.role,
        status: record.status,
        username: record.username,
        batch: record.batch
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const resendLoginOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required.' });
    }

    const normEmail = email.trim().toLowerCase();
    const record = pendingLoginOtps.get(normEmail);

    if (!record) {
      return res.status(400).json({
        status: 'error',
        message: 'No active login session found. Please enter your credentials again.'
      });
    }

    // Enforce 10-minute gap before allowing OTP regeneration
    const cooldownMs = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();
    const elapsed = now - record.lastGeneratedAt;

    if (elapsed < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      return res.status(429).json({
        status: 'cooldown',
        message: `Please wait a 10-minute gap before requesting a new OTP (${mins}m ${secs}s remaining).`,
        remainingSeconds
      });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    record.otp = newOtp;
    record.expiresAt = now + 10 * 60 * 1000;
    record.lastGeneratedAt = now;
    record.attempts = 0;

    await sendLoginOtpEmail(record.userEmail, record.userName, newOtp);

    return res.status(200).json({
      status: 'success',
      message: 'A fresh 6-digit verification code has been dispatched to your email (valid for 10 minutes).',
      remainingSeconds: 600
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { data: user, error } = await dbRead
      .from('users')
      .select('id, name, email, roll_number, role, created_at')
      .eq('id', req.user?.id)
      .single();

    if (error || !user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    const isMasterAdmin = isSuperAdminEmail(user.email);
    const approval = isMasterAdmin
      ? { status: 'APPROVED', role: 'ADMIN' }
      : getUserApproval(user.email, user.role);

    return res.status(200).json({
      status: 'success',
      data: { ...user, role: approval.role, status: approval.status }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// ==========================================
// Admin Member Management Endpoints
// ==========================================

export const listUsersForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { data: users, error } = await dbRead
      .from('users')
      .select('id, name, email, roll_number, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const allApprovals = getAllUserApprovals();

    const userList = (users || [])
      .filter((u) => !isPurgedUser(u.email) && !u.email.endsWith('.test'))
      .map((u) => {
        const normEmail = u.email.toLowerCase();
        const isMasterAdmin = isSuperAdminEmail(normEmail);
        const record = isMasterAdmin
          ? { status: 'APPROVED' as const, role: 'ADMIN' as const }
          : allApprovals[normEmail] || getUserApproval(normEmail, u.role || 'MEMBER');

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
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const approveUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: user, error } = await dbRead.from('users').select('id, email, name').eq('id', id).single();
    if (error || !user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    const approver = req.user?.name || 'Admin';
    const updated = setUserApproval(user.email, 'APPROVED', approver);

    // Send instant approval confirmation email to user
    sendUserApprovalSuccessEmail(user.email, user.name).catch((e) =>
      console.error('[EMAIL ERROR] Failed to send user approval email:', e)
    );

    // Instant alert to all superadmins
    sendAdminUserStatusAlert(SUPER_ADMIN_EMAILS, user.name, user.email, 'APPROVED', approver).catch((e) =>
      console.error('[EMAIL ERROR] Failed to send admin status alert:', e)
    );

    logAuditEvent({
      action: 'User Approved',
      userId: req.user?.id,
      itemId: null,
      description: `Admin ${approver} approved user account ${user.name} (${user.email})`
    }).catch(() => {});

    return res.status(200).json({
      status: 'success',
      message: `User ${user.name} approved successfully.`,
      data: updated,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const rejectUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: user, error } = await dbRead.from('users').select('id, email, name').eq('id', id).single();
    if (error || !user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    const rejector = req.user?.name || 'Admin';
    const updated = setUserApproval(user.email, 'REJECTED', rejector);

    // Send rejection notification email to user
    sendUserRejectionNotificationEmail(user.email, user.name).catch((e) =>
      console.error('[EMAIL ERROR] Failed to send user rejection email:', e)
    );

    // Instant alert to all superadmins
    sendAdminUserStatusAlert(SUPER_ADMIN_EMAILS, user.name, user.email, 'REJECTED', rejector).catch((e) =>
      console.error('[EMAIL ERROR] Failed to send admin status alert:', e)
    );

    logAuditEvent({
      action: 'User Rejected',
      userId: req.user?.id,
      itemId: null,
      description: `Admin ${rejector} rejected registration for ${user.name} (${user.email})`
    }).catch(() => {});

    return res.status(200).json({ status: 'success', message: `User ${user.name} registration rejected.`, data: updated });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const changeUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (role !== 'ADMIN' && role !== 'MEMBER') {
      return res.status(400).json({ status: 'error', message: 'Role must be ADMIN or MEMBER.' });
    }

    const { data: user, error } = await dbRead.from('users').select('id, email, name').eq('id', id).single();
    if (error || !user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    if (isSuperAdminEmail(user.email) && role !== 'ADMIN') {
      return res.status(400).json({ status: 'error', message: 'Cannot demote a Super Admin.' });
    }

    if (user.email.toLowerCase() === 'mahakkatahara.mk@gmail.com' && role === 'ADMIN') {
      return res.status(400).json({ status: 'error', message: 'User is not permitted to hold an ADMIN role.' });
    }

    const updated = setUserRole(user.email, role);
    await supabase.from('users').update({ role }).eq('id', id);

    logAuditEvent({
      action: 'Role Changed',
      userId: req.user?.id,
      itemId: null,
      description: `Admin ${req.user?.name || 'Admin'} updated role for ${user.name} (${user.email}) to ${role}`
    }).catch(() => {});

    return res.status(200).json({ status: 'success', message: `Role for ${user.name} changed to ${role}.`, data: updated });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: user, error } = await dbRead.from('users').select('id, email, name').eq('id', id).single();
    if (error || !user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    if (isSuperAdminEmail(user.email)) {
      return res.status(400).json({ status: 'error', message: 'Cannot delete Super Admin.' });
    }

    deleteUserApproval(user.email);
    await supabase.from('users').delete().eq('id', id);

    logAuditEvent({
      action: 'User Deleted',
      userId: req.user?.id,
      itemId: null,
      description: `Admin ${req.user?.name || 'Admin'} deleted user ${user.name} (${user.email})`
    }).catch(() => {});

    return res.status(200).json({ status: 'success', message: `User ${user.name} deleted.` });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};