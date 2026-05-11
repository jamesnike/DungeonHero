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
});
