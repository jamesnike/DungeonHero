/**
 * Client-side Supabase singleton for the multiplayer feature.
 *
 * Uses Anonymous Auth (no signup required). The first call to
 * `getSupabaseClient()` lazy-creates the client. `signInAnonymouslyOnce()`
 * upgrades from "no session" to "anonymous session" on demand.
 *
 * The anon key is safe to ship in the bundle — all writes go through
 * server-side `/api/mp/*.ts` endpoints (service role), and reads are
 * gated by RLS policies on `rooms` / `transfers`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Vite injects `import.meta.env.VITE_*` into the bundle at build time.
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '') as string;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string;

let _singleton: SupabaseClient | null | undefined;

/**
 * Returns the Supabase client, or `null` if env vars are missing (i.e.
 * single-player builds without multiplayer configured). Callers must
 * null-check and degrade gracefully.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (_singleton !== undefined) return _singleton;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    _singleton = null;
    return null;
  }
  _singleton = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Persist session in localStorage so reload survives auth.
      persistSession: true,
      autoRefreshToken: true,
      // Multiplayer doesn't currently use email magic-link / oauth, but
      // detectSessionInUrl is the supabase-js default — we keep it on.
      detectSessionInUrl: false,
    },
  });
  return _singleton;
}

/**
 * Returns true once the client has a session (anonymous or otherwise).
 * Lazy: triggers `signInAnonymously()` only if no session exists.
 *
 * Returns the user id on success, null if the underlying auth call fails
 * (e.g. anonymous auth disabled in the Supabase project — surface that
 * to the user as "multiplayer requires anonymous auth in your Supabase
 * project").
 */
export async function ensureAnonymousSession(): Promise<{ userId: string; jwt: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  // 1. Check existing session (cookie / localStorage hydration).
  const { data: existing } = await client.auth.getSession();
  if (existing.session?.user) {
    return {
      userId: existing.session.user.id,
      jwt: existing.session.access_token,
    };
  }

  // 2. Fall back to anonymous sign-in.
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data?.session?.user) {
    console.error('[supabaseClient] anonymous sign-in failed', error);
    return null;
  }
  return {
    userId: data.session.user.id,
    jwt: data.session.access_token,
  };
}

/**
 * Convenience wrapper to fetch the current bearer JWT for an
 * authenticated request to `/api/mp/*`. Returns null if no session.
 */
export async function getCurrentJwt(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
