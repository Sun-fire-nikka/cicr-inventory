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

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { dbRead } from '../../config/database';
import { supabase } from '../../app';
import { generateAuthOtp, storeAuthOtp, verifyAuthOtp, consumeAuthOtp } from './authOtpService';
import { isStudentEmail } from '../../validators/email.validator';
import { getAdminByEmail } from '../borrow/adminDirectory';
import { sendLoginOtpEmail } from '../../services/emailService';

// POST /api/auth/send-otp
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Determine role based on email domain
    let role: 'ADMIN' | 'MEMBER' = 'MEMBER';

    if (isStudentEmail(normalizedEmail)) {
      role = 'MEMBER';
    } else {
      // Check if it's a known admin email
      const admin = getAdminByEmail(normalizedEmail);
      if (admin) {
        role = 'ADMIN';
      } else {
        return res.status(400).json({
          status: 'error',
          message: 'Access restricted. Please use your official college email address (@mail.jiit.ac.in).'
        });
      }
    }

    // Generate and store OTP — no account lookup required.
    // Any valid @mail.jiit.ac.in email can request an OTP; unverified users
    // will be auto-provisioned on verify-otp.
    const otp = generateAuthOtp();
    storeAuthOtp(otp, { email: normalizedEmail, role });

    // Send OTP via email — in dev mode or on failure, fall back to console.
    const recipientName = normalizedEmail.split('@')[0];
    let emailDelivered = false;
    const isDev = process.env.NODE_ENV !== 'production';

    try {
      const emailResult = await sendLoginOtpEmail(normalizedEmail, recipientName, otp);
      emailDelivered = emailResult.success === true;
    } catch {
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
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/auth/verify-otp
export const verifyOtp = async (req: Request, res: Response) => {
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
    const payload = verifyAuthOtp(otp);
    if (!payload) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP.' });
    }

    if (payload.email !== normalizedEmail) {
      return res.status(400).json({ status: 'error', message: 'OTP was sent to a different email.' });
    }

    // Consume OTP (one-time use)
    consumeAuthOtp(otp);

    // Find or create user
    let user: { id: string; name: string; email: string; roll_number: string | null; role: string; created_at: string };
    let isNewUser = false;

    const { data: existingUser } = await dbRead
      .from('users')
      .select('id, name, email, roll_number, role, created_at')
      .eq('email', normalizedEmail)
      .single();

    if (existingUser) {
      user = existingUser;
    } else {
      // Auto-provision new student account
      const displayName = normalizedEmail.split('@')[0];
      const { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert([{
          name: displayName,
          email: normalizedEmail,
          password_hash: '',           // OTP-only account — no password
          roll_number: null,
          role: payload.role || 'MEMBER'
        }])
        .select('id, name, email, roll_number, role, created_at')
        .single();

      if (createErr || !newUser) {
        return res.status(500).json({ status: 'error', message: 'Failed to create account. Please try again.' });
      }

      user = newUser;
      isNewUser = true;
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('FATAL: JWT_SECRET environment variable is not set.');
      return res.status(500).json({ status: 'error', message: 'Server misconfiguration.' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      secret,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      status: 'success',
      message: isNewUser ? 'Account created and authenticated.' : 'Authenticated.',
      token,
      user: { id: user.id, name: user.name, email: user.email, roll_number: user.roll_number, role: user.role }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
