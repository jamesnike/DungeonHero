/**
 * Multiplayer rule module — handles deck synchronization actions for the
 * 2-player asynchronous mode.
 *
 * Data model (per `.cursor/plans/2-player_multiplayer_mode_*.plan.md`):
 *
 *   remainingDeck = [transferred-from-peer (top → bottom)] ++ [shared portion]
 *                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^
 *                    cards carry _excludedFromShared: true   no flag
 *                    (LIFO; latest peer waterfall is at [0])
 *
 * Note: the "shared portion" was historically called "shared suffix" and
 * presumed to be byte-aligned across A and B. With the id-based protocol
 * (current) it's just "the same set of cards", possibly in different
 * orderings (because of the monster top-up/cap swap inside
 * `computeWaterfallDropPlan`).
 *
 * Actions:
 *
 *   1. `MULTIPLAYER_RECEIVE_TRANSFER` — peer pushed `cards` onto our top
 *      AND consumed `previewDealt` from THEIR own deck top. We:
 *        - prepend `cards` (auto-tagged `_excludedFromShared: true`)
 *        - remove cards in `previewDealt` from our `remainingDeck` by id
 *          (silently skip ones we don't have)
 *        - bump `lastAppliedSeq`
 *      The id-based removal is robust to drift: if the peer consumed a
 *      card that we previously transferred to them (so we don't have it),
 *      we skip cleanly without corrupting our deck.
 *   2. `MULTIPLAYER_CLEAR_PENDING_TRANSFER` — clears `pendingTransferOut`
 *      + `pendingTransferOutPreviewDealt` after the network layer has
 *      confirmed delivery.
 *   3. `SET_MULTIPLAYER_SESSION` — set/clear session metadata.
 *
 * All are guarded against `multiplayerSession === null`: in single-player,
 * they no-op (defensive — should never be dispatched).
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

  // Tag every received card as transferred-from-peer so future debugging
  // can tell at a glance "this came from the peer". The protocol no longer
  // uses this flag for sync logic (id-based removal is the source of
  // truth), but it's still useful for visual debugging / log inspection.
  const tagged: GameCardData[] = action.cards.map(c => ({
    ...c,
    _excludedFromShared: true,
  }));

  // Build a Set of ids we should remove from our remainingDeck. The peer
  // dealt these cards from their deck top to their preview row, and our
  // deck (modulo previously-transferred cards we don't have) has the same
  // shared content — so we should remove them too.
  let nextRemainingDeck = state.remainingDeck;
  if (action.previewDealt.length > 0) {
    const idsToRemove = new Set(action.previewDealt.map(c => c.id));
    nextRemainingDeck = state.remainingDeck.filter(c => !idsToRemove.has(c.id));
  }

  return applyPatch(state, {
    remainingDeck: [...tagged, ...nextRemainingDeck],
    multiplayerSession: {
      ...state.multiplayerSession,
      lastAppliedSeq: action.seq,
    },
  });
}

function reduceClearPendingTransfer(state: GameState): ReduceResult {
  // Always safe — even if pendingTransferOut is already null, this just
  // re-asserts the invariant.
  if (
    state.pendingTransferOut === null &&
    state.pendingTransferOutPreviewDealt === null
  ) {
    return noChange(state);
  }
  return applyPatch(state, {
    pendingTransferOut: null,
    pendingTransferOutPreviewDealt: null,
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
      pendingTransferOutPreviewDealt: null,
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
