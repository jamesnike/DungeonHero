/**
 * POST /api/mp/transfer
 *
 * Send a transferOut event from one player to the other. The server:
 *   1. Validates the caller is a participant of the room.
 *   2. Allocates the next monotonic `seq` for that room (via SELECT ...
 *      FOR UPDATE inside a transaction would be ideal — but Supabase
 *      JS doesn't expose explicit transactions easily; instead we use
 *      a `select max(seq) + insert` pattern with the unique constraint
 *      as the safety net. On collision (rare) the client retries.)
 *   3. Inserts a `transfers` row with `cards` (push-to-peer) and
 *      `preview_dealt` (cards the sender just dealt to its own preview;
 *      receiver removes them from its deck by id).
 *   4. Bumps `rooms.shared_deck_consumed` by the count of "originally
 *      shared" cards in `previewDealt` (cards without
 *      `_excludedFromShared: true`). Counter is informational only — the
 *      protocol uses id-based removal, not counts.
 *   5. Realtime propagates the INSERT to the receiver.
 *
 * Request body:
 *   {
 *     roomId: uuid,
 *     fromRole: 'A' | 'B',
 *     cards: GameCardData[],
 *     previewDealt: GameCardData[],
 *   }
 *
 * Response 200:
 *   {
 *     transferId: uuid,
 *     seq: number,
 *   }
 *
 * Errors:
 *   400 — invalid body
 *   401 — missing/invalid bearer
 *   403 — caller is not a participant of room
 *   404 — room not found
 *   409 — seq collision (caller should retry)
 *   503 — Supabase env missing
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  badRequest,
  forbidden,
  getSupabase,
  getUserFromBearer,
  isValidUuid,
  methodNotAllowed,
  notFound,
  ok,
  serviceUnavailable,
  unauthorized,
} from './_shared.js';

const MAX_TRANSFER_CARDS = 10; // sanity cap; real waterfalls push 0–4
const MAX_PREVIEW_DEALT = 12; // sanity cap; real waterfalls deal 0–4 per iter, allow some headroom

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const supabase = getSupabase();
  if (!supabase) return serviceUnavailable(res);

  const user = await getUserFromBearer(req);
  if (!user) return unauthorized(res);

  const { roomId, fromRole, cards, previewDealt } = (req.body ?? {}) as {
    roomId?: unknown;
    fromRole?: unknown;
    cards?: unknown;
    previewDealt?: unknown;
  };

  if (!isValidUuid(roomId)) return badRequest(res, 'invalid_roomId');
  if (fromRole !== 'A' && fromRole !== 'B') return badRequest(res, 'invalid_fromRole');
  if (!Array.isArray(cards) || cards.length > MAX_TRANSFER_CARDS) {
    return badRequest(res, 'invalid_cards');
  }
  if (!Array.isArray(previewDealt) || previewDealt.length > MAX_PREVIEW_DEALT) {
    return badRequest(res, 'invalid_previewDealt');
  }

  // Count "originally shared" cards in previewDealt for the cumulative
  // counter (cards without `_excludedFromShared: true` — those originated
  // from the shared deck rather than from the peer's transfers). This is
  // informational only; the sync protocol uses id-based removal.
  const sharedConsumed = (previewDealt as Array<{ _excludedFromShared?: boolean }>)
    .reduce((acc, c) => acc + (c?._excludedFromShared === true ? 0 : 1), 0);

  // Verify caller is the claimed `fromRole` of this room.
  const { data: room, error: lookupErr } = await supabase
    .from('rooms')
    .select('id, status, player_a, player_b, shared_deck_consumed')
    .eq('id', roomId)
    .maybeSingle();

  if (lookupErr) {
    console.error('[/api/mp/transfer] lookup failed', lookupErr);
    return res.status(500).json({ error: 'lookup_failed' });
  }
  if (!room) return notFound(res, 'room_not_found');
  if (room.status !== 'playing') {
    return res.status(409).json({ error: 'room_not_active', status: room.status });
  }

  const expectedUserId = fromRole === 'A' ? room.player_a : room.player_b;
  if (expectedUserId !== user.id) return forbidden(res, 'role_mismatch');

  const toRole: 'A' | 'B' = fromRole === 'A' ? 'B' : 'A';

  // Allocate next seq. We do `select max(seq) + 1` then insert; the
  // unique(room_id, seq) constraint catches the rare race. On collision,
  // we retry up to 3 times.
  let assignedSeq: number | null = null;
  let inserted: { id: string; seq: number } | null = null;
  let lastInsertErr: unknown = null;

  for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
    const { data: maxRow } = await supabase
      .from('transfers')
      .select('seq')
      .eq('room_id', roomId)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();

    assignedSeq = (maxRow?.seq ?? 0) + 1;

    const { data, error } = await supabase
      .from('transfers')
      .insert({
        room_id: roomId,
        seq: assignedSeq,
        from_player: fromRole,
        to_player: toRole,
        cards,
        preview_dealt: previewDealt,
        shared_consumed: sharedConsumed, // legacy column, populated for back-compat
      })
      .select('id, seq')
      .single();

    if (error) {
      // 23505 = unique violation = seq race; try again.
      if ((error as { code?: string }).code === '23505') {
        lastInsertErr = error;
        continue;
      }
      console.error('[/api/mp/transfer] insert failed', error);
      return res.status(500).json({ error: 'insert_failed' });
    }

    inserted = data;
  }

  if (!inserted) {
    console.error('[/api/mp/transfer] seq allocation exhausted', lastInsertErr);
    return res.status(409).json({ error: 'seq_collision_exhausted' });
  }

  // Bump room.shared_deck_consumed (best-effort; if it fails, the seq is
  // still allocated so the transfer is "live" — counter just lags behind).
  if (sharedConsumed > 0) {
    await supabase
      .from('rooms')
      .update({
        shared_deck_consumed: room.shared_deck_consumed + sharedConsumed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId);
  }

  return ok(res, { transferId: inserted.id, seq: inserted.seq });
}
