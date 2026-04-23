import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
    : null;

type PrevPayload = {
  gameMode?: 'quick' | 'normal';
  turnCount?: number;
  outcome?: 'death' | 'victory' | 'abandoned';
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  if (!supabase) {
    return res.status(204).end();
  }

  const { clientId, gameMode, prev } = (req.body ?? {}) as {
    clientId?: unknown;
    gameMode?: unknown;
    prev?: PrevPayload | null;
  };

  if (typeof clientId !== 'string' || clientId.length === 0) {
    return res.status(400).end();
  }
  if (gameMode !== 'quick' && gameMode !== 'normal') {
    return res.status(400).end();
  }

  const fwd = req.headers['x-forwarded-for'];
  const fwdValue = Array.isArray(fwd) ? fwd[0] : fwd;
  const clientIp = (fwdValue ?? '').split(',')[0]?.trim() || null;

  const userAgent = (req.headers['user-agent'] ?? '').toString().slice(0, 500) || null;

  const prevGameMode =
    prev?.gameMode === 'quick' || prev?.gameMode === 'normal' ? prev.gameMode : null;
  const prevTurnCount =
    typeof prev?.turnCount === 'number' && Number.isFinite(prev.turnCount)
      ? Math.max(0, Math.floor(prev.turnCount))
      : null;
  const prevOutcome =
    prev?.outcome === 'death' || prev?.outcome === 'victory' || prev?.outcome === 'abandoned'
      ? prev.outcome
      : null;

  await supabase
    .from('game_starts')
    .insert({
      client_ip: clientIp,
      client_id: clientId.slice(0, 64),
      game_mode: gameMode,
      user_agent: userAgent,
      prev_game_mode: prevGameMode,
      prev_turn_count: prevTurnCount,
      prev_outcome: prevOutcome,
    })
    .then(
      () => {},
      () => {},
    );

  return res.status(204).end();
}
