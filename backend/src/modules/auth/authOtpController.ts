// Auth OTP controller (v1.6.2).
//
// Handles OTP-based login flow:
//   POST /api/auth/send-otp   — generates OTP, sends to user's email, returns success
//   POST /api/auth/verify-otp — verifies OTP, returns JWT token + user profile
//
// Email validation:
//   - Students: MUST be 12-digit enrollment @mail.jiit.ac.in
//   - Admins: MUST be in the admin directory (adminDirectory.ts)
//   - Invalid/unknown formats → 400 Validation Error

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { dbRead } from '../../config/database';
import { supabase } from '../../app';
import { generateAuthOtp, storeAuthOtp, verifyAuthOtp, consumeAuthOtp } from './authOtpService';
import { isStudentEmail, extractEnrollment, isValidEmail } from '../../validators/email.validator';
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
          message: 'Invalid email format. Students must use [enrollment]@mail.jiit.ac.in.'
        });
      }
    }

    // Check if user exists in database
    const { data: existingUser } = await dbRead
      .from('users')
      .select('id, name, email, role')
      .eq('email', normalizedEmail)
      .single();

    if (!existingUser) {
      return res.status(404).json({
        status: 'error',
        message: 'No account found with this email. Please register first.'
      });
    }

    // Generate and store OTP
    const otp = generateAuthOtp();
    storeAuthOtp(otp, { email: normalizedEmail, role });

    // Send OTP via email
    const emailResult = await sendLoginOtpEmail(normalizedEmail, existingUser.name, otp);

    if (!emailResult.success) {
      return res.status(502).json({
        status: 'error',
        message: 'Failed to send OTP. Please try again.'
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

    // Fetch user from database
    const { data: user, error } = await dbRead
      .from('users')
      .select('id, name, email, roll_number, role, created_at')
      .eq('email', normalizedEmail)
      .single();

    if (error || !user) {
      return res.status(404).json({ status: 'error', message: 'User not found.' });
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
      token,
      user: { id: user.id, name: user.name, email: user.email, roll_number: user.roll_number, role: user.role }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
