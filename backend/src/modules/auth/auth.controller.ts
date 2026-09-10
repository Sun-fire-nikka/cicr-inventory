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
  sendLoginSecurityAlertEmail
} from '../../services/emailService';
import { logAuditEvent } from '../../services/auditService';

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

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: effectiveRole },
      secret,
      { expiresIn: '7d' }
    );

    // Generate an autogenerated 6-digit session security code valid for 5 minutes only
    const sessionCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Dispatch autogenerated login email alert strictly to the user ONLY (valid for 5 mins)
    sendLoginSecurityAlertEmail({
      userEmail: user.email,
      userName: user.name,
      role: effectiveRole,
      ip: (req.headers['x-forwarded-for'] as string) || req.ip,
      userAgent: req.headers['user-agent'],
      loginTime: new Date(),
      sessionCode,
      validityMinutes: 5
    }).catch((e) => console.error('[EMAIL ERROR] Failed to send login alert:', e));

    logAuditEvent({
      action: 'Sign In',
      userId: user.id,
      itemId: null,
      description: `User authenticated: ${user.name} (${user.email}) [Role: ${effectiveRole}] via ${loginId}`
    }).catch(() => {});

    return res.status(200).json({
      status: 'success',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roll_number: user.roll_number,
        role: effectiveRole,
        status: approval.status,
        username: approval.username || undefined,
        batch: approval.batch || undefined
      }
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