/**
 * Multiplayer phase-2 invariant: after A and B exchange `transferOut` events,
 * both players' "shared portion" of `remainingDeck` (cards WITHOUT
 * `_excludedFromShared: true`) MUST remain identical (modulo positional
 * reordering caused by monster top-up/cap inside `computeWaterfallDropPlan`).
 *
 * The id-based sync protocol:
 *   On waterfall, A emits { cards, previewDealt, seq } where:
 *     - `cards`        = squeezed-out preview cards going to B's deck top
 *     - `previewDealt` = cards A just dealt from its deck top to its preview
 *
 *   B's reducer:
 *     - prepends `cards` (auto-tagged `_excludedFromShared: true`)
 *     - removes any card whose id matches one in `previewDealt` from its
 *       own `remainingDeck` (silently skipping ids it doesn't have, e.g.
 *       cards previously transferred from B back to A)
 *
 * This file's coverage:
 *   1. A waterfall deals 2 shared + pushes 1 → B receives, removes 2
 *      shared by id, prepends 1 push card. Shared portions stay aligned.
 *   2. returnToDeck discard: A re-inserts wraith locally (tagged
 *      `_excludedFromShared`); B's shared portion unchanged (the
 *      re-inserted card isn't in `previewDealt` — it goes back to deck
 *      AFTER deal computes previewDealt).
 *   3. swarmInfest: bugs prepend with `_excludedFromShared`; B's shared
 *      portion still matches.
 *   4. Three alternating waterfalls (A → B → A) keep shared portions
 *      aligned.
 *   5. Idempotency: re-dispatching the same RECEIVE_TRANSFER seq is no-op.
 *   6. Pipeline whitelist: RECEIVE_TRANSFER + CLEAR drain under
 *      phase=playerInput.
 *   7. Single-player guard: NO transferOut emitted, MP fields untouched.
 *   8. Boss alert fires once when boss surfaces (MP only).
 *   9. MP threshold (≤2 active triggers waterfall vs ≤1 in solo).
 *   10. extraDiscardCards exists in MP, not in SP.
 *   11. Full pipeline: 2 discards staged → side effect carries both cards
 *       and previewDealt.
 *   12. Companion previewDealt accumulates across multi-iteration waterfalls.
 *   13. Persistence round-trip includes both pendingTransferOut and
 *       pendingTransferOutPreviewDealt.
 *   14. Drift handling: previewDealt cards that B doesn't have are
 *       silently skipped.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { computeWaterfallDropPlan } from '../rules/waterfall';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeMpState(role: 'A' | 'B', overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    multiplayerSession: {
      role,
      roomId: 'room-test',
      peerId: role === 'A' ? 'peer-B' : 'peer-A',
      lastAppliedSeq: 0,
    },
    pendingTransferOut: null,
    pendingTransferOutPreviewDealt: null,
    sharedDeckConsumed: 0,
    // NB: we keep phase='idle' (default) for the waterfall internals here.
    // In real game, APPLY_WATERFALL_DISCARD_EFFECTS / APPLY_WATERFALL_DEAL
    // are top-level dispatches (engine._processAction skips the input gate).
    // For MULTIPLAYER_RECEIVE_TRANSFER we DO need to test the whitelist
    // behavior under playerInput — a separate test in this file flips
    // phase explicitly for that case.
    ...overrides,
  };
}

function makeShared(id: string, name?: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: name ?? `Shared-${id}`,
    value: 1,
  } as GameCardData;
}

function emptyRow(): ActiveRowSlots {
  return [null, null, null, null, null] as unknown as ActiveRowSlots;
}

/**
 * Build a minimal `pendingWaterfallPlan`. Both `nextRemainingDeck`
 * (the deck after deal) and `nextPreviewCards` (the cards dealt from
 * deck top to the new preview row) are required for the MP id-based
 * protocol — `nextPreviewCards` becomes the `previewDealt` payload.
 */
function makePlanForDeck(
  remaining: GameCardData[],
  previewDealt: GameCardData[] = [],
) {
  return {
    dropAssignments: [],
    resolvedDropCards: [],
    dropPreviewIndices: [],
    dropTargetSlots: [],
    discardCard: null,
    discardPreviewIndex: null,
    discardDestination: 'graveyard' as const,
    nextPreviewCards: previewDealt,
    nextRemainingDeck: remaining,
    newPreviewStacks: {},
    shouldDeclareVictory: false,
    stuckFinalMonsters: [],
    rng: createRng(1),
  } as any;
}

/** Filter for the "shared portion" — cards without `_excludedFromShared`. */
function sharedPortion(deck: GameCardData[]): GameCardData[] {
  return deck.filter(c => !c._excludedFromShared);
}

/** Compare just the IDs (and order) of two shared portions. */
function sharedIds(deck: GameCardData[]): string[] {
  return sharedPortion(deck).map(c => c.id);
}

/** Compare just the SET of IDs (order-independent) — useful when monster
 *  top-up/cap reorders A and B differently. */
function sharedIdSet(deck: GameCardData[]): Set<string> {
  return new Set(sharedPortion(deck).map(c => c.id));
}

// ---------------------------------------------------------------------------
// 1. Single waterfall: A deals 2 shared + pushes 1 → B receives
// ---------------------------------------------------------------------------

describe('Multiplayer shared-portion invariant', () => {
  it('A waterfall deals 2 shared + pushes 1 → B mirrors via RECEIVE_TRANSFER → shared portions stay aligned', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      makeShared('s3'),
      makeShared('s4'),
      makeShared('s5'),
      makeShared('s6'),
    ];
    let stateA = makeMpState('A', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });
    let stateB = makeMpState('B', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });

    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));

    const discardCard = {
      id: 'd1',
      type: 'event',
      name: 'PushedOut',
      value: 0,
    } as unknown as GameCardData;

    // A deals s1+s2 to preview, leaving [s3..s6] in deck.
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck(
        [sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5]],
        [sharedDeck[0], sharedDeck[1]], // previewDealt
      ),
    };

    const discardResult = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5]],
      } as GameAction,
    ]);
    stateA = discardResult.state;

    // After DISCARD: cards are staged on the plan's `_shippedCardsBuffer`,
    // NOT on `state.pendingTransferOut`. The hook (useMultiplayerSync) does
    // not see them yet — by design, to prevent it from POSTing intermediate
    // states. The DEAL reducer commits the buffer atomically below.
    expect(stateA.pendingTransferOut).toBeNull();
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer).toBeDefined();
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['d1']);
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer![0]._excludedFromShared).toBeUndefined();

    const dealResult = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' });
    stateA = dealResult.state;

    // After DEAL: atomically committed to `pendingTransferOut` +
    // `pendingTransferOutPreviewDealt`. Hook fires once with the full batch.
    expect(stateA.pendingTransferOut).not.toBeNull();
    expect(stateA.pendingTransferOut!.length).toBe(1);
    expect(stateA.pendingTransferOut![0].id).toBe('d1');
    expect(stateA.pendingTransferOut![0]._excludedFromShared).toBeUndefined();

    expect(stateA.sharedDeckConsumed).toBe(2);
    expect(stateA.remainingDeck.map(c => c.id)).toEqual(['s3', 's4', 's5', 's6']);

    const transferOutEvents = (dealResult.sideEffects ?? []).filter(
      e => e.event === 'multiplayer:transferOut',
    );
    expect(transferOutEvents).toHaveLength(1);
    const payload = transferOutEvents[0].payload as {
      cards: GameCardData[];
      previewDealt: GameCardData[];
      seq: number;
    };
    expect(payload.cards.map(c => c.id)).toEqual(['d1']);
    expect(payload.previewDealt.map(c => c.id)).toEqual(['s1', 's2']);
    expect(payload.seq).toBe(2);

    // Mirror on B: single RECEIVE_TRANSFER does both prepend + remove-by-id.
    const bResult = drain(stateB, [
      {
        type: 'MULTIPLAYER_RECEIVE_TRANSFER',
        cards: payload.cards,
        previewDealt: payload.previewDealt,
        seq: 1,
      },
    ]);
    stateB = bResult.state;

    // B's deck = [d1 (excluded)] ++ [s3, s4, s5, s6 (shared)].
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['d1', 's3', 's4', 's5', 's6']);
    expect(stateB.remainingDeck[0]._excludedFromShared).toBe(true);

    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));
    expect(sharedIds(stateA.remainingDeck)).toEqual(['s3', 's4', 's5', 's6']);
  });

  // -------------------------------------------------------------------------
  // 2. MP teleport bypass: returnToDeck waterfallEffect does NOT fire on
  //    sender; wraith just teleports to peer.
  // -------------------------------------------------------------------------

  it('MP teleport bypass: returnToDeck waterfallEffect does NOT trigger; wraith teleports to peer', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      makeShared('s3'),
    ];
    let stateA = makeMpState('A', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      rng: createRng(123),
    });
    let stateB = makeMpState('B', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });

    const wraithDiscard = {
      id: 'w1',
      type: 'monster',
      name: 'Phantom',
      monsterType: 'Wraith',
      hp: 1,
      attack: 1,
      value: 0,
      waterfallEffect: { type: 'returnToDeck' },
    } as unknown as GameCardData;

    // A deals s1 to preview (1 card), leaving [s2, s3]. The wraith is
    // teleported to peer — no local re-insertion.
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck(
        [sharedDeck[1], sharedDeck[2]],
        [sharedDeck[0]], // previewDealt = s1
      ),
    };

    const discardResult = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: wraithDiscard,
        nextRemainingDeck: [sharedDeck[1], sharedDeck[2]],
      } as GameAction,
    ]);
    stateA = discardResult.state;

    // Teleport bypass: wraith is staged for transfer, NOT re-inserted locally.
    const updatedDeck = stateA.pendingWaterfallPlan?.nextRemainingDeck ?? [];
    expect(updatedDeck.find(c => c.id === 'w1')).toBeUndefined();
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['w1']);
    // _excludedFromShared is stripped before teleport (peer re-tags on RECEIVE).
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer![0]._excludedFromShared).toBeUndefined();

    const dealResult = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' });
    stateA = dealResult.state;

    expect(stateA.sharedDeckConsumed).toBe(1);

    const transferOutEvents = (dealResult.sideEffects ?? []).filter(
      e => e.event === 'multiplayer:transferOut',
    );
    expect(transferOutEvents).toHaveLength(1);
    const payload = transferOutEvents[0].payload as {
      cards: GameCardData[];
      previewDealt: GameCardData[];
      seq: number;
    };
    expect(payload.cards.map(c => c.id)).toEqual(['w1']);
    expect(payload.previewDealt.map(c => c.id)).toEqual(['s1']);

    const bResult = drain(stateB, [
      {
        type: 'MULTIPLAYER_RECEIVE_TRANSFER',
        cards: payload.cards,
        previewDealt: payload.previewDealt,
        seq: 1,
      },
    ]);
    stateB = bResult.state;

    // B's deck = [w1 (excluded, teleported in)] ++ [s2, s3].
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['w1', 's2', 's3']);
    expect(stateB.remainingDeck[0]._excludedFromShared).toBe(true);

    // Shared portion stays aligned.
    expect(sharedIds(stateA.remainingDeck)).toEqual(['s2', 's3']);
    expect(sharedIds(stateB.remainingDeck)).toEqual(['s2', 's3']);
  });

  // -------------------------------------------------------------------------
  // 3. MP teleport bypass: swarmInfest waterfallEffect does NOT fire — no
  //    bugs spawned locally; SwarmHost just teleports.
  // -------------------------------------------------------------------------

  it('MP teleport bypass: swarmInfest waterfallEffect does NOT trigger; no bugs spawned, host teleports', () => {
    const sharedDeck = [makeShared('s1'), makeShared('s2'), makeShared('s3'), makeShared('s4')];
    let stateA = makeMpState('A', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });
    let stateB = makeMpState('B', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });

    const swarmDiscard = {
      id: 'sw1',
      type: 'monster',
      name: 'SwarmHost',
      hp: 1,
      attack: 1,
      value: 0,
      waterfallEffect: { type: 'swarmInfest', amount: 2 },
    } as unknown as GameCardData;

    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck(
        [sharedDeck[1], sharedDeck[2], sharedDeck[3]],
        [sharedDeck[0]], // previewDealt = s1
      ),
    };

    stateA = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: swarmDiscard,
        nextRemainingDeck: [sharedDeck[1], sharedDeck[2], sharedDeck[3]],
      } as GameAction,
    ]).state;

    // SwarmHost staged for teleport. NO bugs spawned locally (waterfallEffect
    // bypassed).
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['sw1']);
    const planDeck = stateA.pendingWaterfallPlan?.nextRemainingDeck ?? [];
    expect(planDeck.map(c => c.id)).toEqual(['s2', 's3', 's4']); // unchanged, no bugs
    expect(planDeck.every(c => !c._excludedFromShared)).toBe(true);

    const dealResult = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' });
    stateA = dealResult.state;

    expect(stateA.pendingTransferOut!.map(c => c.id)).toEqual(['sw1']);

    const payload = (dealResult.sideEffects ?? []).find(
      e => e.event === 'multiplayer:transferOut',
    )?.payload as {
      cards: GameCardData[];
      previewDealt: GameCardData[];
      seq: number;
    };
    expect(payload).toBeDefined();
    expect(payload.cards.map(c => c.id)).toEqual(['sw1']);
    expect(payload.previewDealt.map(c => c.id)).toEqual(['s1']);

    stateB = drain(stateB, [
      {
        type: 'MULTIPLAYER_RECEIVE_TRANSFER',
        cards: payload.cards,
        previewDealt: payload.previewDealt,
        seq: 1,
      },
    ]).state;

    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['sw1', 's2', 's3', 's4']);
    expect(stateB.remainingDeck[0]._excludedFromShared).toBe(true);

    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));
    expect(sharedIds(stateA.remainingDeck)).toEqual(['s2', 's3', 's4']);
  });

  // -------------------------------------------------------------------------
  // 3b. MP teleport bypass: damage waterfallEffect does NOT enqueue
  //     APPLY_DAMAGE; goldLoss does NOT decrement gold.
  // -------------------------------------------------------------------------

  it('MP teleport bypass: damage waterfallEffect does NOT enqueue APPLY_DAMAGE', () => {
    let stateA = makeMpState('A', {
      remainingDeck: [makeShared('s1')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      hp: 30,
      pendingWaterfallPlan: makePlanForDeck([makeShared('s1')], []),
    });

    const damageDiscard = {
      id: 'dmg',
      type: 'monster',
      name: 'KamikazeBat',
      hp: 1,
      attack: 1,
      value: 0,
      waterfallEffect: { type: 'damage', amount: 5 },
    } as unknown as GameCardData;

    const result = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: damageDiscard,
        nextRemainingDeck: [makeShared('s1')],
      } as GameAction,
    ]);
    stateA = result.state;

    // No damage applied — bypassed.
    expect(stateA.hp).toBe(30);
    // Card teleported instead.
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['dmg']);
  });

  it('MP teleport bypass: goldLoss waterfallEffect does NOT decrement gold', () => {
    let stateA = makeMpState('A', {
      remainingDeck: [makeShared('s1')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      gold: 50,
      pendingWaterfallPlan: makePlanForDeck([makeShared('s1')], []),
    });

    const goldLossDiscard = {
      id: 'gl',
      type: 'monster',
      name: 'GoldThief',
      hp: 1,
      attack: 1,
      value: 0,
      waterfallEffect: { type: 'goldLoss', amount: 10 },
    } as unknown as GameCardData;

    const result = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: goldLossDiscard,
        nextRemainingDeck: [makeShared('s1')],
      } as GameAction,
    ]);
    stateA = result.state;

    expect(stateA.gold).toBe(50);
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['gl']);
  });

  // -------------------------------------------------------------------------
  // 3c. MP teleport bypass: onDiscardDamage / onDiscardDraw must NOT trigger
  //     (cards do NOT enter local discardedCards — they teleport)
  // -------------------------------------------------------------------------

  it('MP teleport bypass: onDiscardDamage on the squeezed card does NOT fire (card never enters local graveyard)', () => {
    let stateA = makeMpState('A', {
      remainingDeck: [makeShared('s1')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      hp: 30,
      discardedCards: [],
      pendingWaterfallPlan: makePlanForDeck([makeShared('s1')], []),
    });

    // onDiscardDamage = "when this card is discarded, deal X damage to hero".
    // In MP, since the card teleports rather than going to graveyard, this
    // must NOT fire on sender's side.
    const onDiscardDamageCard = {
      id: 'odd',
      type: 'magic',
      name: 'CursedSpark',
      value: 0,
      onDiscardDamage: 7,
    } as unknown as GameCardData;

    const result = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: onDiscardDamageCard,
        nextRemainingDeck: [makeShared('s1')],
      } as GameAction,
    ]);
    stateA = result.state;

    expect(stateA.hp).toBe(30);
    expect(stateA.discardedCards.find(c => c.id === 'odd')).toBeUndefined();
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['odd']);
  });

  it('MP teleport bypass: onDiscardDraw on the squeezed card does NOT fire (no extra hand cards)', () => {
    let stateA = makeMpState('A', {
      remainingDeck: [makeShared('s1')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      handCards: [],
      backpackItems: [makeShared('b1'), makeShared('b2'), makeShared('b3')],
      discardedCards: [],
      pendingWaterfallPlan: makePlanForDeck([makeShared('s1')], []),
    });

    const onDiscardDrawCard = {
      id: 'odr',
      type: 'magic',
      name: 'EchoFragment',
      value: 0,
      onDiscardDraw: 2,
    } as unknown as GameCardData;

    const result = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: onDiscardDrawCard,
        nextRemainingDeck: [makeShared('s1')],
      } as GameAction,
    ]);
    stateA = result.state;

    expect(stateA.handCards).toHaveLength(0);
    expect(stateA.discardedCards.find(c => c.id === 'odr')).toBeUndefined();
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['odr']);
  });

  // -------------------------------------------------------------------------
  // 3d. MP teleport: stacked preview cards at the squeezed slot also teleport
  // -------------------------------------------------------------------------

  it('MP teleport: stacked preview cards at the squeezed slot teleport along with primary', () => {
    const stackedA = { id: 'st1', type: 'event', name: 'Stack-1', value: 0 } as unknown as GameCardData;
    const stackedB = { id: 'st2', type: 'event', name: 'Stack-2', value: 0 } as unknown as GameCardData;
    const primary = { id: 'pr', type: 'event', name: 'Primary', value: 0 } as unknown as GameCardData;

    let stateA = makeMpState('A', {
      remainingDeck: [makeShared('s1')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      previewCardStacks: { 2: [stackedA, stackedB] },
      pendingWaterfallPlan: makePlanForDeck([makeShared('s1')], []),
    });

    const result = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: primary,
        discardPreviewIndex: 2,
        nextRemainingDeck: [makeShared('s1')],
      } as GameAction,
    ]);
    stateA = result.state;

    // All three (primary + 2 stacked) should be in the teleport buffer.
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual([
      'pr',
      'st1',
      'st2',
    ]);
    // Stacks at index 2 cleared.
    expect(stateA.previewCardStacks[2] ?? []).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 3e. MP teleport EXCEPTION: Boss precursor (isFinalMonster) must NOT
  //     teleport — gets buried at the bottom of local deck instead.
  // -------------------------------------------------------------------------

  it('MP exception: Boss precursor (isFinalMonster) does NOT teleport — buried at bottom of local deck', () => {
    let stateA = makeMpState('A', {
      remainingDeck: [makeShared('s1'), makeShared('s2')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      pendingWaterfallPlan: makePlanForDeck([makeShared('s1'), makeShared('s2')], []),
    });

    const bossPrecursor = {
      id: 'boss-prec',
      type: 'monster',
      name: 'BossHerald',
      isFinalMonster: true,
      bossPhase: true,
      hp: 30,
      attack: 10,
      value: 0,
    } as unknown as GameCardData;

    const result = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: bossPrecursor,
        nextRemainingDeck: [makeShared('s1'), makeShared('s2')],
      } as GameAction,
    ]);
    stateA = result.state;

    // Boss NOT staged for transfer.
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer ?? []).toHaveLength(0);
    // Boss buried at bottom of local deck (not teleported).
    const updatedDeck = stateA.pendingWaterfallPlan!.nextRemainingDeck;
    expect(updatedDeck[updatedDeck.length - 1]?.id).toBe('boss-prec');
  });

  // -------------------------------------------------------------------------
  // 4. Three alternating waterfalls (A → B → A) keep shared portions aligned
  // -------------------------------------------------------------------------

  it('three alternating waterfalls (A → B → A) keep shared portions identical (id-based)', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      makeShared('s3'),
      makeShared('s4'),
      makeShared('s5'),
      makeShared('s6'),
      makeShared('s7'),
      makeShared('s8'),
    ];
    let stateA = makeMpState('A', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });
    let stateB = makeMpState('B', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });

    const mkDiscard = (id: string) =>
      ({
        id,
        type: 'event',
        name: `Push-${id}`,
        value: 0,
      }) as unknown as GameCardData;

    const runWaterfall = (
      self: GameState,
      peer: GameState,
      previewDealtCardIds: string[],
      discardId: string,
    ): { self: GameState; peer: GameState } => {
      // The cards in `previewDealtCardIds` get consumed from self's deck top.
      // We slice them off (preserving the transferred prefix).
      const transferredPrefix = self.remainingDeck.filter(c => c._excludedFromShared);
      const sharedTail = self.remainingDeck.filter(c => !c._excludedFromShared);
      const previewDealt = sharedTail
        .filter(c => previewDealtCardIds.includes(c.id))
        .map(c => ({ ...c }));
      const remainingShared = sharedTail.filter(c => !previewDealtCardIds.includes(c.id));
      const newDeck = [...transferredPrefix, ...remainingShared];

      let s = {
        ...self,
        pendingWaterfallPlan: makePlanForDeck(newDeck, previewDealt),
      };
      s = drain(s, [
        {
          type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
          discardCard: mkDiscard(discardId),
          nextRemainingDeck: newDeck,
        } as GameAction,
      ]).state;
      const dealResult = reduce(s, { type: 'APPLY_WATERFALL_DEAL' });
      s = dealResult.state;

      const transferEvent = (dealResult.sideEffects ?? []).find(
        e => e.event === 'multiplayer:transferOut',
      );
      expect(transferEvent).toBeDefined();
      const payload = transferEvent!.payload as {
        cards: GameCardData[];
        previewDealt: GameCardData[];
        seq: number;
      };

      // Peer applies via single RECEIVE_TRANSFER (no SHRINK).
      const baseSeq = (peer.multiplayerSession?.lastAppliedSeq ?? 0) + 1;
      const newPeer = drain(peer, [
        {
          type: 'MULTIPLAYER_RECEIVE_TRANSFER',
          cards: payload.cards,
          previewDealt: payload.previewDealt,
          seq: baseSeq,
        },
      ]).state;

      const cleared = drain(s, [{ type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' }]).state;
      return { self: cleared, peer: newPeer };
    };

    // Round 1: A deals s1+s2, pushes d1.
    let r = runWaterfall(stateA, stateB, ['s1', 's2'], 'd1');
    stateA = r.self;
    stateB = r.peer;
    expect(sharedIdSet(stateA.remainingDeck)).toEqual(sharedIdSet(stateB.remainingDeck));
    expect(sharedIds(stateA.remainingDeck).sort()).toEqual(['s3', 's4', 's5', 's6', 's7', 's8']);

    // Round 2: B waterfall, deals s3+s4+s5, pushes d2. (B doesn't have s1/s2
    // because A consumed them; B's deck now has [d1(excluded), s3..s8].)
    r = runWaterfall(stateB, stateA, ['s3', 's4', 's5'], 'd2');
    stateB = r.self;
    stateA = r.peer;
    expect(sharedIdSet(stateA.remainingDeck)).toEqual(sharedIdSet(stateB.remainingDeck));
    expect(sharedIds(stateA.remainingDeck).sort()).toEqual(['s6', 's7', 's8']);

    // Round 3: A waterfall again, deals s6, pushes d3.
    r = runWaterfall(stateA, stateB, ['s6'], 'd3');
    stateA = r.self;
    stateB = r.peer;
    expect(sharedIdSet(stateA.remainingDeck)).toEqual(sharedIdSet(stateB.remainingDeck));
    expect(sharedIds(stateA.remainingDeck).sort()).toEqual(['s7', 's8']);
  });

  // -------------------------------------------------------------------------
  // 5. Idempotency: replaying the same RECEIVE seq is a no-op
  // -------------------------------------------------------------------------

  it('idempotency: re-dispatching MULTIPLAYER_RECEIVE_TRANSFER with the same seq is a no-op', () => {
    let stateB = makeMpState('B', {
      remainingDeck: [makeShared('s1'), makeShared('s2')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });

    const card = { id: 'd1', type: 'event', name: 'Push', value: 0 } as unknown as GameCardData;

    stateB = drain(stateB, [
      { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: [card], previewDealt: [], seq: 1 },
    ]).state;
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['d1', 's1', 's2']);
    expect(stateB.multiplayerSession?.lastAppliedSeq).toBe(1);

    stateB = drain(stateB, [
      { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: [card], previewDealt: [], seq: 1 },
    ]).state;
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['d1', 's1', 's2']);
    expect(stateB.multiplayerSession?.lastAppliedSeq).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 6. Pipeline whitelist: MULTIPLAYER_* drains under playerInput
  // -------------------------------------------------------------------------

  it('MULTIPLAYER_RECEIVE_TRANSFER + CLEAR_PENDING_TRANSFER all drain under phase=playerInput', () => {
    const stateB = makeMpState('B', {
      remainingDeck: [makeShared('s1'), makeShared('s2'), makeShared('s3')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      pendingTransferOut: [makeShared('local')],
      phase: 'playerInput',
    });

    const card = { id: 'd1', type: 'event', name: 'Push', value: 0 } as unknown as GameCardData;

    const result = drain(stateB, [
      {
        type: 'MULTIPLAYER_RECEIVE_TRANSFER',
        cards: [card],
        previewDealt: [makeShared('s1')],
        seq: 1,
      },
      { type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' },
    ]);

    expect(result.pausedForInput).toBe(false);
    expect(result.queue).toHaveLength(0);
    // [d1 (prepended)] ++ [s2, s3] (s1 removed by id).
    expect(result.state.remainingDeck.map(c => c.id)).toEqual(['d1', 's2', 's3']);
    expect(result.state.pendingTransferOut).toBeNull();
    expect(result.state.multiplayerSession?.lastAppliedSeq).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 7. Single-player guard
  // -------------------------------------------------------------------------

  it('single-player: waterfall does NOT emit multiplayer:transferOut and does NOT touch sharedDeckConsumed', () => {
    const sharedDeck = [makeShared('s1'), makeShared('s2'), makeShared('s3')];
    let state: GameState = {
      ...createInitialGameState(),
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    };

    const discardCard = {
      id: 'd1',
      type: 'event',
      name: 'PushedOut',
      value: 0,
    } as unknown as GameCardData;

    state = {
      ...state,
      pendingWaterfallPlan: makePlanForDeck(
        [sharedDeck[1], sharedDeck[2]],
        [sharedDeck[0]],
      ),
    };

    state = drain(state, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [sharedDeck[1], sharedDeck[2]],
      } as GameAction,
    ]).state;

    expect(state.pendingTransferOut).toBeNull();

    const dealResult = reduce(state, { type: 'APPLY_WATERFALL_DEAL' });
    state = dealResult.state;

    expect(state.sharedDeckConsumed).toBe(0);
    expect(
      (dealResult.sideEffects ?? []).filter(e => e.event === 'multiplayer:transferOut'),
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 8. Boss alert fires once when boss surfaces (MP only)
  // -------------------------------------------------------------------------

  it('multiplayer: emits multiplayer:bossEncountered exactly once when isFinalMonster lands in preview', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      {
        id: 'boss',
        type: 'monster',
        name: 'BossX',
        value: 0,
        isFinalMonster: true,
        bossPhase: true,
        attack: 10,
        hp: 30,
      } as unknown as GameCardData,
      makeShared('s3'),
      makeShared('s4'),
    ];
    let state: GameState = {
      ...makeMpState('A', {
        remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
        activeCards: emptyRow(),
        previewCards: emptyRow(),
      }),
    };

    state = {
      ...state,
      pendingWaterfallPlan: {
        ...makePlanForDeck([sharedDeck[3], sharedDeck[4]], [sharedDeck[2]]),
        nextPreviewCards: [sharedDeck[2]] as GameCardData[],
      },
    };

    const result = reduce(state, { type: 'APPLY_WATERFALL_DEAL' });
    const bossEvents = (result.sideEffects ?? []).filter(
      e => e.event === 'multiplayer:bossEncountered',
    );
    expect(bossEvents).toHaveLength(1);
    expect((bossEvents[0].payload as { monsterId: string }).monsterId).toBe('boss');
    expect(result.state.bossEncounterAlertShown).toBe(true);

    const state2 = result.state;
    const result2 = reduce(
      {
        ...state2,
        pendingWaterfallPlan: {
          ...makePlanForDeck([sharedDeck[3], sharedDeck[4]], [sharedDeck[2]]),
          nextPreviewCards: [sharedDeck[2]] as GameCardData[],
        },
      },
      { type: 'APPLY_WATERFALL_DEAL' },
    );
    expect(
      (result2.sideEffects ?? []).filter(e => e.event === 'multiplayer:bossEncountered'),
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 9. MP threshold: ≤2 active triggers waterfall (vs ≤1 in solo)
  // -------------------------------------------------------------------------

  it('MP: waterfall trigger fires when active row drops to 2 (vs 1 in solo)', () => {
    const monster = (id: string): GameCardData =>
      ({
        id,
        type: 'monster',
        name: id,
        value: 3,
        attack: 3,
        hp: 3,
        maxHp: 3,
      }) as unknown as GameCardData;

    const previewSlot = (id: string): GameCardData => makeShared(id);

    const baseState = makeMpState('A', {
      activeCards: [monster('m1'), monster('m2'), monster('m3'), null] as ActiveRowSlots,
      previewCards: [
        previewSlot('p1'),
        previewSlot('p2'),
        previewSlot('p3'),
        previewSlot('p4'),
      ] as ActiveRowSlots,
      remainingDeck: [
        makeShared('d1'),
        makeShared('d2'),
        makeShared('d3'),
        makeShared('d4'),
        makeShared('d5'),
        makeShared('d6'),
      ],
      hp: 30,
      maxHp: 40,
      phase: 'playerInput',
    });

    expect(baseState.pendingWaterfallPlan).toBeNull();

    const result = reduce(baseState, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: cards => {
        const next = [...cards] as ActiveRowSlots;
        next[2] = null;
        return next;
      },
    });

    expect(result.state.pendingWaterfallPlan).not.toBeNull();
    const plan = result.state.pendingWaterfallPlan!;
    expect(plan.dropAssignments.length).toBe(2);
    expect(plan.discardCard).not.toBeNull();
    expect(plan.extraDiscardCards ?? []).toHaveLength(1);
  });

  it('SP: same active=2 state does NOT trigger waterfall (threshold stays at <=1)', () => {
    const monster = (id: string): GameCardData =>
      ({
        id,
        type: 'monster',
        name: id,
        value: 3,
        attack: 3,
        hp: 3,
        maxHp: 3,
      }) as unknown as GameCardData;

    const baseState: GameState = {
      ...createInitialGameState(),
      activeCards: [monster('m1'), monster('m2'), monster('m3'), null] as ActiveRowSlots,
      previewCards: [
        makeShared('p1'),
        makeShared('p2'),
        makeShared('p3'),
        makeShared('p4'),
      ] as ActiveRowSlots,
      remainingDeck: [
        makeShared('d1'),
        makeShared('d2'),
        makeShared('d3'),
        makeShared('d4'),
      ],
      hp: 30,
      maxHp: 40,
      phase: 'playerInput',
    };

    const result = reduce(baseState, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: cards => {
        const next = [...cards] as ActiveRowSlots;
        next[2] = null;
        return next;
      },
    });

    expect(result.state.pendingWaterfallPlan).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 10. extraDiscardCards exists in MP, not in SP
  // -------------------------------------------------------------------------

  it('MP: computeWaterfallDropPlan with 2 active + 4 preview returns extraDiscardCards.length === 1', () => {
    const state = makeMpState('A', {
      activeCards: [
        { id: 'm1', type: 'monster', name: 'M1', value: 3, attack: 3, hp: 3, maxHp: 3 } as unknown as GameCardData,
        { id: 'm2', type: 'monster', name: 'M2', value: 3, attack: 3, hp: 3, maxHp: 3 } as unknown as GameCardData,
        null,
        null,
      ] as ActiveRowSlots,
      previewCards: [
        makeShared('p1'),
        makeShared('p2'),
        makeShared('p3'),
        makeShared('p4'),
      ] as ActiveRowSlots,
      remainingDeck: [
        makeShared('d1'),
        makeShared('d2'),
        makeShared('d3'),
        makeShared('d4'),
      ],
    });

    const plan = computeWaterfallDropPlan(state, false);
    expect(plan).not.toBeNull();
    expect(plan!.dropAssignments).toHaveLength(2);
    expect(plan!.discardCard).not.toBeNull();
    expect(plan!.extraDiscardCards).toBeDefined();
    expect(plan!.extraDiscardCards!).toHaveLength(1);
    expect(plan!.extraDiscardPreviewIndices!).toHaveLength(1);
    expect(plan!.extraDiscardPreviewIndices![0]).not.toBe(plan!.discardPreviewIndex);
  });

  it('SP: same shape returns extraDiscardCards as empty (or undefined)', () => {
    const state: GameState = {
      ...createInitialGameState(),
      activeCards: [
        { id: 'm1', type: 'monster', name: 'M1', value: 3, attack: 3, hp: 3, maxHp: 3 } as unknown as GameCardData,
        { id: 'm2', type: 'monster', name: 'M2', value: 3, attack: 3, hp: 3, maxHp: 3 } as unknown as GameCardData,
        null,
        null,
      ] as ActiveRowSlots,
      previewCards: [
        makeShared('p1'),
        makeShared('p2'),
        makeShared('p3'),
        makeShared('p4'),
      ] as ActiveRowSlots,
      remainingDeck: [makeShared('d1'), makeShared('d2'), makeShared('d3'), makeShared('d4')],
    };

    const plan = computeWaterfallDropPlan(state, false);
    expect(plan).not.toBeNull();
    expect(plan!.extraDiscardCards ?? []).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 11. Full pipeline: 2 discards staged → side effect carries both arrays
  // -------------------------------------------------------------------------

  it('MP: full pipeline (2 discards) — both cards staged, transferOut emits cards=[pd,ed] + previewDealt=[s1,s2]', () => {
    const sharedDeck = [
      makeShared('d1'),
      makeShared('d2'),
      makeShared('d3'),
      makeShared('d4'),
      makeShared('d5'),
      makeShared('d6'),
    ];

    const primaryDiscard: GameCardData = {
      id: 'pd',
      type: 'event',
      name: 'PrimaryPushedOut',
      value: 0,
    } as unknown as GameCardData;
    const extraDiscard: GameCardData = {
      id: 'ed',
      type: 'event',
      name: 'ExtraPushedOut',
      value: 0,
    } as unknown as GameCardData;

    let stateA = makeMpState('A', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      pendingWaterfallPlan: {
        ...makePlanForDeck(
          [sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5]],
          [sharedDeck[0], sharedDeck[1]], // previewDealt = [d1, d2]
        ),
        discardCard: primaryDiscard,
        discardPreviewIndex: 2,
        extraDiscardCards: [extraDiscard],
        extraDiscardPreviewIndices: [3],
      },
    });

    const r1 = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: primaryDiscard,
        nextRemainingDeck: stateA.pendingWaterfallPlan!.nextRemainingDeck,
        discardPreviewIndex: 2,
      } as GameAction,
    ]);
    stateA = r1.state;

    // Cards staged on plan buffer, not yet on state.pendingTransferOut.
    expect(stateA.pendingTransferOut).toBeNull();
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['pd']);

    const liveDeck = stateA.pendingWaterfallPlan!.nextRemainingDeck;
    const r2 = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: extraDiscard,
        nextRemainingDeck: liveDeck,
        discardPreviewIndex: 3,
      } as GameAction,
    ]);
    stateA = r2.state;

    // Buffer accumulates across the chained discard dispatches.
    expect(stateA.pendingTransferOut).toBeNull();
    expect(stateA.pendingWaterfallPlan!._shippedCardsBuffer!.map(c => c.id)).toEqual(['pd', 'ed']);

    const dealResult = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' });
    stateA = dealResult.state;

    // After DEAL: atomic commit — buffer + previewDealt land together.
    expect(stateA.pendingTransferOut!.map(c => c.id)).toEqual(['pd', 'ed']);

    // 2 shared cards consumed (d1, d2) → cumulative counter = 2.
    expect(stateA.sharedDeckConsumed).toBe(2);
    expect(stateA.remainingDeck.map(c => c.id)).toEqual(['d3', 'd4', 'd5', 'd6']);

    const transferOutEvents = (dealResult.sideEffects ?? []).filter(
      e => e.event === 'multiplayer:transferOut',
    );
    expect(transferOutEvents).toHaveLength(1);
    const payload = transferOutEvents[0].payload as {
      cards: GameCardData[];
      previewDealt: GameCardData[];
      seq: number;
    };
    expect(payload.cards.map(c => c.id)).toEqual(['pd', 'ed']);
    expect(payload.previewDealt.map(c => c.id)).toEqual(['d1', 'd2']);
  });

  it('single-player: never emits multiplayer:bossEncountered even when boss surfaces', () => {
    const boss = {
      id: 'boss',
      type: 'monster',
      name: 'BossY',
      value: 0,
      isFinalMonster: true,
      bossPhase: true,
      attack: 10,
      hp: 30,
    } as unknown as GameCardData;
    let state: GameState = {
      ...createInitialGameState(),
      remainingDeck: [makeShared('s1'), boss],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    };

    state = {
      ...state,
      pendingWaterfallPlan: {
        ...makePlanForDeck([], [boss]),
        nextPreviewCards: [boss],
      },
    };

    const result = reduce(state, { type: 'APPLY_WATERFALL_DEAL' });
    expect(
      (result.sideEffects ?? []).filter(e => e.event === 'multiplayer:bossEncountered'),
    ).toHaveLength(0);
    expect(result.state.bossEncounterAlertShown).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 12. pendingTransferOutPreviewDealt lifecycle
  // -------------------------------------------------------------------------

  it('MP waterfall sets pendingTransferOutPreviewDealt alongside cards', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      makeShared('s3'),
      makeShared('s4'),
      makeShared('s5'),
      makeShared('s6'),
    ];
    let stateA = makeMpState('A', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });

    expect(stateA.pendingTransferOut).toBeNull();
    expect(stateA.pendingTransferOutPreviewDealt).toBeNull();

    const discardCard = sharedDeck[0];
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck(
        [sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5]],
        [sharedDeck[0], sharedDeck[1]], // previewDealt = [s1, s2]
      ),
    };
    stateA = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5]],
      } as GameAction,
    ]).state;
    stateA = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' }).state;

    expect(stateA.pendingTransferOut).not.toBeNull();
    expect(stateA.pendingTransferOut!).toHaveLength(1);
    expect(stateA.pendingTransferOutPreviewDealt).not.toBeNull();
    expect(stateA.pendingTransferOutPreviewDealt!.map(c => c.id)).toEqual(['s1', 's2']);
    expect(stateA.sharedDeckConsumed).toBe(2);
  });

  it('MULTIPLAYER_CLEAR_PENDING_TRANSFER clears BOTH cards and previewDealt', () => {
    let state = makeMpState('A', {
      pendingTransferOut: [makeShared('staged')],
      pendingTransferOutPreviewDealt: [makeShared('preview-1'), makeShared('preview-2')],
    });
    state = reduce(state, { type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' }).state;
    expect(state.pendingTransferOut).toBeNull();
    expect(state.pendingTransferOutPreviewDealt).toBeNull();
  });

  it('Companion previewDealt accumulates across multiple waterfalls before clear (network-slow case)', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      makeShared('s3'),
      makeShared('s4'),
      makeShared('s5'),
      makeShared('s6'),
      makeShared('s7'),
      makeShared('s8'),
    ];
    let stateA = makeMpState('A', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });

    // ----- waterfall 1: deals s1+s2, pushes s3 -----
    const discard1 = sharedDeck[0];
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck(
        [sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5], sharedDeck[6], sharedDeck[7]],
        [sharedDeck[0], sharedDeck[1]],
      ),
    };
    stateA = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: discard1,
        nextRemainingDeck: [
          sharedDeck[2],
          sharedDeck[3],
          sharedDeck[4],
          sharedDeck[5],
          sharedDeck[6],
          sharedDeck[7],
        ],
      } as GameAction,
    ]).state;
    stateA = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' }).state;
    expect(stateA.pendingTransferOutPreviewDealt!.map(c => c.id)).toEqual(['s1', 's2']);
    expect(stateA.pendingTransferOut!).toHaveLength(1);

    // Hook hasn't ack'd. Run waterfall 2 from the new deck head (deals s3+s4).
    const discard2 = sharedDeck[2];
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck(
        [sharedDeck[4], sharedDeck[5], sharedDeck[6], sharedDeck[7]],
        [sharedDeck[2], sharedDeck[3]],
      ),
    };
    stateA = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: discard2,
        nextRemainingDeck: [sharedDeck[4], sharedDeck[5], sharedDeck[6], sharedDeck[7]],
      } as GameAction,
    ]).state;
    stateA = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' }).state;

    expect(stateA.pendingTransferOut!).toHaveLength(2);
    // Accumulated previewDealt across 2 waterfalls = [s1,s2,s3,s4].
    expect(stateA.pendingTransferOutPreviewDealt!.map(c => c.id)).toEqual([
      's1', 's2', 's3', 's4',
    ]);
  });

  // -------------------------------------------------------------------------
  // 13. Persistence round-trip
  // -------------------------------------------------------------------------

  it('Persistence round-trip: serializeGameState includes both pendingTransferOut and pendingTransferOutPreviewDealt', async () => {
    const { serializeGameState } = await import('../persistence');
    const stateA = makeMpState('A', {
      pendingTransferOut: [makeShared('staged-1'), makeShared('staged-2')],
      pendingTransferOutPreviewDealt: [makeShared('preview-1'), makeShared('preview-2'), makeShared('preview-3')],
    });
    const snap = serializeGameState(stateA);

    expect(snap.pendingTransferOut).toBeDefined();
    expect(snap.pendingTransferOut).toHaveLength(2);
    expect(snap.pendingTransferOut!.map((c: GameCardData) => c.id)).toEqual([
      'staged-1',
      'staged-2',
    ]);
    expect(snap.pendingTransferOutPreviewDealt).toBeDefined();
    expect(snap.pendingTransferOutPreviewDealt!.map((c: GameCardData) => c.id)).toEqual([
      'preview-1',
      'preview-2',
      'preview-3',
    ]);

    const stateSP: GameState = {
      ...createInitialGameState(),
      pendingTransferOut: null,
      pendingTransferOutPreviewDealt: null,
    };
    const snapSP = serializeGameState(stateSP);
    expect(snapSP.pendingTransferOut).toBeNull();
    expect(snapSP.pendingTransferOutPreviewDealt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 14. Drift handling: previewDealt cards B doesn't have are skipped
  // -------------------------------------------------------------------------

  it('RECEIVE_TRANSFER silently skips previewDealt ids that are not in our deck (drift tolerance)', () => {
    // B's deck = [s2, s3]. A claims to have dealt [s1, s2] (but s1 isn't in
    // B's deck — could be a card that was previously transferred from B to A
    // and is now being consumed back by A's preview). B should silently
    // remove only s2 and skip s1.
    let stateB = makeMpState('B', {
      remainingDeck: [makeShared('s2'), makeShared('s3')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
    });

    stateB = drain(stateB, [
      {
        type: 'MULTIPLAYER_RECEIVE_TRANSFER',
        cards: [],
        previewDealt: [makeShared('s1'), makeShared('s2')],
        seq: 1,
      },
    ]).state;

    // Only s2 was removed; s1 silently skipped.
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['s3']);
  });
});
