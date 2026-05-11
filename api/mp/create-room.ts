/**
 * POST /api/mp/create-room
 *
 * Create a new multiplayer room. The CALLER (player A) must be
 * authenticated via Supabase Anonymous Auth and pass their JWT in
 * `Authorization: Bearer <jwt>`. The caller also supplies the
 * `sharedDeck` (constructed client-side via `createDeck()`) and
 * `sharedDeckSeed` so the server can stamp them on the row.
 *
 * Why client-supplied deck (phase-4 design tradeoff):
 *   - The deck construction logic lives in `client/src/game-core/deck.ts`
 *     and pulls in many client-only imports (image assets, types). Porting
 *     it to a shared `lib/` for server use is a substantial cleanup that
 *     we deferred. For phase 4, we trust the caller (host) — both players
 *     in a friend lobby see the same deck because the server snapshots
 *     it at create-time and serves the same blob to player B at
 *     join-room time.
 *   - Anti-cheat (server constructs deck independently and validates
 *     parity against client) is an explicit phase-7+ feature.
 *
 * Request body:
 *   {
 *     sharedDeck: GameCardData[],   // 36 cards
 *     sharedDeckSeed: number,       // for client-side determinism
 *     displayName?: string,         // optional, ≤ 32 chars
 *   }
 *
 * Response 200:
 *   {
 *     roomId: uuid,
 *     code: string,                 // 6-char join code
 *     status: 'waiting',
 *     playerARole: 'A',
 *     playerAUserId: uuid,
 *   }
 *
 * Errors:
 *   400 — invalid body / wrong deck size
 *   401 — missing or invalid bearer token
 *   503 — Supabase env missing (local dev without secrets)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  badRequest,
  generateRoomCode,
  getSupabase,
  getUserFromBearer,
  methodNotAllowed,
  ok,
  serviceUnavailable,
  unauthorized,
} from './_shared';

const EXPECTED_DECK_SIZE = 36;
const MAX_DISPLAY_NAME = 32;
const MAX_CODE_RETRIES = 8;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const supabase = getSupabase();
  if (!supabase) return serviceUnavailable(res);

  const user = await getUserFromBearer(req);
  if (!user) return unauthorized(res);

  const { sharedDeck, sharedDeckSeed, displayName } = (req.body ?? {}) as {
    sharedDeck?: unknown;
    sharedDeckSeed?: unknown;
    displayName?: unknown;
  };

  if (!Array.isArray(sharedDeck) || sharedDeck.length !== EXPECTED_DECK_SIZE) {
    return badRequest(res, `expected sharedDeck of length ${EXPECTED_DECK_SIZE}`);
  }
  if (typeof sharedDeckSeed !== 'number' || !Number.isFinite(sharedDeckSeed)) {
    return badRequest(res, 'expected numeric sharedDeckSeed');
  }
  const cleanDisplayName =
    typeof displayName === 'string' && displayName.length > 0
      ? displayName.slice(0, MAX_DISPLAY_NAME)
      : null;

  // Upsert profile (idempotent — first room creation also creates the
  // profile; subsequent ones may update display_name).
  if (cleanDisplayName !== null) {
    await supabase
      .from('player_profiles')
      .upsert(
        {
          id: user.id,
          display_name: cleanDisplayName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
  }

  // Allocate a unique 6-char code. Retry on the unlikely collision (28^6
  // ≈ 480M combinations; but we're paranoid about correctness).
  let code = '';
  let inserted: { id: string } | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
    code = generateRoomCode();
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        code,
        status: 'waiting',
        player_a: user.id,
        shared_deck_seed: Math.floor(sharedDeckSeed),
        shared_deck_full: sharedDeck,
      })
      .select('id')
      .single();

    if (error) {
      // Postgres unique-violation = code collision; try again. Anything
      // else is a real error.
      if ((error as { code?: string }).code === '23505') {
        lastError = error;
        continue;
      }
      console.error('[/api/mp/create-room] insert failed', error);
      return res.status(500).json({ error: 'insert_failed' });
    }

    inserted = data;
    break;
  }

  if (!inserted) {
    console.error('[/api/mp/create-room] code allocation exhausted', lastError);
    return res.status(500).json({ error: 'code_allocation_failed' });
  }

  return ok(res, {
    roomId: inserted.id,
    code,
    status: 'waiting',
    playerARole: 'A',
    playerAUserId: user.id,
  });
}
