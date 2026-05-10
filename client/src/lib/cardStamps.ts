/**
 * Card stamp social feature — shared types, config, and network primitives.
 *
 * The hook (`useCardStamps`) and UI components (`CardStampPicker` /
 * `CardStampBubble`) consume these. This module is pure (no React) and
 * never throws into render paths — `postStamp` is fire-and-forget,
 * `lookupStamps` returns an empty result on failure.
 *
 * See `.cursor/plans/card_stamp_social_feature_*.plan.md` for the full design.
 */

import type { GameCardData } from '@/components/GameCard';
import { getOrCreateClientId } from './clientId';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresetStampId = 'recommend' | 'deadly' | 'safe' | 'strong' | 'died' | 'howto';
export type StampId = PresetStampId | 'freeform';

export interface PresetStampDefinition {
  id: PresetStampId;
  emoji: string;
  /** i18n key under `cardStamps.presets.<id>`. */
  i18nKey: string;
  /** Default Chinese label, used as i18n fallback. */
  labelZh: string;
}

export interface FreeformEntry {
  id: string;
  message: string;
  createdAt: string;
}

export interface CardStampEntry {
  /** Counts keyed by `PresetStampId`. Missing entries = 0. */
  stampCounts: Partial<Record<PresetStampId, number>>;
  /** Up to 20 latest freeform messages, server-sorted desc by createdAt. */
  freeform: FreeformEntry[];
}

/** `{ [signature]: { [cardName]: CardStampEntry } }` */
export type LookupResult = Record<string, Record<string, CardStampEntry>>;

export type RowSourceId = 'active' | 'preview';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * 6 preset stamps shown as emoji buttons in the picker. Edit this list to
 * change what players can leave; the server enforces the same enum so the
 * SQL `check (stamp_id in ...)` constraint must be migrated in lockstep.
 */
export const STAMP_DEFINITIONS: ReadonlyArray<PresetStampDefinition> = [
  { id: 'recommend', emoji: '👍', i18nKey: 'cardStamps.presets.recommend', labelZh: '推荐' },
  { id: 'deadly',    emoji: '💀', i18nKey: 'cardStamps.presets.deadly',    labelZh: '危险' },
  { id: 'safe',      emoji: '🛡', i18nKey: 'cardStamps.presets.safe',      labelZh: '这个稳' },
  { id: 'strong',    emoji: '🔥', i18nKey: 'cardStamps.presets.strong',    labelZh: '强卡' },
  { id: 'died',      emoji: '😱', i18nKey: 'cardStamps.presets.died',      labelZh: '翻车了' },
  { id: 'howto',     emoji: '❓', i18nKey: 'cardStamps.presets.howto',     labelZh: '怎么打' },
] as const;

export const PRESET_STAMP_IDS: ReadonlyArray<PresetStampId> = STAMP_DEFINITIONS.map(s => s.id);

/** Mirrors the `length(message_text) <= 80` SQL constraint. */
export const MAX_FREEFORM_LEN = 80;

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

/**
 * Canonical signature for a row "snapshot" (the cards waterfall last placed
 * in this row, even if some have since been killed).
 *
 * - Each slot maps to `card?.name ?? ''` (empty string for null slots).
 * - The 4 tokens are sorted ASCII-ascending and joined with `'|'`.
 * - Multiset-preserving (duplicate names appear twice).
 *
 * Examples:
 *   [Dragon, Goblin, Skeleton, null] -> "Dragon|Goblin|Skeleton|"
 *                                          (the empty token sorts to the end
 *                                          because Chinese names sort > '')
 *   [Dragon, Dragon, null, null]     -> "Dragon|Dragon||"
 *   [null, null, null, null]         -> "|||"
 *
 * Stable across runs because `card.name` is the i18n display label which
 * doesn't depend on per-game runtime ids.
 */
export function canonicalRowSignature(snapshotSlots: ReadonlyArray<GameCardData | null>): string {
  return snapshotSlots
    .map(card => card?.name ?? '')
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join('|');
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface PostStampParams {
  gameMode: 'quick' | 'normal';
  targetCardName: string;
  rowSignature: string;
  sourceRow: RowSourceId;
  stampId: StampId;
  /** Required when `stampId === 'freeform'`, ignored otherwise. */
  messageText?: string;
}

/**
 * Fire-and-forget POST to `/api/card-stamps`. Never throws.
 *
 * For freeform: client-side bails early if `messageText` is empty or longer
 * than `MAX_FREEFORM_LEN` (after trim) so we don't waste a network round-trip
 * on inputs the server would reject.
 */
export function postStamp(params: PostStampParams): void {
  if (params.stampId === 'freeform') {
    const trimmed = (params.messageText ?? '').trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FREEFORM_LEN) {
      return;
    }
  }

  try {
    const body = JSON.stringify({
      clientId: getOrCreateClientId(),
      gameMode: params.gameMode,
      targetCardName: params.targetCardName,
      rowSignature: params.rowSignature,
      sourceRow: params.sourceRow,
      stampId: params.stampId,
      messageText:
        params.stampId === 'freeform' ? (params.messageText ?? '').trim() : undefined,
    });

    void fetch('/api/card-stamps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // swallow — telemetry-style fire-and-forget
  }
}

/**
 * POST `/api/card-stamps-lookup` to fetch aggregated counts + freeform
 * messages for the given signatures.
 *
 * Returns an empty `{}` on any error (network / parse / server) so the caller
 * can treat absence as "no stamps known yet" rather than crashing.
 */
export async function lookupStamps(signatures: ReadonlyArray<string>): Promise<LookupResult> {
  const unique = Array.from(new Set(signatures.filter(s => s.length > 0)));
  if (unique.length === 0) return {};

  try {
    const response = await fetch('/api/card-stamps-lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signatures: unique }),
    });
    if (!response.ok) return {};
    const data = (await response.json()) as unknown;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as LookupResult;
    }
    return {};
  } catch {
    return {};
  }
}
