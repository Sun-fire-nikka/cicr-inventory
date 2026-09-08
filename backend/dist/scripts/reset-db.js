"use strict";
/**
 * reset-db.ts — Clear mock/test rows from Supabase tables.
 *
 * Usage:  npx tsx backend/src/scripts/reset-db.ts
 *
 * Tables cleared:
 *   - audit_logs      (all rows)
 *   - borrow_records   (all rows)
 *   - auth_otps        (all rows)
 *   - items            (all rows)
 *
 * Environment variables required (loaded from backend/.env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const supabase_js_1 = require("@supabase/supabase-js");
// Load backend/.env
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in backend/.env');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, anonKey);
const TABLES_TO_CLEAR = [
    'audit_logs',
    'borrow_records',
    'auth_otps',
    'items',
];
async function resetTable(tableName) {
    // Count rows first
    const { count, error: countErr } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
    if (countErr) {
        return { deleted: 0, error: countErr.message };
    }
    const rowCount = count ?? 0;
    if (rowCount === 0) {
        return { deleted: 0, error: null };
    }
    // Try deleting all rows. Supabase RLS requires a WHERE clause.
    // Attempt with a broad timestamp filter (works for tables with created_at).
    let delErr = null;
    // First try: use created_at if it exists
    const { error: err1 } = await supabase
        .from(tableName)
        .delete()
        .gte('created_at', '1970-01-01T00:00:00Z');
    if (err1) {
        // Second try: use updated_at
        const { error: err2 } = await supabase
            .from(tableName)
            .delete()
            .gte('updated_at', '1970-01-01T00:00:00Z');
        if (err2) {
            // Third try: use id with text comparison
            const { error: err3 } = await supabase
                .from(tableName)
                .delete()
                .gte('id', '00000000-0000-0000-0000-000000000000');
            delErr = err3;
        }
    }
    if (delErr) {
        return { deleted: 0, error: delErr.message };
    }
    return { deleted: rowCount, error: null };
}
async function main() {
    console.log('🔄 CICR Database Reset Script');
    console.log(`   Target: ${supabaseUrl}`);
    console.log('─'.repeat(50));
    let totalDeleted = 0;
    let hasErrors = false;
    for (const table of TABLES_TO_CLEAR) {
        process.stdout.write(`   ${table} ... `);
        const { deleted, error } = await resetTable(table);
        if (error) {
            console.log(`⚠️  ${error}`);
            hasErrors = true;
        }
        else {
            console.log(`✅ ${deleted} row(s) deleted`);
            totalDeleted += deleted;
        }
    }
    console.log('─'.repeat(50));
    console.log(`   Total rows deleted: ${totalDeleted}`);
    if (hasErrors) {
        console.log('\n⚠️  Some tables had errors — check RLS policies or table existence.');
        process.exit(1);
    }
    console.log('✅ Database reset complete.');
}
main().catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
