import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import dotenv from 'dotenv';

import { dbWrite, dbRead } from './config/database';
import { redisClient, isRedisEnabled } from './config/redis';

import authRoutes from './modules/auth/auth.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import borrowRoutes from './modules/borrow/borrow.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';

dotenv.config();

// Write pool — backward-compatible alias used by controllers/tests.
export const supabase = dbWrite;

const app: Application = express();

const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));
app.use(express.json());

// Redis-backed cookie sessions (v1.5.0). JWT Bearer auth remains the primary
// path; sessions give an additional cookie-based carrier stored in Redis.
const sessionOptions: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || 'cicr_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};
if (isRedisEnabled && redisClient) {
  sessionOptions.store = new RedisStore({ client: redisClient, prefix: 'cicr:sess:' });
} else {
  console.warn('⚠️ REDIS_URL not set — using in-memory session store (development only). Set REDIS_URL for Redis-backed sessions.');
}
app.use(session(sessionOptions));

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/items', inventoryRoutes);
app.use('/api/borrow', borrowRoutes);
app.use('/api', dashboardRoutes); // Exposes GET /api/stats and GET /api/audit

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'success', message: 'CICR Inventory API is live! 🚀' });
});

export { dbRead };
export default app;
