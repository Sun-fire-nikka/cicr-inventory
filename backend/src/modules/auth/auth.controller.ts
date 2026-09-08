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
  unpurgeEmail,
  getUserApproval,
  setUserApproval,
  setUserRole,
  deleteUserApproval,
  getAllUserApprovals
} from './userApprovalService';
import {
  sendAdminNewUserRegistrationAlert,
  sendUserApprovalSuccessEmail,
  sendUserRejectionNotificationEmail,
  sendAdminUserStatusAlert,
  sendLoginSecurityAlertEmail
} from '../../services/emailService';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, roll_number } = req.body;

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

    // If email is currently active/managed, prevent duplicate
    if (isManagedUser(normEmail)) {
      return res.status(400).json({ status: 'error', message: 'Email already registered.' });
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

    const { data: insertedUser } = await supabase
      .from('users')
      .insert([{ name: name.trim(), email: normEmail, password_hash, roll_number: roll_number || null, role: userRole }])
      .select('id, name, email, roll_number, role, created_at')
      .single();

    if (insertedUser) {
      newUser = insertedUser;
    }

    // Track approval status
    setUserApproval(normEmail, initialStatus, isMasterAdmin ? 'SYSTEM' : undefined);

    // Send instant email notification to Admins if non-master-admin registers
    if (!isMasterAdmin) {
      sendAdminNewUserRegistrationAlert(SUPER_ADMIN_EMAILS, {
        userName: name.trim(),
        userEmail: normEmail,
        rollNumber: roll_number || null,
        registeredAt: newUser.created_at || new Date().toISOString()
      }).catch((e) => console.error('[EMAIL ERROR] Failed to send admin registration alert:', e));
    }

    const message = isMasterAdmin
      ? 'Admin registered and approved successfully!'
      : 'Account registration submitted! Your request is pending CICR Admin approval.';

    return res.status(201).json({
      status: 'success',
      message,
      data: { ...newUser, status: initialStatus }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body;
    const identifier = (email || username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ status: 'error', message: 'Email/Username and password required.' });
    }

    if (identifier.includes('@') && !isValidEmail(identifier)) {
      return res.status(403).json({
        status: 'forbidden',
        message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can log in.'
      });
    }

    const { data: user, error } = await dbRead
      .from('users')
      .select('*')
      .or(`email.ilike.${identifier},name.ilike.${identifier}`)
      .limit(1)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials. User not found.' });
    }

    if (!isValidEmail(user.email) && user.role !== 'ADMIN') {
      return res.status(403).json({
        status: 'forbidden',
        message: 'Access restricted. Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can log in.'
      });
    }

    const isMasterAdmin = isSuperAdminEmail(user.email);
    if (!isMasterAdmin && !isManagedUser(user.email)) {
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
      ? { status: 'APPROVED' as const, role: 'ADMIN' as const }
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

    const effectiveRole = approval.role;
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: effectiveRole },
      secret,
      { expiresIn: '7d' }
    );

    // Dispatch autogenerated login email alert to user and CC/Super Admin
    sendLoginSecurityAlertEmail({
      userEmail: user.email,
      userName: user.name,
      role: effectiveRole,
      ip: (req.headers['x-forwarded-for'] as string) || req.ip,
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

    return res.status(200).json({ status: 'success', message: `User ${user.name} approved successfully.`, data: updated });
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

    return res.status(200).json({ status: 'success', message: `User ${user.name} deleted.` });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};