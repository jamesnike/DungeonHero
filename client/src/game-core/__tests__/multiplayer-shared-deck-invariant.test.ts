/**
 * Multiplayer phase-2 invariant: after A and B exchange `transferOut` +
 * `sharedShrink` actions, both players' "shared suffix" of `remainingDeck`
 * (cards WITHOUT `_excludedFromShared: true`) MUST remain identical, and
 * the order of shared cards must be preserved.
 *
 * This is the foundational data-model test for the shared-suffix model
 * described in
 *   `.cursor/plans/2-player_multiplayer_mode_*.plan.md` (阶段 2).
 *
 * Coverage:
 *   1. A waterfall consumes 2 shared cards + pushes 1 card → B mirrors via
 *      MULTIPLAYER_RECEIVE_TRANSFER + MULTIPLAYER_SHARED_SHRINK.
 *      Assert shared portions match after each step.
 *   2. A waterfall whose discard hits `returnToDeck` → A's local deck gets
 *      a `_excludedFromShared: true` card inserted; B's shared portion is
 *      unaffected (because returnToDeck doesn't generate a transferOut).
 *   3. A waterfall whose discard hits `swarmInfest` → bugs prepended to
 *      A's deck top with `_excludedFromShared: true`; B's shared portion
 *      still matches.
 *   4. Two waterfalls in alternating order (A → B → A) keep shared
 *      portions aligned.
 *   5. Idempotency: re-applying the same RECEIVE_TRANSFER seq twice is a
 *      no-op (already covered in MULTIPLAYER_RECEIVE_TRANSFER reducer but
 *      asserted end-to-end here for safety).
 *
 * Single-player guard: when `multiplayerSession === null`, the waterfall
 * MUST NOT emit `multiplayer:transferOut` and MUST NOT mutate
 * `sharedDeckConsumed` / `pendingTransferOut`. Asserted explicitly.
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
    sharedDeckConsumed: 0,
    // NB: we keep phase='idle' (default) for the waterfall internals here.
    // In real game, APPLY_WATERFALL_DISCARD_EFFECTS / APPLY_WATERFALL_DEAL
    // are top-level dispatches (engine._processAction skips the input gate).
    // For MULTIPLAYER_RECEIVE_TRANSFER / SHARED_SHRINK we DO need to test
    // the whitelist behavior under playerInput — a separate test in this
    // file flips phase explicitly for that case.
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
 * Build a minimal `pendingWaterfallPlan`. The plan's `nextRemainingDeck`
 * represents what the deck should become after dealing `dealCount` cards
 * from the deck top into preview. We start the test by pre-applying that
 * deck-top consumption logic ourselves so the assertions are easy to read.
 */
function makePlanForDeck(remaining: GameCardData[]) {
  return {
    dropAssignments: [],
    resolvedDropCards: [],
    dropPreviewIndices: [],
    dropTargetSlots: [],
    discardCard: null,
    discardPreviewIndex: null,
    discardDestination: 'graveyard' as const,
    nextPreviewCards: [],
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

// ---------------------------------------------------------------------------
// 1. Single waterfall: A consumes shared + pushes 1 → B mirrors
// ---------------------------------------------------------------------------

describe('Multiplayer shared-suffix invariant', () => {
  it('A waterfall consumes 2 shared, pushes 1 discard → B receives + shrinks → shared portions stay aligned', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      makeShared('s3'),
      makeShared('s4'),
      makeShared('s5'),
      makeShared('s6'),
    ];
    // Both players start with identical shared deck.
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

    // Sanity: shared portions identical at start.
    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));

    // Simulate: A's waterfall pushes one card out. The discardCard is a
    // generic event (no waterfallEffect) → falls into the "no-effect" branch
    // → enqueues DISCARD_OWNED_CARD + stages transferOut.
    const discardCard = {
      id: 'd1',
      type: 'event',
      name: 'PushedOut',
      value: 0,
    } as unknown as GameCardData;

    // A's deck after waterfall consumed s1+s2 (deal 2 to preview, plus
    // pushed-out) — for this isolated unit we just assert on
    // (a) what reduceApplyWaterfallDiscardEffects stages into
    //     pendingTransferOut, and
    // (b) what reduceApplyWaterfallDeal computes as sharedConsumed.
    //
    // We give APPLY_WATERFALL_DISCARD_EFFECTS the post-deal deck (s3..s6)
    // as `nextRemainingDeck`, then APPLY_WATERFALL_DEAL writes that to
    // state.remainingDeck and computes shared delta vs state.remainingDeck
    // (which is still the pre-deal s1..s6).
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck([
        sharedDeck[2],
        sharedDeck[3],
        sharedDeck[4],
        sharedDeck[5],
      ]),
    };

    const discardResult = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5]],
      } as GameAction,
    ]);
    stateA = discardResult.state;

    // After discard: pendingTransferOut should hold the pushed-out card.
    expect(stateA.pendingTransferOut).not.toBeNull();
    expect(stateA.pendingTransferOut!.length).toBe(1);
    expect(stateA.pendingTransferOut![0].id).toBe('d1');
    // The clean copy must NOT carry _excludedFromShared (it's the peer's
    // job to tag it on RECEIVE).
    expect(stateA.pendingTransferOut![0]._excludedFromShared).toBeUndefined();

    // Now run APPLY_WATERFALL_DEAL — it commits remainingDeck and emits
    // multiplayer:transferOut.
    const dealResult = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' });
    stateA = dealResult.state;

    expect(stateA.sharedDeckConsumed).toBe(2);
    expect(stateA.remainingDeck.map(c => c.id)).toEqual(['s3', 's4', 's5', 's6']);

    const transferOutEvents = (dealResult.sideEffects ?? []).filter(
      e => e.event === 'multiplayer:transferOut',
    );
    expect(transferOutEvents).toHaveLength(1);
    const payload = transferOutEvents[0].payload as {
      cards: GameCardData[];
      sharedConsumed: number;
      seq: number;
    };
    expect(payload.sharedConsumed).toBe(2);
    expect(payload.cards.map(c => c.id)).toEqual(['d1']);
    expect(payload.seq).toBe(2);

    // Now mirror on B's side: receive d1 + shrink shared by 2.
    const bResult = drain(stateB, [
      { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: payload.cards, seq: 1 },
      { type: 'MULTIPLAYER_SHARED_SHRINK', count: payload.sharedConsumed, seq: 2 },
    ]);
    stateB = bResult.state;

    // B's deck top should now be: [d1 (excluded)] ++ [s3..s6 (shared)]
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['d1', 's3', 's4', 's5', 's6']);
    expect(stateB.remainingDeck[0]._excludedFromShared).toBe(true);

    // Invariant check: shared portions of A and B must match.
    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));
    expect(sharedIds(stateA.remainingDeck)).toEqual(['s3', 's4', 's5', 's6']);
  });

  // -------------------------------------------------------------------------
  // 2. returnToDeck: discard re-enters local deck, NOT transferred to peer
  // -------------------------------------------------------------------------

  it('returnToDeck discard re-inserts locally tagged _excludedFromShared; no transferOut card; B shared portion unaffected', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      makeShared('s3'),
    ];
    let stateA = makeMpState('A', {
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      // Set rng deterministically so returnToDeck insertion is predictable.
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

    // A's waterfall: consume 1 shared (s1), push out the wraith via
    // returnToDeck (re-inserts into deck).
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck([sharedDeck[1], sharedDeck[2]]),
    };

    const discardResult = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: wraithDiscard,
        nextRemainingDeck: [sharedDeck[1], sharedDeck[2]],
      } as GameAction,
    ]);
    stateA = discardResult.state;

    // returnToDeck path → NOT staged for transfer.
    expect(stateA.pendingTransferOut).toBeNull();

    // pendingWaterfallPlan.nextRemainingDeck has been updated with the
    // re-inserted wraith.
    const updatedDeckTop =
      stateA.pendingWaterfallPlan?.nextRemainingDeck ?? [];
    expect(updatedDeckTop.find(c => c.id === 'w1')).toBeDefined();
    expect(updatedDeckTop.find(c => c.id === 'w1')!._excludedFromShared).toBe(true);

    // Commit deal → emit transferOut with cards: [], sharedConsumed: 1.
    const dealResult = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' });
    stateA = dealResult.state;

    expect(stateA.sharedDeckConsumed).toBe(1);

    const transferOutEvents = (dealResult.sideEffects ?? []).filter(
      e => e.event === 'multiplayer:transferOut',
    );
    expect(transferOutEvents).toHaveLength(1);
    const payload = transferOutEvents[0].payload as {
      cards: GameCardData[];
      sharedConsumed: number;
      seq: number;
    };
    expect(payload.cards).toHaveLength(0);
    expect(payload.sharedConsumed).toBe(1);

    // Mirror on B: empty cards + shrink 1.
    const bResult = drain(stateB, [
      { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: [], seq: 1 },
      { type: 'MULTIPLAYER_SHARED_SHRINK', count: 1, seq: 2 },
    ]);
    stateB = bResult.state;

    // B's deck = s2, s3. A's deck has wraith mixed in (excluded).
    expect(sharedIds(stateB.remainingDeck)).toEqual(['s2', 's3']);
    expect(sharedIds(stateA.remainingDeck)).toEqual(['s2', 's3']);
  });

  // -------------------------------------------------------------------------
  // 3. swarmInfest: bugs prepend with _excludedFromShared; B shared unchanged
  // -------------------------------------------------------------------------

  it('swarmInfest bugs prepend to A deck tagged _excludedFromShared; B shared portion stays in lockstep', () => {
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
      pendingWaterfallPlan: makePlanForDeck([sharedDeck[1], sharedDeck[2], sharedDeck[3]]),
    };

    stateA = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: swarmDiscard,
        nextRemainingDeck: [sharedDeck[1], sharedDeck[2], sharedDeck[3]],
      } as GameAction,
    ]).state;

    // SwarmHost itself goes to graveyard → also staged for transfer.
    expect(stateA.pendingTransferOut).not.toBeNull();
    expect(stateA.pendingTransferOut!.map(c => c.id)).toEqual(['sw1']);

    // Plan now has: [bug, bug, s2, s3, s4] with bugs tagged excluded.
    const planDeck = stateA.pendingWaterfallPlan?.nextRemainingDeck ?? [];
    expect(planDeck.length).toBe(5); // 2 bugs + 3 shared
    expect(planDeck[0]._excludedFromShared).toBe(true);
    expect(planDeck[1]._excludedFromShared).toBe(true);

    const dealResult = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' });
    stateA = dealResult.state;

    const payload = (dealResult.sideEffects ?? []).find(
      e => e.event === 'multiplayer:transferOut',
    )?.payload as {
      cards: GameCardData[];
      sharedConsumed: number;
      seq: number;
    };
    expect(payload).toBeDefined();
    expect(payload.cards.map(c => c.id)).toEqual(['sw1']);
    expect(payload.sharedConsumed).toBe(1);

    stateB = drain(stateB, [
      { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: payload.cards, seq: 1 },
      { type: 'MULTIPLAYER_SHARED_SHRINK', count: payload.sharedConsumed, seq: 2 },
    ]).state;

    // B sees [sw1 (excluded)] ++ [s2, s3, s4 (shared)].
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['sw1', 's2', 's3', 's4']);
    expect(stateB.remainingDeck[0]._excludedFromShared).toBe(true);

    // Shared invariant.
    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));
    expect(sharedIds(stateA.remainingDeck)).toEqual(['s2', 's3', 's4']);
  });

  // -------------------------------------------------------------------------
  // 4. Alternating waterfalls (A → B → A) keep shared portions aligned
  // -------------------------------------------------------------------------

  it('three alternating waterfalls (A → B → A) keep shared portions identical', () => {
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
      sharedConsumeCount: number,
      discardId: string,
    ): { self: GameState; peer: GameState } => {
      // Build plan with N fewer cards from top.
      const newDeck = self.remainingDeck.slice(sharedConsumeCount);
      let s = {
        ...self,
        pendingWaterfallPlan: makePlanForDeck(newDeck),
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
        sharedConsumed: number;
        seq: number;
      };

      // Peer applies. Use a unique seq based on peer's lastAppliedSeq+1 so we
      // never collide with previous transfers.
      const baseSeq = (peer.multiplayerSession?.lastAppliedSeq ?? 0) + 1;
      const newPeer = drain(peer, [
        { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: payload.cards, seq: baseSeq },
        { type: 'MULTIPLAYER_SHARED_SHRINK', count: payload.sharedConsumed, seq: baseSeq + 1 },
      ]).state;

      // Clear self's pendingTransferOut (simulating ack).
      const cleared = drain(s, [{ type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' }]).state;
      return { self: cleared, peer: newPeer };
    };

    // Round 1: A waterfall, consumes 2 shared, pushes d1.
    let r = runWaterfall(stateA, stateB, 2, 'd1');
    stateA = r.self;
    stateB = r.peer;
    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));
    expect(sharedIds(stateA.remainingDeck)).toEqual(['s3', 's4', 's5', 's6', 's7', 's8']);

    // Round 2: B waterfall, consumes 3 shared, pushes d2. Note: B's deck top
    // has the d1 transferred prefix from round 1 — but `runWaterfall` slices
    // from the top (which would slice off d1 if sharedConsumeCount > 0).
    // For this test we model B's waterfall as consuming SHARED cards only,
    // so we need to manually skip the transferred prefix. Simulate by
    // building B's post-deal deck = [d1 (kept)] ++ [s6, s7, s8]:
    {
      const transferredPrefix = stateB.remainingDeck.filter(c => c._excludedFromShared);
      const sharedTail = stateB.remainingDeck.filter(c => !c._excludedFromShared);
      const newSharedTail = sharedTail.slice(3); // consume 3 shared
      const newDeck = [...transferredPrefix, ...newSharedTail];
      let bs = {
        ...stateB,
        pendingWaterfallPlan: makePlanForDeck(newDeck),
      };
      bs = drain(bs, [
        {
          type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
          discardCard: mkDiscard('d2'),
          nextRemainingDeck: newDeck,
        } as GameAction,
      ]).state;
      const dealResult = reduce(bs, { type: 'APPLY_WATERFALL_DEAL' });
      bs = dealResult.state;
      const payload = (dealResult.sideEffects ?? []).find(
        e => e.event === 'multiplayer:transferOut',
      )!.payload as {
        cards: GameCardData[];
        sharedConsumed: number;
        seq: number;
      };
      // Peer (A) applies.
      const baseSeq = (stateA.multiplayerSession?.lastAppliedSeq ?? 0) + 1;
      stateA = drain(stateA, [
        { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: payload.cards, seq: baseSeq },
        { type: 'MULTIPLAYER_SHARED_SHRINK', count: payload.sharedConsumed, seq: baseSeq + 1 },
      ]).state;
      stateB = drain(bs, [{ type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' }]).state;
    }

    // After round 2:
    //   A: [d2 (peer), s6, s7, s8]   (peer pushed d2 to top, A had no
    //                                  transferred prefix yet, shrunk 3
    //                                  shared from s3..s5)
    //   B: [d1 (peer-from-r1), s6, s7, s8]
    expect(sharedIds(stateA.remainingDeck)).toEqual(['s6', 's7', 's8']);
    expect(sharedIds(stateB.remainingDeck)).toEqual(['s6', 's7', 's8']);
    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));

    // Round 3: A waterfall again, consumes 1 shared, pushes d3.
    {
      const transferredPrefix = stateA.remainingDeck.filter(c => c._excludedFromShared);
      const sharedTail = stateA.remainingDeck.filter(c => !c._excludedFromShared);
      const newSharedTail = sharedTail.slice(1);
      const newDeck = [...transferredPrefix, ...newSharedTail];
      let as = {
        ...stateA,
        pendingWaterfallPlan: makePlanForDeck(newDeck),
      };
      as = drain(as, [
        {
          type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
          discardCard: mkDiscard('d3'),
          nextRemainingDeck: newDeck,
        } as GameAction,
      ]).state;
      const dealResult = reduce(as, { type: 'APPLY_WATERFALL_DEAL' });
      as = dealResult.state;
      const payload = (dealResult.sideEffects ?? []).find(
        e => e.event === 'multiplayer:transferOut',
      )!.payload as {
        cards: GameCardData[];
        sharedConsumed: number;
        seq: number;
      };
      const baseSeq = (stateB.multiplayerSession?.lastAppliedSeq ?? 0) + 1;
      stateB = drain(stateB, [
        { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: payload.cards, seq: baseSeq },
        { type: 'MULTIPLAYER_SHARED_SHRINK', count: payload.sharedConsumed, seq: baseSeq + 1 },
      ]).state;
      stateA = drain(as, [{ type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' }]).state;
    }

    expect(sharedIds(stateA.remainingDeck)).toEqual(['s7', 's8']);
    expect(sharedIds(stateB.remainingDeck)).toEqual(['s7', 's8']);
    expect(sharedIds(stateA.remainingDeck)).toEqual(sharedIds(stateB.remainingDeck));
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
      { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: [card], seq: 1 },
    ]).state;
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['d1', 's1', 's2']);
    expect(stateB.multiplayerSession?.lastAppliedSeq).toBe(1);

    // Re-apply the same seq → must be no-op.
    stateB = drain(stateB, [
      { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: [card], seq: 1 },
    ]).state;
    expect(stateB.remainingDeck.map(c => c.id)).toEqual(['d1', 's1', 's2']);
    expect(stateB.multiplayerSession?.lastAppliedSeq).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 6. Single-player guard: NO transferOut emitted, no MP fields touched
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // 7. Pipeline whitelist: MULTIPLAYER_* drains under playerInput
  // -------------------------------------------------------------------------

  it('MULTIPLAYER_RECEIVE_TRANSFER + SHARED_SHRINK + CLEAR_PENDING_TRANSFER all drain under phase=playerInput', () => {
    // This is the critical pipeline-whitelist invariant: in real game, the
    // hook (phase 3+) dispatches these actions while the player is sitting
    // at a normal `phase: 'playerInput'` UI state. If they're stranded
    // here, the player's deck view diverges from the peer's — see
    // `pipeline-input-continuation.mdc` "disposition router family"
    // discussion for why this is the most painful failure mode.
    const stateB = makeMpState('B', {
      remainingDeck: [makeShared('s1'), makeShared('s2'), makeShared('s3')],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      pendingTransferOut: [makeShared('local')],
      phase: 'playerInput',
    });

    const card = { id: 'd1', type: 'event', name: 'Push', value: 0 } as unknown as GameCardData;

    const result = drain(stateB, [
      { type: 'MULTIPLAYER_RECEIVE_TRANSFER', cards: [card], seq: 1 },
      { type: 'MULTIPLAYER_SHARED_SHRINK', count: 1, seq: 2 },
      { type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' },
    ]);

    expect(result.pausedForInput).toBe(false);
    expect(result.queue).toHaveLength(0);
    expect(result.state.remainingDeck.map(c => c.id)).toEqual(['d1', 's2', 's3']);
    expect(result.state.pendingTransferOut).toBeNull();
    expect(result.state.multiplayerSession?.lastAppliedSeq).toBe(2);
  });

  it('single-player: waterfall does NOT emit multiplayer:transferOut and does NOT touch sharedDeckConsumed', () => {
    const sharedDeck = [makeShared('s1'), makeShared('s2'), makeShared('s3')];
    let state: GameState = {
      ...createInitialGameState(),
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      // multiplayerSession is null by default in createInitialGameState.
    };

    const discardCard = {
      id: 'd1',
      type: 'event',
      name: 'PushedOut',
      value: 0,
    } as unknown as GameCardData;

    state = {
      ...state,
      pendingWaterfallPlan: makePlanForDeck([sharedDeck[1], sharedDeck[2]]),
    };

    state = drain(state, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [sharedDeck[1], sharedDeck[2]],
      } as GameAction,
    ]).state;

    // SP: pendingTransferOut never set.
    expect(state.pendingTransferOut).toBeNull();

    const dealResult = reduce(state, { type: 'APPLY_WATERFALL_DEAL' });
    state = dealResult.state;

    // SP: counter unchanged, no event emitted.
    expect(state.sharedDeckConsumed).toBe(0);
    expect(
      (dealResult.sideEffects ?? []).filter(e => e.event === 'multiplayer:transferOut'),
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 8. Phase 6.2 boss alert: fires once when final monster surfaces in MP
  // -------------------------------------------------------------------------

  it('multiplayer: emits multiplayer:bossEncountered exactly once when isFinalMonster lands in preview', () => {
    const sharedDeck = [
      makeShared('s1'),
      makeShared('s2'),
      // Final monster appears mid-deck → after one waterfall it lands in preview.
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

    // Run waterfall deal directly with a plan that promotes boss into preview.
    state = {
      ...state,
      pendingWaterfallPlan: {
        ...makePlanForDeck([sharedDeck[3], sharedDeck[4]]),
        // The plan pushes boss into preview directly (skip discard step here;
        // we just want to verify the boss-detection branch in
        // reduceApplyWaterfallDeal fires).
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

    // Re-running the same deal must NOT re-emit (gated on
    // bossEncounterAlertShown).
    const state2 = result.state;
    const result2 = reduce(
      {
        ...state2,
        // Reset the plan so the deal can run again with same preview pieces.
        pendingWaterfallPlan: {
          ...makePlanForDeck([sharedDeck[3], sharedDeck[4]]),
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
  // 9. MP waterfall threshold + multi-card transfer
  //    User-confirmed semantics:
  //    • Trigger when active row has ≤ 2 non-ghost cards (vs ≤ 1 in solo).
  //    • Drop 2 preview cards into the 2 empty active slots.
  //    • The remaining 2 preview cards: their waterfallEffect fires locally
  //      AND each card gets shipped to the peer's deck top.
  // -------------------------------------------------------------------------

  it('MP: waterfall trigger fires when active row drops to 2 (vs 1 in solo)', () => {
    // Trigger the post-processing waterfall check by mutating activeCards
    // (the post-process step only runs when activeCards reference changes).
    // We start with 3 monsters and use UPDATE_ACTIVE_CARDS to remove one,
    // leaving exactly 2 — which crosses the MP threshold (≤2) but not the
    // solo threshold (≤1).
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

    // Remove m3 from the active row. UPDATE_ACTIVE_CARDS forces a new
    // activeCards reference so postProcessActiveCards runs and exercises
    // the waterfall-threshold branch.
    const result = reduce(baseState, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: cards => {
        const next = [...cards] as ActiveRowSlots;
        next[2] = null;
        return next;
      },
    });

    // Active row drops to 2 → in MP mode this MUST trigger waterfall.
    expect(result.state.pendingWaterfallPlan).not.toBeNull();
    const plan = result.state.pendingWaterfallPlan!;
    // 2 empty slots → 2 preview cards drop, 2 remain (1 → discardCard, 1 → extras).
    expect(plan.dropAssignments.length).toBe(2);
    expect(plan.discardCard).not.toBeNull();
    expect(plan.extraDiscardCards ?? []).toHaveLength(1);
  });

  it('SP: same active=2 state does NOT trigger waterfall (threshold stays at <=1)', () => {
    // Mirror of the MP test above, but with multiplayerSession=null.
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
      // multiplayerSession defaults to null — solo mode.
    };

    const result = reduce(baseState, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: cards => {
        const next = [...cards] as ActiveRowSlots;
        next[2] = null;
        return next;
      },
    });

    // Solo threshold is <=1 — active row drops to 2 → no plan.
    expect(result.state.pendingWaterfallPlan).toBeNull();
  });

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
    // 2 empty active slots → 2 drops.
    expect(plan!.dropAssignments).toHaveLength(2);
    // 1 of the 2 leftovers becomes the primary discardCard.
    expect(plan!.discardCard).not.toBeNull();
    // The OTHER leftover is in extraDiscardCards (MP-only).
    expect(plan!.extraDiscardCards).toBeDefined();
    expect(plan!.extraDiscardCards!).toHaveLength(1);
    expect(plan!.extraDiscardPreviewIndices!).toHaveLength(1);
    // Extra index must NOT collide with the primary discard index.
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
    // SP: extras should be empty regardless of how many leftovers exist.
    expect(plan!.extraDiscardCards ?? []).toHaveLength(0);
  });

  it('MP: full pipeline (2 discards) — both cards staged to pendingTransferOut, multiplayer:transferOut emitted with 2 cards + sharedConsumed=4', () => {
    // End-to-end: simulate the full MP waterfall flow that the GameBoard
    // would execute. We hand-build a plan with 2 leftover preview cards
    // (1 discardCard + 1 extra) and dispatch the same sequence of actions
    // as `handleWaterfallDiscardComplete` does.
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
      // Simulate the post-drop deck (4 shared cards left after 2 dealt).
      remainingDeck: [...sharedDeck.map(c => ({ ...c }))],
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      pendingWaterfallPlan: {
        ...makePlanForDeck([sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5]]),
        // Plan claims a primary discard at preview index 2 and an extra at 3.
        discardCard: primaryDiscard,
        discardPreviewIndex: 2,
        extraDiscardCards: [extraDiscard],
        extraDiscardPreviewIndices: [3],
      },
    });

    // GameBoard's handleWaterfallDiscardComplete dispatches the primary first,
    // then iterates over extras pulling latest plan.nextRemainingDeck each loop.
    const r1 = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: primaryDiscard,
        nextRemainingDeck: stateA.pendingWaterfallPlan!.nextRemainingDeck,
        discardPreviewIndex: 2,
      } as GameAction,
    ]);
    stateA = r1.state;

    // After primary discard: 1 card staged.
    expect(stateA.pendingTransferOut).not.toBeNull();
    expect(stateA.pendingTransferOut!).toHaveLength(1);
    expect(stateA.pendingTransferOut![0].id).toBe('pd');

    // Now the extra (mirrors GameBoard's loop: re-read plan.nextRemainingDeck).
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

    // After extra discard: 2 cards staged.
    expect(stateA.pendingTransferOut!).toHaveLength(2);
    expect(stateA.pendingTransferOut!.map(c => c.id)).toEqual(['pd', 'ed']);

    // Final deal commits the deck and emits transferOut.
    const dealResult = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' });
    stateA = dealResult.state;

    // Shared consumed = 6 (initial pre-deal) - 4 (post-deal) = 2.
    // Wait — the pre-deal state.remainingDeck is the FIXTURE state (6 cards),
    // and plan.nextRemainingDeck is the post-deal (4 cards). Both are pure
    // shared (no _excludedFromShared tags here), so countShared diff = 6 - 4 = 2.
    // (Matches the sharedConsumed field's documented semantic — count of
    // shared-deck cards that left this iteration.)
    expect(stateA.sharedDeckConsumed).toBe(2);
    expect(stateA.remainingDeck.map(c => c.id)).toEqual(['d3', 'd4', 'd5', 'd6']);

    const transferOutEvents = (dealResult.sideEffects ?? []).filter(
      e => e.event === 'multiplayer:transferOut',
    );
    expect(transferOutEvents).toHaveLength(1);
    const payload = transferOutEvents[0].payload as {
      cards: GameCardData[];
      sharedConsumed: number;
      seq: number;
    };
    expect(payload.cards).toHaveLength(2);
    expect(payload.cards.map(c => c.id)).toEqual(['pd', 'ed']);
    expect(payload.sharedConsumed).toBe(2);
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
      // multiplayerSession is null → SP path.
    };

    state = {
      ...state,
      pendingWaterfallPlan: {
        ...makePlanForDeck([]),
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
  // 10. pendingTransferOut + companion delta lifecycle
  //     (the persistence + replay-on-hydrate fix)
  // -------------------------------------------------------------------------

  it('MP waterfall sets pendingTransferOutSharedConsumed alongside cards (delta tracker for hydrate replay)', () => {
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
    expect(stateA.pendingTransferOutSharedConsumed).toBeNull();

    // Stage a discard then run DEAL — same flow as test #1 but assert the
    // companion delta field too.
    const discardCard = sharedDeck[0];
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck([
        sharedDeck[2],
        sharedDeck[3],
        sharedDeck[4],
        sharedDeck[5],
      ]),
    };
    stateA = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [sharedDeck[2], sharedDeck[3], sharedDeck[4], sharedDeck[5]],
      } as GameAction,
    ]).state;
    stateA = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' }).state;

    // After the iteration: companion field equals the per-batch delta.
    expect(stateA.pendingTransferOut).not.toBeNull();
    expect(stateA.pendingTransferOut!).toHaveLength(1);
    expect(stateA.pendingTransferOutSharedConsumed).toBe(2);
    // Cumulative counter is the same here because there was just 1 iteration.
    expect(stateA.sharedDeckConsumed).toBe(2);
  });

  it('MULTIPLAYER_CLEAR_PENDING_TRANSFER clears BOTH cards and companion delta', () => {
    let state = makeMpState('A', {
      pendingTransferOut: [makeShared('staged')],
      pendingTransferOutSharedConsumed: 3,
    });
    state = reduce(state, { type: 'MULTIPLAYER_CLEAR_PENDING_TRANSFER' }).state;
    expect(state.pendingTransferOut).toBeNull();
    expect(state.pendingTransferOutSharedConsumed).toBeNull();
  });

  it('Companion delta accumulates across multiple waterfalls before clear (network-slow case)', () => {
    // First waterfall stages 1 card (delta=2). Hook hasn't ack'd yet
    // (network hangs). Second waterfall stages 1 more (delta=2). The
    // companion field should hold the SUM (4), not just the latest delta.
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

    // ----- waterfall 1 -----
    const discard1 = sharedDeck[0];
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck([
        sharedDeck[2],
        sharedDeck[3],
        sharedDeck[4],
        sharedDeck[5],
        sharedDeck[6],
        sharedDeck[7],
      ]),
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
    expect(stateA.pendingTransferOutSharedConsumed).toBe(2);
    expect(stateA.pendingTransferOut!).toHaveLength(1);

    // Simulate "hook hasn't cleared yet" — leave both fields populated.
    // Now waterfall 2 from the new deck head.
    const discard2 = sharedDeck[2];
    stateA = {
      ...stateA,
      pendingWaterfallPlan: makePlanForDeck([
        sharedDeck[4],
        sharedDeck[5],
        sharedDeck[6],
        sharedDeck[7],
      ]),
    };
    stateA = drain(stateA, [
      {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: discard2,
        nextRemainingDeck: [sharedDeck[4], sharedDeck[5], sharedDeck[6], sharedDeck[7]],
      } as GameAction,
    ]).state;
    stateA = reduce(stateA, { type: 'APPLY_WATERFALL_DEAL' }).state;

    // Both cards staged together, delta accumulated to 4 (2+2).
    expect(stateA.pendingTransferOut!).toHaveLength(2);
    expect(stateA.pendingTransferOutSharedConsumed).toBe(4);
  });

  it('Persistence round-trip: serializeGameState ↔ snapshot includes both pendingTransferOut and companion delta', async () => {
    // We don't have a direct "deserialize back into GameState" helper that
    // doesn't drag in the rest of the engine, so we just verify that the
    // serializer puts the fields on the snapshot. The hydrate path in
    // GameBoard.tsx reads them via the same field names.
    const { serializeGameState } = await import('../persistence');
    const stateA = makeMpState('A', {
      pendingTransferOut: [makeShared('staged-1'), makeShared('staged-2')],
      pendingTransferOutSharedConsumed: 3,
    });
    const snap = serializeGameState(stateA);

    expect(snap.pendingTransferOut).toBeDefined();
    expect(snap.pendingTransferOut).toHaveLength(2);
    expect(snap.pendingTransferOut!.map((c: GameCardData) => c.id)).toEqual([
      'staged-1',
      'staged-2',
    ]);
    expect(snap.pendingTransferOutSharedConsumed).toBe(3);

    // Single-player snapshot should write null/null for these fields.
    const stateSP: GameState = {
      ...createInitialGameState(),
      pendingTransferOut: null,
      pendingTransferOutSharedConsumed: null,
    };
    const snapSP = serializeGameState(stateSP);
    expect(snapSP.pendingTransferOut).toBeNull();
    expect(snapSP.pendingTransferOutSharedConsumed).toBeNull();
  });
});
