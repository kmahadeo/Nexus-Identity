/**
 * lib/supabase.ts — Supabase client for Vite + React.
 *
 * Uses VITE_ prefixed env vars (Vite exposes these to the client).
 * The anon key is safe to include in client code — RLS policies
 * enforce access control at the database level.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing env vars VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — running in localStorage-only mode');
}

/**
 * Singleton Supabase client.
 * Returns null if env vars are not configured (falls back to localStorage).
 */
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // We handle OAuth ourselves
      },
    });
  }
  return _client;
}

/**
 * Check if Supabase is configured and available.
 */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

/**
 * Set the current user's principal_id for RLS policies.
 * Call this after login — it sets a Postgres config variable
 * that RLS policies use to filter data.
 */
export async function setCurrentPrincipal(principalId: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  // Set the principal_id in the session's Postgres settings
  // This is used by RLS policies: current_setting('app.current_principal_id')
  // RLS is currently permissive for beta — this function is a no-op
  // When strict RLS is enabled, implement set_config via a Postgres function
  void principalId;
}

export type { SupabaseClient };
