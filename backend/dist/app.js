"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbRead = exports.supabase = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const connect_redis_1 = require("connect-redis");
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("./config/database");
Object.defineProperty(exports, "dbRead", { enumerable: true, get: function () { return database_1.dbRead; } });
const redis_1 = require("./config/redis");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const inventory_routes_1 = __importDefault(require("./modules/inventory/inventory.routes"));
const borrow_routes_1 = __importDefault(require("./modules/borrow/borrow.routes"));
const dashboard_routes_1 = __importDefault(require("./modules/dashboard/dashboard.routes"));
dotenv_1.default.config();
// Write pool — backward-compatible alias used by controllers/tests.
exports.supabase = database_1.dbWrite;
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.options('*', (0, cors_1.default)());
app.use(express_1.default.json());
// Redis-backed cookie sessions (v1.5.0). JWT Bearer auth remains the primary
// path; sessions give an additional cookie-based carrier stored in Redis.
const sessionOptions = {
    secret: process.env.SESSION_SECRET || 'cicr_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
};
if (redis_1.isRedisEnabled && redis_1.redisClient) {
    sessionOptions.store = new connect_redis_1.RedisStore({ client: redis_1.redisClient, prefix: 'cicr:sess:' });
}
else {
    console.warn('⚠️ REDIS_URL not set — using in-memory session store (development only). Set REDIS_URL for Redis-backed sessions.');
}
app.use((0, express_session_1.default)(sessionOptions));
// API Endpoints
app.use('/api/auth', auth_routes_1.default);
app.use('/api/items', inventory_routes_1.default);
app.use('/api/borrow', borrow_routes_1.default);
app.use('/api', dashboard_routes_1.default); // Exposes GET /api/stats and GET /api/audit
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'CICR Inventory API is live! 🚀' });
});
exports.default = app;
