"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearSessionUser = exports.requireRole = exports.requireAdmin = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const VALID_ROLES = ['ADMIN', 'MEMBER'];
const parseJwtUser = (decoded) => {
    if (!decoded || typeof decoded !== 'object')
        return null;
    const d = decoded;
    if (typeof d.id !== 'string' || typeof d.email !== 'string')
        return null;
    if (d.role !== 'ADMIN' && d.role !== 'MEMBER')
        return null;
    return {
        id: d.id,
        name: typeof d.name === 'string' ? d.name : 'User',
        email: d.email,
        role: d.role,
        roll_number: typeof d.roll_number === 'string' ? d.roll_number : null
    };
};
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const secret = process.env.JWT_SECRET;
            if (!secret) {
                console.error('FATAL: JWT_SECRET environment variable is not set.');
                return res.status(500).json({ status: 'error', message: 'Server misconfiguration.' });
            }
            const options = {};
            if (process.env.JWT_ISSUER)
                options.issuer = process.env.JWT_ISSUER;
            if (process.env.JWT_AUDIENCE)
                options.audience = process.env.JWT_AUDIENCE;
            const decoded = jsonwebtoken_1.default.verify(token, secret, options);
            const user = parseJwtUser(decoded);
            if (!user) {
                return res.status(403).json({ status: 'error', message: 'Invalid token claims.' });
            }
            req.user = user;
            return next();
        }
        catch (err) {
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
exports.authenticateToken = authenticateToken;
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ status: 'error', message: 'Forbidden. Admin access required.' });
    }
    next();
};
exports.requireAdmin = requireAdmin;
// Strict RBAC: allow only the listed roles through.
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden. Required role not satisfied.' });
    }
    next();
};
exports.requireRole = requireRole;
// Invalidate any stale in-session user on the express-session store (used on
// logout). With Redis this deletes the session cookie server-side.
const clearSessionUser = (req) => new Promise((resolve) => {
    try {
        req.session?.destroy(() => resolve());
    }
    catch {
        resolve();
    }
});
exports.clearSessionUser = clearSessionUser;
