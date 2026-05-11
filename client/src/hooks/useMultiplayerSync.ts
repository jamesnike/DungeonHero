/**
 * useMultiplayerSync — phase 4 transport: Supabase Realtime (with a
 * BroadcastChannel fallback for the dev-only "local-test" room).
 *
 * Design (per `.cursor/plans/2-player_multiplayer_mode_*.plan.md`):
 *
 *   1. Subscribe to the engine's `multiplayer:transferOut` side effect.
 *      When emitted:
 *        - For local-test rooms (peerId starts with "local-"): broadcast
 *          the payload over a same-browser BroadcastChannel keyed by
 *          roomId. Phase 3 dev path; no server, no auth.
 *        - For Supabase rooms: POST `/api/mp/transfer` with the cards
 *          and shared-consumed count. The server allocates the seq and
 *          inserts a `transfers` row, which Realtime delivers to the
 *          peer's subscribed channel.
 *
 *   2. Listen for incoming events:
 *        - Local-test: BroadcastChannel `message` listener.
 *        - Supabase: `postgres_changes` INSERT subscription on the
 *          `transfers` table, filtered to `to_player=eq.<myRole>`.
 *      In both cases, dispatch:
 *        - MULTIPLAYER_RECEIVE_TRANSFER (peer pushed cards onto our deck)
 *        - MULTIPLAYER_SHARED_SHRINK (mirror peer's shared-pool consume)
 *      Then, for Supabase only, POST `/api/mp/ack-transfer` so the row's
 *      `applied=true` for resume bookkeeping.
 *
 *   3. Sequence number conventions:
 *        - The wire-protocol seq is server-allocated and monotonic per
 *          (room, ALL participants combined). Each transfer row gets a
 *          unique seq.
 *        - The reducer's `lastAppliedSeq` guard expects strictly-monotonic
 *          per-action seqs. Each wire-seq emits TWO actions
 *          (RECEIVE + SHRINK), so we use baseSeq=wireSeq*2 and
 *          baseSeq+1 to keep them ordered.
 *        - The server seq starts at 1 and only increments for INSERTs,
 *          so wire-seq * 2 is guaranteed to be greater than the previous
 *          wire-seq * 2 + 1 → reducer guard holds.
 *
 * Resume / dedup (phase 6 will extend this):
 *   - On (re)mount we bump our local outbound seq counter from
 *     session.lastAppliedSeq, so a tab restart doesn't replay old
 *     transfers as new.
 *   - The reducer drops any incoming action whose seq <= lastAppliedSeq.
 */

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useGameEngine, useGameEvent, useGameState } from './useGameEngine';
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
// Wire format (BroadcastChannel local mode)
// ---------------------------------------------------------------------------

interface TransferOutMessage {
  kind: 'transferOut';
  fromRole: 'A' | 'B';
  seq: number;
  cards: GameCardData[];
  sharedConsumed: number;
}

type IncomingMessage = TransferOutMessage;

// ---------------------------------------------------------------------------
// Wire format (Supabase `transfers` row INSERT)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMultiplayerSync(): void {
  const engine = useGameEngine();
  const session = useGameState(s => s.multiplayerSession);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  // Per-(room, sender) outbound seq counter for local-test mode. For
  // Supabase mode the server allocates seq, so we don't use this.
  const localOutboundSeqRef = useRef<number>(0);
  const localLastBroadcastSeqRef = useRef<number>(-1);

  // Track which incoming Supabase transfer rows we've already applied
  // (deduped by row id). Realtime guarantees at-least-once delivery in
  // theory; in practice we also catch dupes via the reducer's
  // lastAppliedSeq guard, but a per-row set saves redundant ack POSTs.
  const appliedRowIdsRef = useRef<Set<string>>(new Set());

  const roomId = session?.roomId ?? null;
  const role = session?.role ?? null;
  const isLocal = isLocalTestSession(session);

  // ---- Outbound: engine's transferOut → wire ----
  useGameEvent('multiplayer:transferOut', payload => {
    const sess = sessionRef.current;
    if (sess === null) return;

    if (isLocalTestSession(sess)) {
      // BroadcastChannel path.
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

      // Local mode is fire-and-forget; clear pending immediately.
      engine.dispatch({ type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' });
      return;
    }

    // Supabase path: POST to server. Server assigns seq.
    void postTransfer({
      roomId: sess.roomId,
      fromRole: sess.role,
      cards: payload.cards,
      sharedConsumed: payload.sharedConsumed,
    })
      .then(() => {
        // Server accepted and persisted. Clear the pending stage so the
        // next waterfall doesn't re-ship the same cards.
        engine.dispatch({ type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' });
      })
      .catch((err: unknown) => {
        // Non-2xx or network error. We DO NOT clear pending — phase 6
        // will add a resend/retry path. For now, log loudly so the dev
        // sees it. The cards stay staged in pendingTransferOut.
        if (err instanceof MultiplayerApiError) {
          console.error(
            `[useMultiplayerSync] /api/mp/transfer failed: ${err.status} ${err.code}`,
          );
        } else {
          console.error('[useMultiplayerSync] /api/mp/transfer failed', err);
        }
      });
  });

  // ---- Inbound: wire → engine dispatch ----
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
      return;
    }

    if (isLocal) {
      // -------- Local-test BroadcastChannel path --------
      if (typeof BroadcastChannel === 'undefined') {
        console.warn(
          '[useMultiplayerSync] BroadcastChannel unavailable; local 2P sync disabled.',
        );
        return;
      }
      const channel = new BroadcastChannel(broadcastChannelNameFor(roomId));
      broadcastChannelRef.current = channel;

      const onMessage = (ev: MessageEvent<IncomingMessage>) => {
        const msg = ev.data;
        if (!msg || msg.kind !== 'transferOut') return;
        if (msg.fromRole === role) return; // drop our own echo
        applyTransferLocal(engine, msg.cards, msg.sharedConsumed, msg.seq);
      };

      channel.addEventListener('message', onMessage);
      return () => {
        channel.removeEventListener('message', onMessage);
        channel.close();
        if (broadcastChannelRef.current === channel) {
          broadcastChannelRef.current = null;
        }
      };
    }

    // -------- Supabase Realtime path --------
    const supa = getSupabaseClient();
    if (!supa) {
      console.warn(
        '[useMultiplayerSync] Supabase env missing; multiplayer sync disabled.',
      );
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      // Ensure we have a session JWT before subscribing — Realtime needs
      // an authenticated client to evaluate RLS on `transfers`.
      const sess = await ensureAnonymousSession();
      if (cancelled) return;
      if (!sess) {
        console.error(
          '[useMultiplayerSync] anonymous auth failed; cannot subscribe to Realtime',
        );
        return;
      }

      // Phase 6 resume: backfill any transfers that arrived while we were
      // offline (tab closed, refresh, etc.) BEFORE we subscribe to live
      // Realtime updates. Order matters — if we subscribe first, a stale
      // backfill could later overwrite a fresh live INSERT.
      const sessionAtMount = sessionRef.current;
      if (sessionAtMount) {
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
            // Mark applied on the server so future resume calls skip it.
            void ackTransfer({ transferId: row.id }).catch(() => {
              /* best-effort; resume math will reconcile on next reload */
            });
          }
        } catch (err) {
          // Resume failure is non-fatal — Realtime live updates will still
          // work for transfers from this point forward. Log loudly so the
          // dev sees it.
          if (err instanceof MultiplayerApiError) {
            console.warn(
              `[useMultiplayerSync] resume failed: ${err.status} ${err.code}`,
            );
          } else {
            console.warn('[useMultiplayerSync] resume failed', err);
          }
        }
      }

      // Channel name is purely client-side bookkeeping for supabase-js;
      // the server doesn't care about it. We tag with roomId so DevTools
      // shows clean separation when multiple sessions exist.
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
            if (row.to_player !== role) return; // not for us
            if (appliedRowIdsRef.current.has(row.id)) return; // dedup

            appliedRowIdsRef.current.add(row.id);
            applyTransferLocal(
              engine,
              Array.isArray(row.cards) ? row.cards : [],
              typeof row.shared_consumed === 'number' ? row.shared_consumed : 0,
              row.seq,
            );

            // Best-effort ack (RPC fire-and-forget; resume code will
            // backfill missed transfers anyway).
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
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`[useMultiplayerSync] Realtime channel ${status}`);
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
    };
  }, [engine, roomId, role, isLocal]);
}
