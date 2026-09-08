"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReadReplicaConfigured = exports.dbRead = exports.dbWrite = void 0;
// Database read/write connection pools (v1.5.0).
//
// Query splitting: all SELECTs (reads) route through `dbRead`, all
// INSERT/UPDATE/DELETE (writes) route through `dbWrite`. Point
// SUPABASE_READ_URL at a read replica when one is provisioned; today it
// falls back to the primary project URL so behaviour is identical on the
// free tier while the code path stays replica-ready.
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_js_1 = require("@supabase/supabase-js");
// Load env before reading process.env — this module is imported (and evaluates
// its clients) before any caller's own dotenv.config() runs.
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const anonKey = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';
const readUrl = process.env.SUPABASE_READ_URL || supabaseUrl;
// Write pool (primary).
exports.dbWrite = (0, supabase_js_1.createClient)(supabaseUrl, anonKey);
// Read pool (replica when SUPABASE_READ_URL is configured, else primary).
exports.dbRead = (0, supabase_js_1.createClient)(readUrl, anonKey);
const isReadReplicaConfigured = () => Boolean(process.env.SUPABASE_READ_URL);
exports.isReadReplicaConfigured = isReadReplicaConfigured;
