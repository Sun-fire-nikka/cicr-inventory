import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../../app';
import { AuthRequest } from '../../middleware/auth.middleware';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, roll_number, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ status: 'error', message: 'Name, email, and password required.' });
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ status: 'error', message: 'Email already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'MEMBER';

    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ name, email, password_hash, roll_number: roll_number || null, role: userRole }])
      .select('id, name, email, roll_number, role, created_at')
      .single();

    if (error) throw error;

    return res.status(201).json({ status: 'success', message: 'User registered!', data: newUser });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password required.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
    }

    const secret = process.env.JWT_SECRET || 'super_secret_cicr_key';
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: '7d' });

    return res.status(200).json({
      status: 'success',
      token,
      user: { id: user.id, name: user.name, email: user.email, roll_number: user.roll_number, role: user.role }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, roll_number, role, created_at')
      .eq('id', req.user?.id)
      .single();

    if (error || !user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    return res.status(200).json({ status: 'success', data: user });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};