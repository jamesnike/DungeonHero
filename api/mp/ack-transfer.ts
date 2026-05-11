/**
 * POST /api/mp/ack-transfer
 *
 * Mark a transfer as applied by the receiving client. Used by the resume
 * flow (phase 6) to know which transfers still need replaying after a
 * tab reload.
 *
 * Request body:
 *   {
 *     transferId: uuid,
 *   }
 *
 * Response 200:
 *   {
 *     transferId: uuid,
 *     applied: true,
 *   }
 *
 * Errors:
 *   400 — invalid body
 *   401 — missing/invalid bearer
 *   403 — caller is not the `to_player` of this transfer
 *   404 — transfer not found
 *   503 — Supabase env missing
 *
 * Idempotent: acking a transfer that's already applied is a no-op success.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const supabase = getSupabase();
  if (!supabase) return serviceUnavailable(res);

  const user = await getUserFromBearer(req);
  if (!user) return unauthorized(res);

  const { transferId } = (req.body ?? {}) as { transferId?: unknown };
  if (!isValidUuid(transferId)) return badRequest(res, 'invalid_transferId');

  // Look up the transfer + the room participant pair so we can verify the
  // ack came from the intended recipient.
  const { data: transfer, error: lookupErr } = await supabase
    .from('transfers')
    .select('id, room_id, to_player, applied, rooms!inner(player_a, player_b)')
    .eq('id', transferId)
    .maybeSingle();

  if (lookupErr) {
    console.error('[/api/mp/ack-transfer] lookup failed', lookupErr);
    return res.status(500).json({ error: 'lookup_failed' });
  }
  if (!transfer) return notFound(res, 'transfer_not_found');

  // Type wrangle — the embedded `rooms` join is an object not array
  // because of the `!inner` hint.
  const room = (transfer as unknown as { rooms: { player_a: string; player_b: string | null } })
    .rooms;
  const expectedRecipient = transfer.to_player === 'A' ? room.player_a : room.player_b;
  if (expectedRecipient !== user.id) return forbidden(res, 'not_recipient');

  if (transfer.applied) {
    // Idempotent fast path.
    return ok(res, { transferId, applied: true });
  }

  const { error: updateErr } = await supabase
    .from('transfers')
    .update({ applied: true, applied_at: new Date().toISOString() })
    .eq('id', transferId);

  if (updateErr) {
    console.error('[/api/mp/ack-transfer] update failed', updateErr);
    return res.status(500).json({ error: 'update_failed' });
  }

  return ok(res, { transferId, applied: true });
}
