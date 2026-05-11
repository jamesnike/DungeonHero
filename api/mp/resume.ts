/**
 * POST /api/mp/resume
 *
 * Backfill any transfers we missed while the tab was offline. The client
 * passes the room id and its `lastAppliedSeq` (highest seq it has already
 * applied locally). The server returns every `transfers` row addressed to
 * us with `seq > lastAppliedSeq`, ordered ascending so the client can
 * apply them deterministically.
 *
 * Request body:
 *   {
 *     roomId: uuid,
 *     lastAppliedSeq: number,   // 0 means "give me everything"
 *   }
 *
 * Response 200:
 *   {
 *     roomId: uuid,
 *     myRole: 'A' | 'B',
 *     transfers: Array<{
 *       id: uuid,
 *       seq: number,
 *       fromPlayer: 'A' | 'B',
 *       toPlayer: 'A' | 'B',
 *       cards: GameCardData[],
 *       sharedConsumed: number,
 *     }>,
 *     sharedDeckConsumed: number,  // server's running counter for deck
 *   }
 *
 * Errors:
 *   400 — invalid body
 *   401 — missing/invalid bearer
 *   403 — caller is not a participant of room
 *   404 — room not found
 *   503 — Supabase env missing
 *
 * Why a separate endpoint vs. just relying on Realtime catch-up: Realtime
 * only delivers events that arrive AFTER subscription. Anything that
 * happened while the tab was closed (the entire purpose of resume) is
 * invisible to it.
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

const MAX_BACKFILL_ROWS = 200; // sane cap; >200 = something's very wrong

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const supabase = getSupabase();
  if (!supabase) return serviceUnavailable(res);

  const user = await getUserFromBearer(req);
  if (!user) return unauthorized(res);

  const { roomId, lastAppliedSeq } = (req.body ?? {}) as {
    roomId?: unknown;
    lastAppliedSeq?: unknown;
  };

  if (!isValidUuid(roomId)) return badRequest(res, 'invalid_roomId');
  if (
    typeof lastAppliedSeq !== 'number' ||
    !Number.isFinite(lastAppliedSeq) ||
    lastAppliedSeq < 0
  ) {
    return badRequest(res, 'invalid_lastAppliedSeq');
  }

  // Look up room + verify caller participation.
  const { data: room, error: lookupErr } = await supabase
    .from('rooms')
    .select('id, status, player_a, player_b, shared_deck_consumed')
    .eq('id', roomId)
    .maybeSingle();

  if (lookupErr) {
    console.error('[/api/mp/resume] lookup failed', lookupErr);
    return res.status(500).json({ error: 'lookup_failed' });
  }
  if (!room) return notFound(res, 'room_not_found');

  let myRole: 'A' | 'B';
  if (room.player_a === user.id) myRole = 'A';
  else if (room.player_b === user.id) myRole = 'B';
  else return forbidden(res, 'not_a_participant');

  // Pull transfers addressed to us with seq > lastAppliedSeq.
  // We use the wire-protocol seq (= raw `transfers.seq`), NOT the
  // doubled-action seq (`seq*2` / `seq*2+1`) the reducer's
  // `lastAppliedSeq` tracks. The client converts back when dispatching.
  //
  // Convention: the persisted client `lastAppliedSeq` is the
  // *highest reducer-action seq* it has applied (= `wireSeq*2 + 1`).
  // To filter rows, divide by 2 (integer floor) to get the wire seq:
  const minWireSeq = Math.floor(lastAppliedSeq / 2);

  const { data: transfers, error: transfersErr } = await supabase
    .from('transfers')
    .select('id, seq, from_player, to_player, cards, shared_consumed')
    .eq('room_id', roomId)
    .eq('to_player', myRole)
    .gt('seq', minWireSeq)
    .order('seq', { ascending: true })
    .limit(MAX_BACKFILL_ROWS);

  if (transfersErr) {
    console.error('[/api/mp/resume] transfers query failed', transfersErr);
    return res.status(500).json({ error: 'transfers_query_failed' });
  }

  return ok(res, {
    roomId: room.id,
    myRole,
    transfers: (transfers ?? []).map(t => ({
      id: t.id,
      seq: t.seq,
      fromPlayer: t.from_player,
      toPlayer: t.to_player,
      cards: t.cards,
      sharedConsumed: t.shared_consumed,
    })),
    sharedDeckConsumed: room.shared_deck_consumed,
  });
}
