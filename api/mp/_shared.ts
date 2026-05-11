/**
 * Shared utilities for the multiplayer (`api/mp/*.ts`) Vercel endpoints.
 *
 * - `getSupabase()` returns a singleton service-role client (or null if env
 *   vars are missing — caller should respond 503 in that case).
 * - `getUserFromBearer()` validates the `Authorization: Bearer <jwt>` header
 *   against Supabase auth and returns the user id, or null on invalid /
 *   missing token.
 * - Common JSON helpers and 400/401/403/500 response shortcuts to keep the
 *   four MP endpoints uniform.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let _serviceSingleton: SupabaseClient | null | undefined;

/**
 * Service-role client. Bypasses RLS — use only for server-trusted writes
 * (insert into rooms / transfers, update room status, etc.). Never expose
 * the resulting client to the browser.
 */
export function getSupabase(): SupabaseClient | null {
  if (_serviceSingleton !== undefined) return _serviceSingleton;
  if (!supabaseUrl || !supabaseServiceKey) {
    _serviceSingleton = null;
    return null;
  }
  _serviceSingleton = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceSingleton;
}

/**
 * Validate the bearer token from the request and return the authenticated
 * user id (uuid) or null. We use a fresh anon-key client (NOT the
 * service-role one) so getUser() is constrained to the supplied JWT.
 */
export async function getUserFromBearer(
  req: VercelRequest,
): Promise<{ id: string; email?: string } | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const auth = req.headers.authorization || req.headers.Authorization;
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (!header || !header.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  if (token.length === 0) return null;

  // Lightweight per-request client — no singleton because each request
  // carries its own JWT.
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function methodNotAllowed(res: VercelResponse, allow: string): void {
  res.setHeader('Allow', allow);
  res.status(405).end();
}

export function badRequest(res: VercelResponse, error: string): void {
  res.status(400).json({ error });
}

export function unauthorized(res: VercelResponse, error = 'unauthorized'): void {
  res.status(401).json({ error });
}

export function forbidden(res: VercelResponse, error = 'forbidden'): void {
  res.status(403).json({ error });
}

export function notFound(res: VercelResponse, error = 'not_found'): void {
  res.status(404).json({ error });
}

export function serviceUnavailable(res: VercelResponse, error = 'service_unavailable'): void {
  res.status(503).json({ error });
}

export function ok<T>(res: VercelResponse, body: T): void {
  res.status(200).json(body);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function isValidRoomCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}

export function isValidUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Generate a 6-char alphanumeric room code (excluding ambiguous I/O/0/1
 * characters). Roughly log2(28^6) ≈ 28 bits of entropy — plenty for
 * friend-game-scale code namespaces; create-room retries on the rare
 * collision against `rooms.code` unique constraint.
 */
export function generateRoomCode(): string {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
