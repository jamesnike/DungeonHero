/**
 * useCardStamps — pure UI hook for the card-stamp social feature.
 *
 * No game state mutation. No reducer dispatch. Lives entirely outside the
 * `game-core/` architecture (per `.cursor/rules/game-core-architecture.mdc`):
 *
 * - Subscribes to `activeCards` / `previewCards` for "is the card currently
 *   visible" checks (bubble visibility).
 * - Listens to `waterfall:completed` to refresh the row "snapshot" (the cards
 *   that waterfall last placed in each row, even if some get killed mid-turn).
 * - Persists snapshots to `localStorage` so signatures survive a page refresh.
 * - Debounces and caches `lookupStamps` calls; skips them entirely when offline.
 * - Exposes `submitStamp` (optimistic) and `pickerState` for the UI components.
 *
 * Failure mode: every network call is `try/catch`'d at the boundary; nothing
 * here can throw into the React render path. Game functionality is preserved
 * verbatim regardless of the network state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import { useGameEngine, useGameEvent, useShallowGameState } from './useGameEngine';
import {
  canonicalRowSignature,
  lookupStamps,
  postStamp,
  type CardStampEntry,
  type FreeformEntry,
  type LookupResult,
  type PresetStampId,
  type RowSourceId,
  type StampId,
  PRESET_STAMP_IDS,
} from '@/lib/cardStamps';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAPSHOT_STORAGE_KEY = 'dh_card_stamp_row_snapshots';
const LOOKUP_DEBOUNCE_MS = 250;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const COLUMN_COUNT = 4;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PickerState {
  open: boolean;
  /** The card the user right-clicked / long-pressed. */
  card: GameCardData;
  /** Which row (active / preview) the card came from. */
  sourceRow: RowSourceId;
  /** Anchor element (the card cell) for the picker popover. */
  anchorEl: Element;
}

export interface UseCardStampsResult {
  isOnline: boolean;
  /**
   * Returns the stamp data for `card` if it is currently visible in
   * `sourceRow`, its name appears in that row's snapshot signature, AND
   * the float-out animation hasn't already played for this
   * `(rowSignature, cardName)` pair this session. Returns `null` otherwise
   * — including after `markAnimated` has been called for the same key.
   *
   * `rowSignature` is included in the result so the consumer can call
   * `markAnimated` without having to re-derive it.
   */
  getPendingFloat: (
    card: GameCardData,
    sourceRow: RowSourceId,
  ) => { entry: CardStampEntry; rowSignature: string } | null;
  /**
   * Marks the float-out animation as completed for `(rowSignature, cardName)`.
   * After this call, `getPendingFloat` will return `null` for that key for
   * the rest of the session (or until `game:started` resets the set).
   */
  markAnimated: (rowSignature: string, cardName: string) => void;
  /**
   * Submits a stamp. No-op when offline. For freeform messages, validates
   * length client-side before firing the network call.
   */
  submitStamp: (
    card: GameCardData,
    sourceRow: RowSourceId,
    stampId: StampId,
    messageText?: string,
  ) => void;
  pickerState: PickerState | null;
  openPicker: (card: GameCardData, sourceRow: RowSourceId, anchorEl: Element) => void;
  closePicker: () => void;
}

// ---------------------------------------------------------------------------
// Storage helpers (snapshot persistence)
// ---------------------------------------------------------------------------

interface StoredSnapshots {
  active: ReadonlyArray<{ id: string; name: string } | null>;
  preview: ReadonlyArray<{ id: string; name: string } | null>;
}

function snapshotToMinimalForm(slots: ReadonlyArray<GameCardData | null>): StoredSnapshots['active'] {
  return slots.map(card => (card ? { id: card.id, name: card.name } : null));
}

function readStoredSnapshots(): StoredSnapshots | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSnapshots>;
    if (!parsed || !Array.isArray(parsed.active) || !Array.isArray(parsed.preview)) {
      return null;
    }
    return {
      active: parsed.active.slice(0, COLUMN_COUNT) as StoredSnapshots['active'],
      preview: parsed.preview.slice(0, COLUMN_COUNT) as StoredSnapshots['preview'],
    };
  } catch {
    return null;
  }
}

function writeStoredSnapshots(snapshots: StoredSnapshots): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // ignore — storage quota / private mode etc. We just lose persistence.
  }
}

function clearStoredSnapshots(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Pad/truncate to exactly COLUMN_COUNT slots so signatures always have 4 tokens.
 */
function padToColumnCount(
  slots: ReadonlyArray<GameCardData | null>,
): Array<GameCardData | null> {
  const out: Array<GameCardData | null> = slots.slice(0, COLUMN_COUNT) as Array<GameCardData | null>;
  while (out.length < COLUMN_COUNT) out.push(null);
  return out;
}

/**
 * Reconstruct a snapshot of `Array<GameCardData | null>` from minimal stored form.
 *
 * The bubble visibility check uses `card.name`, so we don't need to recover
 * runtime fields like `attack` / `currentHp` — only `id` and `name` are
 * required for the signature. Use a synthetic minimal `GameCardData` shape;
 * downstream consumers only read `.name` from snapshot entries.
 */
function rehydrateSnapshot(stored: StoredSnapshots['active']): Array<GameCardData | null> {
  return padToColumnCount(
    stored.map(entry =>
      entry ? ({ id: entry.id, name: entry.name } as unknown as GameCardData) : null,
    ),
  );
}

// ---------------------------------------------------------------------------
// Cache types
// ---------------------------------------------------------------------------

interface CacheEntry {
  fetchedAt: number;
  /** Map keyed by card name. */
  byCardName: Record<string, CardStampEntry>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCardStamps(): UseCardStampsResult {
  const engine = useGameEngine();

  // ---- live state (used only for "is the card visible right now" check) ----
  const { activeCards, previewCards, gameMode } = useShallowGameState(state => ({
    activeCards: state.activeCards,
    previewCards: state.previewCards,
    gameMode: state.gameMode,
  }));

  // ---- snapshot refs (the row "original deal", used for signature) ----

  // Initialize lazily from localStorage; otherwise fall back to current rows.
  const initialActiveSnapshot = useMemo<Array<GameCardData | null>>(() => {
    const stored = readStoredSnapshots();
    if (stored) return rehydrateSnapshot(stored.active);
    return padToColumnCount(engine.getSnapshot().activeCards);
  }, [engine]);

  const initialPreviewSnapshot = useMemo<Array<GameCardData | null>>(() => {
    const stored = readStoredSnapshots();
    if (stored) return rehydrateSnapshot(stored.preview);
    return padToColumnCount(engine.getSnapshot().previewCards);
  }, [engine]);

  const activeSnapshotRef = useRef<Array<GameCardData | null>>(initialActiveSnapshot);
  const previewSnapshotRef = useRef<Array<GameCardData | null>>(initialPreviewSnapshot);

  // Force re-render when snapshots change (waterfall:completed fires).
  const [snapshotVersion, setSnapshotVersion] = useState(0);

  const persistSnapshots = useCallback(() => {
    writeStoredSnapshots({
      active: snapshotToMinimalForm(activeSnapshotRef.current),
      preview: snapshotToMinimalForm(previewSnapshotRef.current),
    });
  }, []);

  // On waterfall:completed, snapshot the current rows. Kills mid-turn DO NOT
  // update the snapshot — that's the whole point: the signature stays stable
  // across the deal so other players' identical deals match.
  useGameEvent('waterfall:completed', () => {
    const snap = engine.getSnapshot();
    activeSnapshotRef.current = padToColumnCount(snap.activeCards);
    previewSnapshotRef.current = padToColumnCount(snap.previewCards);
    persistSnapshots();
    setSnapshotVersion(v => v + 1);
  });

  // On new game (from main menu), wipe snapshots so old run's signatures
  // don't leak into the fresh deck.
  useGameEvent('game:started', () => {
    activeSnapshotRef.current = padToColumnCount(engine.getSnapshot().activeCards);
    previewSnapshotRef.current = padToColumnCount(engine.getSnapshot().previewCards);
    clearStoredSnapshots();
    persistSnapshots();
    setSnapshotVersion(v => v + 1);
    // Clear cache: the new game's row signatures are unrelated.
    cacheRef.current.clear();
    pendingFetchSignaturesRef.current.clear();
    // Reset float-out memory so a deterministic seed (= same first row)
    // animates fresh in the new game.
    animatedKeysRef.current = new Set();
  });

  // Derive signatures from the snapshots.
  const { activeSignature, previewSignature } = useMemo(() => {
    return {
      activeSignature: canonicalRowSignature(activeSnapshotRef.current),
      previewSignature: canonicalRowSignature(previewSnapshotRef.current),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotVersion]);

  // ---- online state ----

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      setIsOnline(true);
      // Invalidate current signatures so we re-fetch fresh data.
      cacheRef.current.delete(activeSignature);
      cacheRef.current.delete(previewSignature);
      // Re-trigger fetch on next render.
      setRefreshTick(t => t + 1);
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [activeSignature, previewSignature]);

  // ---- cache + fetch ----

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const pendingFetchSignaturesRef = useRef<Set<string>>(new Set());
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bumped to force re-render after a fetch resolves or cache mutation.
  const [refreshTick, setRefreshTick] = useState(0);

  const scheduleLookup = useCallback(() => {
    if (!isOnline) return;
    if (fetchTimerRef.current !== null) return;
    fetchTimerRef.current = setTimeout(() => {
      fetchTimerRef.current = null;
      const sigs = Array.from(pendingFetchSignaturesRef.current);
      pendingFetchSignaturesRef.current.clear();
      if (sigs.length === 0) return;

      void (async () => {
        let result: LookupResult = {};
        try {
          result = await lookupStamps(sigs);
        } catch {
          // lookupStamps already swallows; defensive.
          result = {};
        }
        const fetchedAt = Date.now();
        for (const sig of sigs) {
          const byCardName = result[sig] ?? {};
          // Normalize: ensure freeform is an array; ensure stampCounts is plain object.
          const normalized: Record<string, CardStampEntry> = {};
          for (const [cardName, entry] of Object.entries(byCardName)) {
            normalized[cardName] = {
              stampCounts: entry?.stampCounts ?? {},
              freeform: Array.isArray(entry?.freeform) ? entry.freeform : [],
            };
          }
          cacheRef.current.set(sig, { fetchedAt, byCardName: normalized });
        }
        setRefreshTick(t => t + 1);
      })();
    }, LOOKUP_DEBOUNCE_MS);
  }, [isOnline]);

  // Whenever signatures change (or we go online), enqueue any signatures
  // that aren't in cache (or whose cache entry is stale) for fetching.
  useEffect(() => {
    if (!isOnline) return;

    const now = Date.now();
    const sigs = [activeSignature, previewSignature].filter(Boolean);
    let scheduled = false;

    for (const sig of sigs) {
      const entry = cacheRef.current.get(sig);
      if (!entry || now - entry.fetchedAt > CACHE_TTL_MS) {
        pendingFetchSignaturesRef.current.add(sig);
        scheduled = true;
      }
    }

    if (scheduled) {
      scheduleLookup();
    }
  }, [isOnline, activeSignature, previewSignature, scheduleLookup, refreshTick]);

  // ---- float-out animation memory ----

  // Tracks `(rowSignature, cardName)` keys whose float-out animation has
  // already played in this session. Reset on `game:started`. Read by
  // `getPendingFloat` to gate the floater UI.
  const animatedKeysRef = useRef<Set<string>>(new Set());

  // ---- "is this card visible in this row" lookup ----

  const visibleCardIdsByRow = useMemo(() => {
    const active = new Set<string>();
    const preview = new Set<string>();
    for (const c of activeCards) {
      if (c) active.add(c.id);
    }
    for (const c of previewCards) {
      if (c) preview.add(c.id);
    }
    return { active, preview };
  }, [activeCards, previewCards]);

  const snapshotNamesByRow = useMemo(() => {
    const active = new Set<string>();
    const preview = new Set<string>();
    for (const c of activeSnapshotRef.current) {
      if (c) active.add(c.name);
    }
    for (const c of previewSnapshotRef.current) {
      if (c) preview.add(c.name);
    }
    return { active, preview };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotVersion]);

  const getPendingFloat = useCallback(
    (
      card: GameCardData,
      sourceRow: RowSourceId,
    ): { entry: CardStampEntry; rowSignature: string } | null => {
      // (1) Card must be currently visible in the row (kills hide the float).
      const visibleSet = sourceRow === 'active'
        ? visibleCardIdsByRow.active
        : visibleCardIdsByRow.preview;
      if (!visibleSet.has(card.id)) return null;

      // (2) Card name must appear in the row's snapshot.
      const snapshotNames = sourceRow === 'active'
        ? snapshotNamesByRow.active
        : snapshotNamesByRow.preview;
      if (!snapshotNames.has(card.name)) return null;

      // (3) Look up cached stamps.
      const sig = sourceRow === 'active' ? activeSignature : previewSignature;
      const cacheEntry = cacheRef.current.get(sig);
      if (!cacheEntry) return null;
      const entry = cacheEntry.byCardName[card.name];
      if (!entry) return null;
      const hasPreset = Object.keys(entry.stampCounts).length > 0;
      const hasFreeform = entry.freeform.length > 0;
      if (!hasPreset && !hasFreeform) return null;

      // (4) "once on appear" gate: if we've already animated this key in
      //     this session, don't return data — the cell will render nothing.
      if (animatedKeysRef.current.has(`${sig}::${card.name}`)) return null;

      return { entry, rowSignature: sig };
    },
    [
      visibleCardIdsByRow,
      snapshotNamesByRow,
      activeSignature,
      previewSignature,
      // refreshTick triggers re-renders when cache mutates OR when
      // markAnimated bumps the tick; not part of the closure but keeps the
      // function ref logically up-to-date.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      refreshTick,
    ],
  );

  const markAnimated = useCallback((rowSignature: string, cardName: string) => {
    const key = `${rowSignature}::${cardName}`;
    if (animatedKeysRef.current.has(key)) return;
    animatedKeysRef.current.add(key);
    setRefreshTick(t => t + 1);
  }, []);

  // ---- submit ----

  const submitStamp = useCallback<UseCardStampsResult['submitStamp']>(
    (card, sourceRow, stampId, messageText) => {
      if (!isOnline) return;

      const sig = sourceRow === 'active' ? activeSignature : previewSignature;
      if (!sig) return;

      // Optimistic cache update.
      const existing = cacheRef.current.get(sig);
      const fetchedAt = existing?.fetchedAt ?? Date.now();
      const byCardName: Record<string, CardStampEntry> = {
        ...(existing?.byCardName ?? {}),
      };
      const cardEntry: CardStampEntry = {
        stampCounts: { ...(byCardName[card.name]?.stampCounts ?? {}) },
        freeform: [...(byCardName[card.name]?.freeform ?? [])],
      };

      if (stampId === 'freeform') {
        const trimmed = (messageText ?? '').trim();
        if (trimmed.length === 0) return;
        // Hard cap before any optimistic UI: matches server behavior.
        if (trimmed.length > 80) return;
        const tempEntry: FreeformEntry = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          message: trimmed,
          createdAt: new Date().toISOString(),
        };
        cardEntry.freeform = [tempEntry, ...cardEntry.freeform].slice(0, 20);
      } else {
        const presetId = stampId as PresetStampId;
        // Server-side dedupe: if this client already stamped this preset on
        // this row+card, the upsert is a no-op. Optimistically only bump
        // count for new presets — but we have no per-client tracking
        // locally, so accept that the count may drift by 1 until next fetch.
        cardEntry.stampCounts = {
          ...cardEntry.stampCounts,
          [presetId]: (cardEntry.stampCounts[presetId] ?? 0) + 1,
        };
      }

      byCardName[card.name] = cardEntry;
      cacheRef.current.set(sig, { fetchedAt, byCardName });
      setRefreshTick(t => t + 1);

      // Fire the network call (fire-and-forget; postStamp swallows errors).
      postStamp({
        gameMode,
        targetCardName: card.name,
        rowSignature: sig,
        sourceRow,
        stampId,
        messageText: stampId === 'freeform' ? messageText : undefined,
      });
    },
    [isOnline, activeSignature, previewSignature, gameMode],
  );

  // ---- picker state ----

  const [pickerState, setPickerState] = useState<PickerState | null>(null);

  const openPicker = useCallback(
    (card: GameCardData, sourceRow: RowSourceId, anchorEl: Element) => {
      setPickerState({ open: true, card, sourceRow, anchorEl });
    },
    [],
  );

  const closePicker = useCallback(() => {
    setPickerState(null);
  }, []);

  // Cleanup pending timer on unmount.
  useEffect(() => {
    return () => {
      if (fetchTimerRef.current !== null) {
        clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = null;
      }
    };
  }, []);

  return {
    isOnline,
    getPendingFloat,
    markAnimated,
    submitStamp,
    pickerState,
    openPicker,
    closePicker,
  };
}

/** Re-exported so tests / consumers can pin the slot tuple type. */
export type RowSnapshotSlots = ActiveRowSlots;
// Touch the import so type-only re-export survives erasure.
void PRESET_STAMP_IDS;
