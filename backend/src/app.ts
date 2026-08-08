import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import authRoutes from './modules/auth/auth.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import borrowRoutes from './modules/borrow/borrow.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const app: Application = express();

app.use(cors());
app.use(express.json());

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/items', inventoryRoutes);
app.use('/api/borrow', borrowRoutes);
app.use('/api', dashboardRoutes); // Exposes GET /api/stats and GET /api/audit

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'success', message: 'CICR Inventory API is live! 🚀' });
});

export default app;