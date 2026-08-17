// Database read/write connection pools (v1.5.0).
//
// Query splitting: all SELECTs (reads) route through `dbRead`, all
// INSERT/UPDATE/DELETE (writes) route through `dbWrite`. Point
// SUPABASE_READ_URL at a read replica when one is provisioned; today it
// falls back to the primary project URL so behaviour is identical on the
// free tier while the code path stays replica-ready.
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load env before reading process.env — this module is imported (and evaluates
// its clients) before any caller's own dotenv.config() runs.
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const readUrl = process.env.SUPABASE_READ_URL || supabaseUrl;

// Write pool (primary).
export const dbWrite: SupabaseClient = createClient(supabaseUrl, anonKey);

// Read pool (replica when SUPABASE_READ_URL is configured, else primary).
export const dbRead: SupabaseClient = createClient(readUrl, anonKey);

export const isReadReplicaConfigured = (): boolean => Boolean(process.env.SUPABASE_READ_URL);
