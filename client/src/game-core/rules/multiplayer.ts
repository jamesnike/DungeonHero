/**
 * Multiplayer rule module — handles deck synchronization actions for the
 * 2-player asynchronous mode.
 *
 * Data model (per `.cursor/plans/2-player_multiplayer_mode_*.plan.md`):
 *
 *   remainingDeck = [transferred-from-peer (top → bottom)] ++ [shared suffix]
 *                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^
 *                    cards carry _excludedFromShared: true   no flag
 *                    (LIFO; latest peer waterfall is at [0]) (identical for A & B)
 *
 * Three actions live here:
 *
 *   1. `MULTIPLAYER_RECEIVE_TRANSFER` — peer pushed `cards` onto our top.
 *      We prepend, auto-tag `_excludedFromShared: true`, and bump
 *      `lastAppliedSeq`.
 *   2. `MULTIPLAYER_SHARED_SHRINK` — peer drew `count` from their shared
 *      suffix; we mirror by removing the leading `count` shared cards in
 *      our `remainingDeck` (skipping over any transferred prefix).
 *   3. `MULTIPLAYER_CLEAR_PENDING_TRANSFER` — clears `pendingTransferOut`
 *      after the network layer has confirmed delivery.
 *
 * All three are guarded against `multiplayerSession === null`: in
 * single-player, they no-op (defensive — should never be dispatched).
 */

import type { GameAction } from '../actions';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import { applyPatch, noChange, type ReduceResult } from '../reducer';

export function reduceMultiplayerActions(
  state: GameState,
  action: GameAction,
): ReduceResult | null {
  switch (action.type) {
    case 'MULTIPLAYER_RECEIVE_TRANSFER':
      return reduceReceiveTransfer(state, action);
    case 'MULTIPLAYER_SHARED_SHRINK':
      return reduceSharedShrink(state, action);
    case 'MULTIPLAYER_CLEAR_PENDING_TRANSFER':
      return reduceClearPendingTransfer(state);
    case 'SET_MULTIPLAYER_SESSION':
      return reduceSetMultiplayerSession(state, action);
    default:
      return null;
  }
}

function reduceReceiveTransfer(
  state: GameState,
  action: Extract<GameAction, { type: 'MULTIPLAYER_RECEIVE_TRANSFER' }>,
): ReduceResult {
  // Single-player safety: the action should never be dispatched in solo
  // play, but if it slips through (e.g. a stale BroadcastChannel listener
  // after the user switched to single mode), no-op rather than corrupting
  // the deck.
  if (state.multiplayerSession === null) return noChange(state);

  // Already-processed seq guard. The network layer is supposed to dedupe
  // by seq, but resume / replay can occasionally double-fire. Idempotent
  // means we drop anything at-or-below `lastAppliedSeq` silently.
  if (action.seq <= state.multiplayerSession.lastAppliedSeq) return noChange(state);

  // Tag every received card as transferred-from-peer so subsequent
  // shared-shrink calls correctly skip them.
  const tagged: GameCardData[] = action.cards.map(c => ({
    ...c,
    _excludedFromShared: true,
  }));

  return applyPatch(state, {
    remainingDeck: [...tagged, ...state.remainingDeck],
    multiplayerSession: {
      ...state.multiplayerSession,
      lastAppliedSeq: action.seq,
    },
  });
}

function reduceSharedShrink(
  state: GameState,
  action: Extract<GameAction, { type: 'MULTIPLAYER_SHARED_SHRINK' }>,
): ReduceResult {
  if (state.multiplayerSession === null) return noChange(state);
  if (action.seq <= state.multiplayerSession.lastAppliedSeq) return noChange(state);
  if (action.count <= 0) {
    // Still bump seq so resume math stays correct even for "0 shared
    // consumed" transfers (e.g. peer waterfalled but everything was
    // _excludedFromShared on their side).
    return applyPatch(state, {
      multiplayerSession: {
        ...state.multiplayerSession,
        lastAppliedSeq: action.seq,
      },
    });
  }

  // Walk the deck top→bottom; drop the first `count` cards that aren't
  // marked `_excludedFromShared`. Stop early if we run out of shared cards
  // (defensive: indicates desync — phase 6 resume reconciles via seq).
  let shrinkRemaining = action.count;
  const next: GameCardData[] = [];
  for (const card of state.remainingDeck) {
    if (shrinkRemaining > 0 && !card._excludedFromShared) {
      shrinkRemaining -= 1;
      continue; // drop this card from our local view
    }
    next.push(card);
  }

  return applyPatch(state, {
    remainingDeck: next,
    multiplayerSession: {
      ...state.multiplayerSession,
      lastAppliedSeq: action.seq,
    },
  });
}

function reduceClearPendingTransfer(state: GameState): ReduceResult {
  // Always safe — even if pendingTransferOut is already null, this just
  // re-asserts the invariant.
  if (state.pendingTransferOut === null) return noChange(state);
  return applyPatch(state, {
    pendingTransferOut: null,
  });
}

function reduceSetMultiplayerSession(
  state: GameState,
  action: Extract<GameAction, { type: 'SET_MULTIPLAYER_SESSION' }>,
): ReduceResult {
  // Tearing down (session === null) → also reset pendingTransferOut +
  // sharedDeckConsumed so any stale phase-2 state from a finished MP run
  // doesn't bleed into the next single-player game. Also reset the boss
  // alert flag so the next MP run can show the alert once.
  if (action.session === null) {
    return applyPatch(state, {
      multiplayerSession: null,
      pendingTransferOut: null,
      sharedDeckConsumed: 0,
      bossEncounterAlertShown: false,
    });
  }
  // Setting / resetting an active session → just write it. We deliberately
  // DO NOT reset pendingTransferOut here because resume (phase 6) restores
  // an active session AND a previously-buffered transferOut in the same
  // INIT step.
  return applyPatch(state, {
    multiplayerSession: action.session,
  });
}
