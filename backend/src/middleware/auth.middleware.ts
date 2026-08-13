// Authentication & authorization middleware (v1.5.0).
//
// Authentication is JWT-first (Bearer) with a Redis-backed express-session
// cookie fallback:
//   1. A Bearer JWT is verified with strict claim validation (exp handled by
//      jsonwebtoken, role restricted to ADMIN|MEMBER, optional iss/aud checked
//      when JWT_ISSUER / JWT_AUDIENCE are configured).
//   2. If no Bearer token is present, the signed session cookie
//      (express-session + connect-redis) is trusted — req.session.user is the
//      same AuthUser shape the JWT carries.
//
// Authorization is role-based (RBAC): `requireRole('ADMIN')` / `requireAdmin`
// for admin endpoints, `requireRole('ADMIN','MEMBER')` for member endpoints.
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

declare module 'express-session' {
  interface SessionData {
    user?: AuthUser;
  }
}

const VALID_ROLES: AuthUser['role'][] = ['ADMIN', 'MEMBER'];

const parseJwtUser = (decoded: unknown): AuthUser | null => {
  if (!decoded || typeof decoded !== 'object') return null;
  const d = decoded as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.email !== 'string') return null;
  if (d.role !== 'ADMIN' && d.role !== 'MEMBER') return null;
  return {
    id: d.id,
    name: typeof d.name === 'string' ? d.name : 'User',
    email: d.email,
    role: d.role
  };
};

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'super_secret_cicr_key';
      const options: jwt.VerifyOptions = {};
      if (process.env.JWT_ISSUER) options.issuer = process.env.JWT_ISSUER;
      if (process.env.JWT_AUDIENCE) options.audience = process.env.JWT_AUDIENCE;

      const decoded = jwt.verify(token, secret, options);
      const user = parseJwtUser(decoded);
      if (!user) {
        return res.status(403).json({ status: 'error', message: 'Invalid token claims.' });
      }
      req.user = user;
      return next();
    } catch (err) {
      return res.status(403).json({ status: 'error', message: 'Invalid or expired token.' });
    }
  }

  // Redis cookie session fallback (express-session store).
  const sessionUser = req.session?.user;
  if (sessionUser && VALID_ROLES.includes(sessionUser.role)) {
    req.user = sessionUser;
    return next();
  }

  return res.status(401).json({ status: 'error', message: 'Access denied. Token missing.' });
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ status: 'error', message: 'Forbidden. Admin access required.' });
  }
  next();
};

// Strict RBAC: allow only the listed roles through.
export const requireRole =
  (...roles: AuthUser['role'][]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden. Required role not satisfied.' });
    }
    next();
  };

// Invalidate any stale in-session user on the express-session store (used on
// logout). With Redis this deletes the session cookie server-side.
export const clearSessionUser = (req: Request): Promise<void> =>
  new Promise((resolve) => {
    try {
      req.session?.destroy(() => resolve());
    } catch {
      resolve();
    }
  });
