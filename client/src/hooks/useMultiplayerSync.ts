/**
 * useMultiplayerSync — multiplayer transport + connection state machine.
 *
 * Two transport paths:
 *
 *   1. **Local-test** (peerId starts with "local-" or roomId === "local-test"):
 *      BroadcastChannel keyed by roomId. Same-browser two-tab dev mode.
 *      No server, no auth, no retry, no connection state — always
 *      reports `connected`.
 *
 *   2. **Supabase Realtime** (production): WebSocket subscription on
 *      `transfers` filtered to `to_player=<myRole>`. Outbound goes via
 *      POST `/api/mp/transfer`. Resume backfill via POST `/api/mp/resume`.
 *
 * Outbound state machine (Supabase only):
 *
 *   Trigger sources:
 *     • Fresh waterfall → reducer sets `pendingTransferOut` + emits
 *       `multiplayer:transferOut` side effect.
 *     • Hydrate after refresh → restored `pendingTransferOut` from
 *       persistence (no side effect fires).
 *     • Manual retry from UI ("重试同步" button).
 *
 *   Algorithm: useEffect watches (pendingTransferOut, pendingDelta).
 *   Whenever the staged batch changes (fresh waterfall) OR is non-empty
 *   on mount (hydrate replay), kick off `doPostWithRetry`.
 *
 *   Retry: 3 attempts with backoff [500ms, 2s, 8s]. Each attempt updates
 *   the connection phase to `syncing`. After all attempts fail → phase
 *   becomes `sync_failed`; the cards stay in `pendingTransferOut` so a
 *   manual retry or page refresh can try again.
 *
 *   Success: dispatch `MULTIPLAYER_CLEAR_PENDING_TRANSFER` (clears both
 *   the cards and the companion delta), phase returns to `connected`.
 *
 * Inbound:
 *   On (re)mount: backfill via `resumeRoom` BEFORE subscribing live.
 *   Realtime delivers `transfers` row INSERTs filtered to our role; we
 *   dispatch RECEIVE + SHRINK actions and best-effort ack.
 *
 * Connection phase:
 *   • `idle` — not in MP mode (single-player or not yet configured)
 *   • `connecting` — initial subscribe + resume backfill in progress
 *   • `connected` — Realtime subscribed AND no in-flight POST
 *   • `syncing` — POST in flight (or waiting for next retry)
 *   • `sync_failed` — exhausted retries; user must retry or refresh
 *   • `disconnected` — Realtime channel CHANNEL_ERROR/TIMED_OUT
 *                     OR navigator.onLine === false
 *
 *   GameBoard freezes the panel when phase ∈ {disconnected, sync_failed}.
 *
 * Sequence number conventions:
 *   • Wire-protocol seq: server-allocated, monotonic per (room, all
 *     participants combined). One row per transfer.
 *   • Reducer's `lastAppliedSeq` expects strictly-monotonic per-action
 *     seqs. Each wire-seq emits TWO actions (RECEIVE + SHRINK), so we
 *     use baseSeq=wireSeq*2 and baseSeq+1 to keep them ordered.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useGameEngine, useGameEvent, useShallowGameState } from './useGameEngine';
import type { GameAction } from '@/game-core/actions';
import type { GameCardData } from '@/components/GameCard';
import {
  ackTransfer,
  postTransfer,
  resumeRoom,
  MultiplayerApiError,
} from '@/lib/multiplayerApi';
import { ensureAnonymousSession, getSupabaseClient } from '@/lib/supabaseClient';

// ---------------------------------------------------------------------------
// Public API: connection state machine
// ---------------------------------------------------------------------------

export type MultiplayerConnectionPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'sync_failed'
  | 'disconnected';

export interface MultiplayerConnectionState {
  /** Current connection phase. */
  phase: MultiplayerConnectionPhase;
  /** How many POST attempts have been made for the current staged batch. */
  retryAttempt: number;
  /** Human-readable last error (used in toasts / overlay subtitle). */
  errorMessage: string | null;
  /** Force a retry attempt (resets attempt counter). UI button binds to this. */
  retryNow: () => void;
}

const IDLE_STATE: MultiplayerConnectionState = {
  phase: 'idle',
  retryAttempt: 0,
  errorMessage: null,
  retryNow: () => {},
};

// ---------------------------------------------------------------------------
// Wire formats
// ---------------------------------------------------------------------------

interface TransferOutMessage {
  kind: 'transferOut';
  fromRole: 'A' | 'B';
  seq: number;
  cards: GameCardData[];
  sharedConsumed: number;
}

type IncomingMessage = TransferOutMessage;

interface TransferRow {
  id: string;
  room_id: string;
  seq: number;
  from_player: 'A' | 'B';
  to_player: 'A' | 'B';
  cards: GameCardData[];
  shared_consumed: number;
  applied: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLocalTestSession(session: { peerId: string; roomId: string } | null): boolean {
  if (!session) return false;
  return (
    session.peerId.startsWith('local-') ||
    session.roomId === 'local-test'
  );
}

function broadcastChannelNameFor(roomId: string): string {
  return `dh-mp-${roomId}`;
}

/** ms backoff for retry attempt N (0-indexed). 500ms, 2s, 8s, then giveup. */
const RETRY_BACKOFF_MS = [500, 2000, 8000];

function applyTransferLocal(
  engine: ReturnType<typeof useGameEngine>,
  cards: GameCardData[],
  sharedConsumed: number,
  wireSeq: number,
): void {
  const baseSeq = wireSeq * 2;
  const actions: GameAction[] = [
    {
      type: 'MULTIPLAYER_RECEIVE_TRANSFER',
      cards,
      seq: baseSeq,
    },
    {
      type: 'MULTIPLAYER_SHARED_SHRINK',
      count: sharedConsumed,
      seq: baseSeq + 1,
    },
  ];
  for (const a of actions) engine.dispatch(a);
}

/**
 * Stable identity for a staged batch — used to dedup useEffect firings.
 * We need this because useEffect runs on every render where deps change,
 * and the same array ref might be replayed (e.g. hydrate restores the
 * same array, then resume backfill arrives, then a fresh waterfall ships
 * new cards — we don't want to double-POST the same batch).
 */
function batchKey(cards: GameCardData[] | null, delta: number | null): string | null {
  if (!cards || cards.length === 0) return null;
  return `${cards.length}|${delta ?? 0}|${cards.map(c => c.id).join(',')}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMultiplayerSync(): MultiplayerConnectionState {
  const engine = useGameEngine();
  const session = useShallowGameState(s => ({
    role: s.multiplayerSession?.role ?? null,
    roomId: s.multiplayerSession?.roomId ?? null,
    peerId: s.multiplayerSession?.peerId ?? null,
    lastAppliedSeq: s.multiplayerSession?.lastAppliedSeq ?? 0,
  }));

  // Watch the staged batch as a shallow-stable selector so the outbound
  // useEffect only re-fires when the batch actually changes (and not on
  // every unrelated state change).
  const stagedBatch = useShallowGameState(s => ({
    cards: s.pendingTransferOut,
    delta: s.pendingTransferOutSharedConsumed,
  }));

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  // Per-(room, sender) outbound seq counter for local-test mode only.
  const localOutboundSeqRef = useRef<number>(0);
  const localLastBroadcastSeqRef = useRef<number>(-1);

  // Track which incoming Supabase transfer rows we've already applied.
  const appliedRowIdsRef = useRef<Set<string>>(new Set());

  // ---- Connection state machine ----
  // Internal sub-states; we derive the public `phase` from these.
  const [realtimeStatus, setRealtimeStatus] = useState<
    'idle' | 'connecting' | 'subscribed' | 'errored'
  >('idle');
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [outboundStatus, setOutboundStatus] = useState<
    'idle' | 'syncing' | 'failed'
  >('idle');
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Bumping this triggers the outbound effect to re-attempt even if the
  // staged batch hasn't changed (used by retryNow).
  const [retryEpoch, setRetryEpoch] = useState<number>(0);

  // batch-key of the most recent batch we successfully POSTed (or are
  // currently POSTing). Stays in ref so the outbound useEffect can
  // dedup without contributing to React state churn.
  const inFlightBatchKeyRef = useRef<string | null>(null);

  // Cancel handle for any pending retry timer (so reset + cleanup work).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const roomId = session.roomId;
  const role = session.role;
  const isLocal = isLocalTestSession(session.roomId !== null && session.peerId !== null
    ? { roomId: session.roomId, peerId: session.peerId }
    : null);

  // ---- Browser online / offline listener ----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ---- Outbound: Local-test BroadcastChannel ----
  // Keep useGameEvent for local-test mode only — it's fire-and-forget,
  // no retry, no state machine. Supabase mode is driven by the
  // useEffect below (which handles both fresh + hydrate-replay paths).
  useGameEvent('multiplayer:transferOut', payload => {
    const sess = sessionRef.current;
    if (sess.roomId === null || sess.role === null || sess.peerId === null) return;
    if (!isLocalTestSession({ roomId: sess.roomId, peerId: sess.peerId })) return;

    const channel = broadcastChannelRef.current;
    if (channel === null) return;

    localOutboundSeqRef.current = Math.max(
      localOutboundSeqRef.current,
      payload.seq,
    );
    if (localLastBroadcastSeqRef.current === localOutboundSeqRef.current) return;
    localLastBroadcastSeqRef.current = localOutboundSeqRef.current;

    const msg: TransferOutMessage = {
      kind: 'transferOut',
      fromRole: sess.role,
      seq: localOutboundSeqRef.current,
      cards: payload.cards,
      sharedConsumed: payload.sharedConsumed,
    };

    try {
      channel.postMessage(msg);
    } catch (err) {
      console.error('[useMultiplayerSync] broadcast failed', err);
      return;
    }

    engine.dispatch({ type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' });
  });

  // ---- Outbound: Supabase POST with retry ----
  //
  // Fires for both fresh waterfalls (state changed reactively) and
  // hydrate-replay (state was restored from persistence with non-null
  // pendingTransferOut). Dedup by batch-key so we don't double-POST
  // the same cards if React re-renders for unrelated reasons.
  useEffect(() => {
    if (roomId === null || role === null) return;
    if (isLocal) return; // local-test mode handled by useGameEvent above
    if (!stagedBatch.cards || stagedBatch.cards.length === 0) return;

    const key = batchKey(stagedBatch.cards, stagedBatch.delta);
    if (key === null) return;

    // If the same batch is already in-flight (or just acked), don't
    // start another POST. Once `MULTIPLAYER_CLEAR_PENDING_TRANSFER` runs,
    // stagedBatch.cards becomes null and the useEffect won't re-enter.
    if (inFlightBatchKeyRef.current === key && retryEpoch === 0) return;

    let cancelled = false;
    inFlightBatchKeyRef.current = key;
    cancelPendingRetry();

    const cardsSnapshot = stagedBatch.cards;
    const deltaSnapshot = stagedBatch.delta ?? 0;

    const attemptPost = async (attempt: number): Promise<void> => {
      if (cancelled) return;

      setOutboundStatus('syncing');
      setRetryAttempt(attempt);

      try {
        await postTransfer({
          roomId,
          fromRole: role,
          cards: cardsSnapshot,
          sharedConsumed: deltaSnapshot,
        });
        if (cancelled) return;

        // Success: clear staged batch, reset state machine.
        engine.dispatch({ type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' });
        setOutboundStatus('idle');
        setRetryAttempt(0);
        setErrorMessage(null);
        // inFlightBatchKeyRef stays set — next useEffect run sees
        // stagedBatch.cards === null and bails before the dedup check.
      } catch (err) {
        if (cancelled) return;

        const message =
          err instanceof MultiplayerApiError
            ? `${err.status} ${err.code}`
            : err instanceof Error
              ? err.message
              : 'unknown error';

        if (attempt + 1 >= RETRY_BACKOFF_MS.length) {
          // Exhausted retries: park in sync_failed; user must retryNow
          // (or refresh, which also triggers replay via persistence).
          console.error(
            `[useMultiplayerSync] /api/mp/transfer failed after ${attempt + 1} attempts: ${message}`,
          );
          setOutboundStatus('failed');
          setErrorMessage(message);
          // KEEP inFlightBatchKeyRef so the next stagedBatch change
          // (or a manual retryNow) is the only way to retry.
        } else {
          console.warn(
            `[useMultiplayerSync] /api/mp/transfer attempt ${attempt + 1} failed (${message}); retrying in ${RETRY_BACKOFF_MS[attempt + 1]}ms`,
          );
          setErrorMessage(message);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void attemptPost(attempt + 1);
          }, RETRY_BACKOFF_MS[attempt + 1]);
        }
      }
    };

    void attemptPost(0);

    return () => {
      cancelled = true;
      cancelPendingRetry();
    };
  }, [
    engine,
    roomId,
    role,
    isLocal,
    stagedBatch.cards,
    stagedBatch.delta,
    retryEpoch,
    cancelPendingRetry,
  ]);

  // ---- Manual retry exposed to UI ----
  const retryNow = useCallback(() => {
    cancelPendingRetry();
    inFlightBatchKeyRef.current = null;
    setOutboundStatus('idle');
    setRetryAttempt(0);
    setErrorMessage(null);
    setRetryEpoch(e => e + 1);
  }, [cancelPendingRetry]);

  // ---- Inbound: subscribe + resume backfill ----
  useEffect(() => {
    if (roomId === null || role === null) {
      // Tear down everything.
      if (broadcastChannelRef.current !== null) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      if (realtimeChannelRef.current !== null) {
        const supa = getSupabaseClient();
        if (supa) supa.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      appliedRowIdsRef.current.clear();
      setRealtimeStatus('idle');
      return;
    }

    if (isLocal) {
      // -------- Local-test BroadcastChannel path --------
      if (typeof BroadcastChannel === 'undefined') {
        console.warn(
          '[useMultiplayerSync] BroadcastChannel unavailable; local 2P sync disabled.',
        );
        setRealtimeStatus('errored');
        return;
      }
      const channel = new BroadcastChannel(broadcastChannelNameFor(roomId));
      broadcastChannelRef.current = channel;
      // Local mode: always treat as "subscribed" (no real network).
      setRealtimeStatus('subscribed');

      const onMessage = (ev: MessageEvent<IncomingMessage>) => {
        const msg = ev.data;
        if (!msg || msg.kind !== 'transferOut') return;
        if (msg.fromRole === role) return;
        applyTransferLocal(engine, msg.cards, msg.sharedConsumed, msg.seq);
      };

      channel.addEventListener('message', onMessage);
      return () => {
        channel.removeEventListener('message', onMessage);
        channel.close();
        if (broadcastChannelRef.current === channel) {
          broadcastChannelRef.current = null;
        }
        setRealtimeStatus('idle');
      };
    }

    // -------- Supabase Realtime path --------
    const supa = getSupabaseClient();
    if (!supa) {
      console.warn(
        '[useMultiplayerSync] Supabase env missing; multiplayer sync disabled.',
      );
      setRealtimeStatus('errored');
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    setRealtimeStatus('connecting');

    void (async () => {
      const sess = await ensureAnonymousSession();
      if (cancelled) return;
      if (!sess) {
        console.error(
          '[useMultiplayerSync] anonymous auth failed; cannot subscribe to Realtime',
        );
        setRealtimeStatus('errored');
        return;
      }

      // Resume backfill BEFORE subscribing live so a stale row doesn't
      // overwrite a fresh INSERT.
      const sessionAtMount = sessionRef.current;
      if (sessionAtMount.roomId !== null) {
        try {
          const res = await resumeRoom({
            roomId,
            lastAppliedSeq: sessionAtMount.lastAppliedSeq ?? 0,
          });
          if (cancelled) return;
          for (const row of res.transfers) {
            if (appliedRowIdsRef.current.has(row.id)) continue;
            appliedRowIdsRef.current.add(row.id);
            applyTransferLocal(
              engine,
              Array.isArray(row.cards) ? row.cards : [],
              typeof row.sharedConsumed === 'number' ? row.sharedConsumed : 0,
              row.seq,
            );
            void ackTransfer({ transferId: row.id }).catch(() => {});
          }
        } catch (err) {
          if (err instanceof MultiplayerApiError) {
            console.warn(
              `[useMultiplayerSync] resume failed: ${err.status} ${err.code}`,
            );
          } else {
            console.warn('[useMultiplayerSync] resume failed', err);
          }
          // Resume failure is non-fatal for live forward progress; we
          // still subscribe below. The phase stays in 'connecting' until
          // the subscribe callback fires.
        }
      }

      channel = supa
        .channel(`mp:room:${roomId}:to:${role}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'transfers',
            filter: `room_id=eq.${roomId}`,
          },
          payload => {
            const row = payload.new as TransferRow | undefined;
            if (!row) return;
            if (row.to_player !== role) return;
            if (appliedRowIdsRef.current.has(row.id)) return;

            appliedRowIdsRef.current.add(row.id);
            applyTransferLocal(
              engine,
              Array.isArray(row.cards) ? row.cards : [],
              typeof row.shared_consumed === 'number' ? row.shared_consumed : 0,
              row.seq,
            );

            void ackTransfer({ transferId: row.id }).catch((err: unknown) => {
              if (err instanceof MultiplayerApiError) {
                console.warn(
                  `[useMultiplayerSync] ack-transfer failed: ${err.status} ${err.code}`,
                );
              } else {
                console.warn('[useMultiplayerSync] ack-transfer failed', err);
              }
            });
          },
        )
        .subscribe(status => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            setRealtimeStatus('subscribed');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error(`[useMultiplayerSync] Realtime channel ${status}`);
            setRealtimeStatus('errored');
            // supabase-js auto-retries, but we surface the gap to the user.
            // When the underlying socket reconnects, the subscribe callback
            // fires again with 'SUBSCRIBED' and we flip back.
          }
        });

      realtimeChannelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supa.removeChannel(channel);
      }
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null;
      }
      appliedRowIdsRef.current.clear();
      setRealtimeStatus('idle');
    };
  }, [engine, roomId, role, isLocal]);

  // ---- Cleanup retry timer on unmount ----
  useEffect(() => {
    return () => {
      cancelPendingRetry();
    };
  }, [cancelPendingRetry]);

  // ---- Derive public phase ----
  // Priority order matters:
  //   1. No session → idle (don't render UI)
  //   2. Browser is offline → disconnected (overrides everything)
  //   3. Realtime errored → disconnected
  //   4. Outbound exhausted retries → sync_failed (manual retry needed)
  //   5. Outbound in flight → syncing (transient, ~ms to a few seconds)
  //   6. Realtime not yet subscribed → connecting
  //   7. Otherwise → connected
  const phase: MultiplayerConnectionPhase = useMemo(() => {
    if (roomId === null || role === null) return 'idle';
    if (!browserOnline) return 'disconnected';
    if (realtimeStatus === 'errored') return 'disconnected';
    if (outboundStatus === 'failed') return 'sync_failed';
    if (outboundStatus === 'syncing') return 'syncing';
    if (realtimeStatus !== 'subscribed') return 'connecting';
    return 'connected';
  }, [roomId, role, browserOnline, realtimeStatus, outboundStatus]);

  if (roomId === null || role === null) return IDLE_STATE;

  return {
    phase,
    retryAttempt,
    errorMessage,
    retryNow,
  };
}
