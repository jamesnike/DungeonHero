import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
    : null;

const MAX_SIGS_PER_REQUEST = 4;
const FREEFORM_PER_BUCKET_CAP = 20;
const MAX_ROW_SIG_LEN = 1024;

type FreeformEntry = { id: string; message: string; createdAt: string };
type CardEntry = {
  stampCounts: Record<string, number>;
  freeform: FreeformEntry[];
};
type LookupResult = Record<string, Record<string, CardEntry>>;

function ensureCardEntry(
  result: LookupResult,
  signature: string,
  cardName: string,
): CardEntry {
  let bySig = result[signature];
  if (!bySig) {
    bySig = {};
    result[signature] = bySig;
  }
  let entry = bySig[cardName];
  if (!entry) {
    entry = { stampCounts: {}, freeform: [] };
    bySig[cardName] = entry;
  }
  return entry;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  if (!supabase) {
    return res.status(200).json({});
  }

  const body = (req.body ?? {}) as { signatures?: unknown };
  const rawSignatures = body.signatures;
  if (!Array.isArray(rawSignatures)) {
    return res.status(400).json({ error: 'invalid_signatures' });
  }

  const signatures = Array.from(
    new Set(
      rawSignatures
        .filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= MAX_ROW_SIG_LEN)
        .slice(0, MAX_SIGS_PER_REQUEST),
    ),
  );

  if (signatures.length === 0) {
    return res.status(200).json({});
  }

  const result: LookupResult = {};

  try {
    // Run grouped count + freeform fetch in parallel.
    const [presetRes, freeformRes] = await Promise.all([
      supabase
        .from('card_stamps')
        .select('row_signature, target_card_name, stamp_id')
        .in('row_signature', signatures)
        .neq('stamp_id', 'freeform'),
      supabase
        .from('card_stamps')
        .select('id, row_signature, target_card_name, message_text, created_at')
        .in('row_signature', signatures)
        .eq('stamp_id', 'freeform')
        .order('created_at', { ascending: false })
        .limit(FREEFORM_PER_BUCKET_CAP * signatures.length * 4),
    ]);

    if (!presetRes.error && Array.isArray(presetRes.data)) {
      // Manual group-by since supabase-js can't do count(*) group-by without RPC.
      for (const row of presetRes.data as Array<{
        row_signature: string;
        target_card_name: string;
        stamp_id: string;
      }>) {
        const entry = ensureCardEntry(result, row.row_signature, row.target_card_name);
        entry.stampCounts[row.stamp_id] = (entry.stampCounts[row.stamp_id] ?? 0) + 1;
      }
    }

    if (!freeformRes.error && Array.isArray(freeformRes.data)) {
      for (const row of freeformRes.data as Array<{
        id: string;
        row_signature: string;
        target_card_name: string;
        message_text: string | null;
        created_at: string;
      }>) {
        if (!row.message_text) continue;
        const entry = ensureCardEntry(result, row.row_signature, row.target_card_name);
        if (entry.freeform.length >= FREEFORM_PER_BUCKET_CAP) continue;
        entry.freeform.push({
          id: row.id,
          message: row.message_text,
          createdAt: row.created_at,
        });
      }
    }
  } catch {
    // On any unexpected failure, return whatever partial result we have. The
    // client treats an empty result as "no stamps" and degrades gracefully.
  }

  return res.status(200).json(result);
}
