"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const app_2 = require("./app");
const reminderService_1 = require("./services/reminderService");
const system_routes_1 = __importDefault(require("./routes/system.routes"));
const PORT = process.env.PORT || 5000;
app_1.default.use('/api/system', system_routes_1.default);
app_1.default.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
(0, reminderService_1.startReminderScheduler)();
async function testConnection() {
    try {
        const { error } = await app_2.supabase.from('users').select('id').limit(1);
        if (error && error.code !== 'PGRST116') {
            console.warn('⚠️ Supabase connection warning:', error.message);
        }
        else {
            console.log('⚡ Connected to Supabase PostgreSQL successfully!');
        }
    }
    catch (err) {
        console.error('❌ Supabase connection failed:', err.message);
    }
}
testConnection();
