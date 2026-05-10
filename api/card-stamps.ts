import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
    : null;

const PRESET_STAMP_IDS = ['recommend', 'deadly', 'safe', 'strong', 'died', 'howto'] as const;
const ALL_STAMP_IDS = [...PRESET_STAMP_IDS, 'freeform'] as const;
type StampId = (typeof ALL_STAMP_IDS)[number];

const MAX_FREEFORM_LEN = 80;
const MAX_TARGET_NAME_LEN = 256;
const MAX_ROW_SIG_LEN = 1024;
const FREEFORM_RATE_LIMIT = 10;
const FREEFORM_RATE_WINDOW_SEC = 60;

function isStampId(value: unknown): value is StampId {
  return typeof value === 'string' && (ALL_STAMP_IDS as readonly string[]).includes(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  // Treat missing Supabase env as a no-op success (mirrors api/game-start.ts) so
  // local/preview deploys without secrets don't break the client UX.
  if (!supabase) {
    return res.status(204).end();
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const {
    clientId,
    gameMode,
    targetCardName,
    rowSignature,
    sourceRow,
    stampId,
    messageText,
  } = body;

  if (typeof clientId !== 'string' || clientId.length === 0 || clientId.length > 64) {
    return res.status(400).json({ error: 'invalid_clientId' });
  }
  if (gameMode !== 'quick' && gameMode !== 'normal') {
    return res.status(400).json({ error: 'invalid_gameMode' });
  }
  if (
    typeof targetCardName !== 'string' ||
    targetCardName.length === 0 ||
    targetCardName.length > MAX_TARGET_NAME_LEN
  ) {
    return res.status(400).json({ error: 'invalid_targetCardName' });
  }
  if (
    typeof rowSignature !== 'string' ||
    rowSignature.length === 0 ||
    rowSignature.length > MAX_ROW_SIG_LEN
  ) {
    return res.status(400).json({ error: 'invalid_rowSignature' });
  }
  if (sourceRow !== 'active' && sourceRow !== 'preview') {
    return res.status(400).json({ error: 'invalid_sourceRow' });
  }
  if (!isStampId(stampId)) {
    return res.status(400).json({ error: 'invalid_stampId' });
  }

  // Freeform validation + rate limit
  let normalizedMessage: string | null = null;
  if (stampId === 'freeform') {
    if (typeof messageText !== 'string') {
      return res.status(400).json({ error: 'missing_messageText' });
    }
    const trimmed = messageText.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({ error: 'empty_messageText' });
    }
    if (trimmed.length > MAX_FREEFORM_LEN) {
      return res.status(400).json({ error: 'oversize_messageText' });
    }
    normalizedMessage = trimmed;

    // Rate limit: max 10 freeform messages per clientId per 60s.
    const since = new Date(Date.now() - FREEFORM_RATE_WINDOW_SEC * 1000).toISOString();
    try {
      const { count, error } = await supabase
        .from('card_stamps')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('stamp_id', 'freeform')
        .gte('created_at', since);
      if (error) {
        // On query failure, fail open (let it through) — never block users due to ops issues.
      } else if ((count ?? 0) >= FREEFORM_RATE_LIMIT) {
        return res.status(429).json({ error: 'rate_limited' });
      }
    } catch {
      // ignore — fail open
    }
  } else {
    // Preset stamps must NOT carry message_text.
    normalizedMessage = null;
  }

  const fwd = req.headers['x-forwarded-for'];
  const fwdValue = Array.isArray(fwd) ? fwd[0] : fwd;
  const clientIp = (fwdValue ?? '').split(',')[0]?.trim() || null;
  const userAgent = (req.headers['user-agent'] ?? '').toString().slice(0, 500) || null;

  const insertRow = {
    client_id: clientId.slice(0, 64),
    client_ip: clientIp,
    user_agent: userAgent,
    target_card_name: targetCardName,
    row_signature: rowSignature,
    source_row: sourceRow,
    stamp_id: stampId,
    message_text: normalizedMessage,
    game_mode: gameMode,
  };

  try {
    if (stampId === 'freeform') {
      // Freeform messages can repeat; plain insert.
      await supabase.from('card_stamps').insert(insertRow);
    } else {
      // Preset stamps: dedupe by partial unique index. ignoreDuplicates lets us
      // silently swallow a player re-clicking the same preset.
      await supabase.from('card_stamps').upsert(insertRow, {
        onConflict: 'client_id,row_signature,target_card_name,stamp_id',
        ignoreDuplicates: true,
      });
    }
  } catch {
    // Swallow — telemetry-style fire-and-forget. Never break the player UX.
  }

  return res.status(204).end();
}
