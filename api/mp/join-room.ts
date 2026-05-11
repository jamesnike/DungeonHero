/**
 * POST /api/mp/join-room
 *
 * Join an existing waiting room as player B. Caller must be authenticated
 * via Supabase Anonymous Auth.
 *
 * Request body:
 *   {
 *     code: string,                 // 6-char room code from host
 *     displayName?: string,         // optional, ≤ 32 chars
 *   }
 *
 * Response 200:
 *   {
 *     roomId: uuid,
 *     code: string,
 *     status: 'playing',
 *     playerBRole: 'B',
 *     playerAUserId: uuid,
 *     playerBUserId: uuid,
 *     sharedDeck: GameCardData[],   // server-stored snapshot
 *     sharedDeckSeed: number,
 *   }
 *
 * Errors:
 *   400 — invalid code format
 *   401 — missing/invalid bearer
 *   404 — code not found
 *   409 — room already full / not waiting
 *   503 — Supabase env missing
 *
 * Race conditions: two clients calling join-room with the same code
 * simultaneously: the second one observes player_b already set, returns
 * 409. The check happens inside an UPDATE ... WHERE player_b IS NULL
 * conditional update, so it's atomic.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  badRequest,
  forbidden,
  getSupabase,
  getUserFromBearer,
  isValidRoomCode,
  methodNotAllowed,
  notFound,
  ok,
  serviceUnavailable,
  unauthorized,
} from './_shared';

const MAX_DISPLAY_NAME = 32;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const supabase = getSupabase();
  if (!supabase) return serviceUnavailable(res);

  const user = await getUserFromBearer(req);
  if (!user) return unauthorized(res);

  const { code, displayName } = (req.body ?? {}) as {
    code?: unknown;
    displayName?: unknown;
  };

  if (!isValidRoomCode(code)) return badRequest(res, 'invalid_code_format');

  const cleanDisplayName =
    typeof displayName === 'string' && displayName.length > 0
      ? displayName.slice(0, MAX_DISPLAY_NAME)
      : null;
  if (cleanDisplayName !== null) {
    await supabase.from('player_profiles').upsert(
      {
        id: user.id,
        display_name: cleanDisplayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  }

  // First, find the room. Read separately so we can return 404 vs 409 with
  // accurate semantics. RLS on `rooms` permits select only for participants
  // — but we're using the service-role client here, so this read bypasses
  // RLS. That's intentional: caller might not yet be a participant.
  const { data: room, error: lookupErr } = await supabase
    .from('rooms')
    .select('id, status, player_a, player_b, shared_deck_seed, shared_deck_full')
    .eq('code', code)
    .maybeSingle();

  if (lookupErr) {
    console.error('[/api/mp/join-room] lookup failed', lookupErr);
    return res.status(500).json({ error: 'lookup_failed' });
  }
  if (!room) return notFound(res, 'room_not_found');

  if (room.status !== 'waiting') {
    // Already playing or ended.
    return res.status(409).json({ error: 'room_not_joinable', status: room.status });
  }
  if (room.player_b !== null) {
    return res.status(409).json({ error: 'room_full' });
  }
  if (room.player_a === user.id) {
    // Host can't also be player B.
    return forbidden(res, 'host_cannot_join_as_b');
  }

  // Atomic claim: only set player_b + status='playing' if they're still null
  // / waiting (defense against join races between two B candidates).
  const { data: updated, error: claimErr } = await supabase
    .from('rooms')
    .update({
      player_b: user.id,
      status: 'playing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', room.id)
    .is('player_b', null)
    .eq('status', 'waiting')
    .select('id, code, status, player_a, player_b')
    .maybeSingle();

  if (claimErr) {
    console.error('[/api/mp/join-room] claim failed', claimErr);
    return res.status(500).json({ error: 'claim_failed' });
  }
  if (!updated) {
    // Someone else won the race.
    return res.status(409).json({ error: 'room_full' });
  }

  return ok(res, {
    roomId: updated.id,
    code: updated.code,
    status: updated.status,
    playerBRole: 'B',
    playerAUserId: updated.player_a,
    playerBUserId: updated.player_b,
    sharedDeck: room.shared_deck_full,
    sharedDeckSeed: room.shared_deck_seed,
  });
}
