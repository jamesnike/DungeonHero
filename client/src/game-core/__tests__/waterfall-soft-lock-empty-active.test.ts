/**
 * Soft-lock regression: 瀑流重置 / 迷宫回溯 with empty preview + empty deck.
 *
 * Bug history (2026-04): when the player used 瀑流重置 (cascadeReset) or
 * 迷宫回溯 (return-dungeon-bottom) while both `previewCards` and
 * `remainingDeck` were empty, the resulting waterfall could only refill the
 * preview row from the just-emptied deck — it had no preview cards to drop
 * into the now-empty active row. The active row stayed empty.
 *
 * On every subsequent player action `postProcessActiveCards` was supposed to
 * re-trigger another waterfall, but its early-return on
 * `result.state.activeCards === prevState.activeCards` short-circuited as
 * long as the active row stayed empty. The cards stranded in the preview
 * never cascaded into the active row → soft-lock.
 *
 * Fix: `reduceCompleteWaterfall` (rules/waterfall.ts) now self-checks after
 * clearing the just-completed plan: if the active row is still empty but
 * the preview row OR remaining deck still has cards, it recomputes the
 * plan inline and emits another `waterfall:planReady` so the UI starts
 * another animation cycle.
 *
 * Termination: each re-trigger either drops cards into the active row
 * (countActive > 0 → condition fails next time) or computeWaterfallDropPlan
 * returns null. Victory at the very end is still handled by the existing
 * `shouldDeclareVictory` branch in reduceApplyWaterfallDeal.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { computeWaterfallDropPlan } from '../rules/waterfall';
import { STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(id: string, hp = 5): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: 1,
    image: '',
    hp,
    maxHp: hp,
    attack: 1,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
  } as GameCardData;
}

function makeCascadeResetCard(suffix = '-1'): GameCardData {
  return {
    id: `magic-cascadeReset${suffix}`,
    type: 'magic',
    name: '瀑流重置',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'description-not-routing-key',
  } as GameCardData;
}

function makeReshuffleCard(suffix = '-1'): GameCardData {
  // The schema dispatcher resolves effectId via getStarterBaseId, which
  // strips `-pick-\d+(-base36)?` suffixes. So suffix MUST start with a digit
  // segment after `-pick-` — `-1` works, arbitrary words like `-corner` do not.
  return {
    id: `${STARTER_CARD_IDS.reshuffle}-pick${suffix}`,
    type: 'magic',
    name: '迷宫回溯',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: 'test',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  } as GameCardData;
}

function activeRow(...cards: Array<GameCardData | null>): ActiveRowSlots {
  return [...cards, ...Array(Math.max(0, 4 - cards.length)).fill(null)] as ActiveRowSlots;
}

function emptyRow(): ActiveRowSlots {
  return [null, null, null, null] as ActiveRowSlots;
}

function countSideEffect(
  result: { sideEffects: ReadonlyArray<{ event: string; payload: unknown }> },
  event: string,
): number {
  return result.sideEffects.filter(e => e.event === event).length;
}

// ---------------------------------------------------------------------------
// Unit test: reduceCompleteWaterfall directly
// ---------------------------------------------------------------------------

describe('reduceCompleteWaterfall — soft-lock guard', () => {
  it('active 行空 + preview 有卡 + 牌堆空 → 自动 emit 第二轮 waterfall:planReady', () => {
    const A = makeMonster('A');
    const B = makeMonster('B');

    // Simulate post-deal state: pendingWaterfallPlan set (about to be cleared),
    // active row empty, preview filled from the deck, deck now empty.
    const state = makeState({
      activeCards: emptyRow(),
      previewCards: activeRow(A, B),
      remainingDeck: [],
      pendingWaterfallPlan: {
        // Content doesn't matter — reduceCompleteWaterfall just clears it.
        dropAssignments: [],
        resolvedDropCards: [],
        dropPreviewIndices: [],
        dropTargetSlots: [],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const result = reduce(state, { type: 'COMPLETE_WATERFALL' });

    expect(result.state.pendingWaterfallPlan).not.toBeNull();
    expect(countSideEffect(result, 'waterfall:planReady')).toBe(1);

    const newPlan = result.state.pendingWaterfallPlan!;
    expect(newPlan.dropTargetSlots.sort()).toEqual([0, 1]);
    expect(newPlan.resolvedDropCards.map(c => c.id).sort()).toEqual(['A', 'B']);
  });

  it('active 行空 + preview 空 + 牌堆有卡 → emit 第二轮 waterfall（refill preview）', () => {
    const C = makeMonster('C');
    const D = makeMonster('D');

    const state = makeState({
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      remainingDeck: [C, D],
      pendingWaterfallPlan: {
        dropAssignments: [],
        resolvedDropCards: [],
        dropPreviewIndices: [],
        dropTargetSlots: [],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const result = reduce(state, { type: 'COMPLETE_WATERFALL' });

    expect(result.state.pendingWaterfallPlan).not.toBeNull();
    expect(countSideEffect(result, 'waterfall:planReady')).toBe(1);
    // No drops (preview was empty), but next-deal will refill preview from deck.
    expect(result.state.pendingWaterfallPlan!.dropAssignments.length).toBe(0);
    expect(result.state.pendingWaterfallPlan!.nextPreviewCards.map(c => c.id).sort()).toEqual(['C', 'D']);
  });

  it('active 行已有卡 → 不重新触发 waterfall', () => {
    const A = makeMonster('A');
    const B = makeMonster('B');

    const state = makeState({
      activeCards: activeRow(A, B),
      previewCards: emptyRow(),
      remainingDeck: [],
      pendingWaterfallPlan: {
        dropAssignments: [],
        resolvedDropCards: [],
        dropPreviewIndices: [],
        dropTargetSlots: [],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const result = reduce(state, { type: 'COMPLETE_WATERFALL' });

    expect(result.state.pendingWaterfallPlan).toBeNull();
    expect(countSideEffect(result, 'waterfall:planReady')).toBe(0);
  });

  it('active 行空 + preview 空 + 牌堆空 → 不重新触发（终局，靠 shouldDeclareVictory 收尾）', () => {
    const state = makeState({
      activeCards: emptyRow(),
      previewCards: emptyRow(),
      remainingDeck: [],
      pendingWaterfallPlan: {
        dropAssignments: [],
        resolvedDropCards: [],
        dropPreviewIndices: [],
        dropTargetSlots: [],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const result = reduce(state, { type: 'COMPLETE_WATERFALL' });

    expect(result.state.pendingWaterfallPlan).toBeNull();
    expect(countSideEffect(result, 'waterfall:planReady')).toBe(0);
  });

  it('gameOver=true → 不重新触发（防止战败/胜利后还播动画）', () => {
    const A = makeMonster('A');

    const state = makeState({
      activeCards: emptyRow(),
      previewCards: activeRow(A),
      remainingDeck: [],
      gameOver: true,
      pendingWaterfallPlan: {
        dropAssignments: [],
        resolvedDropCards: [],
        dropPreviewIndices: [],
        dropTargetSlots: [],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const result = reduce(state, { type: 'COMPLETE_WATERFALL' });

    expect(result.state.pendingWaterfallPlan).toBeNull();
    expect(countSideEffect(result, 'waterfall:planReady')).toBe(0);
  });

  it('active 行有 ghost 但无真实卡 → 仍按"空"处理（countActiveRowSlotsExcludeGhost）', () => {
    const ghost: GameCardData = {
      id: 'ghost-1',
      type: 'building' as any,
      name: '幽灵建筑',
      value: 0,
      image: '',
      isGhost: true,
      hp: 2,
      maxHp: 2,
    } as GameCardData;
    const A = makeMonster('A');

    const state = makeState({
      activeCards: activeRow(ghost) as ActiveRowSlots,
      previewCards: activeRow(A),
      remainingDeck: [],
      pendingWaterfallPlan: {
        dropAssignments: [],
        resolvedDropCards: [],
        dropPreviewIndices: [],
        dropTargetSlots: [],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const result = reduce(state, { type: 'COMPLETE_WATERFALL' });

    expect(result.state.pendingWaterfallPlan).not.toBeNull();
    expect(countSideEffect(result, 'waterfall:planReady')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// End-to-end test: 瀑流重置 corner case
// ---------------------------------------------------------------------------

describe('瀑流重置 (cascadeReset) — empty preview + empty deck soft-lock fix', () => {
  it('preview/牌堆都空时使用 → 触发两次 waterfall，最终 active 行被填回，不再 soft-lock', () => {
    const A = makeMonster('A');
    const B = makeMonster('B');
    const C = makeMonster('C');
    const D = makeMonster('D');
    const card = makeCascadeResetCard('-corner');

    let state = makeState({
      activeCards: activeRow(A, B, C, D),
      previewCards: emptyRow(),
      remainingDeck: [],
      handCards: [card],
      // Force the post-cascade waterfall trigger path to run under the
      // realistic in-game phase so isInputContinuation gating reflects
      // actual production behavior (per pipeline-input-continuation.mdc).
      phase: 'playerInput',
    });

    // ===== Step 1: PLAY_CARD (cascadeReset) =====
    // PLAY_CARD enqueues RESOLVE_MAGIC → FINALIZE_MAGIC_CARD; we use drain to
    // synchronously process the full follow-up chain (all of these actions are
    // in isInputContinuation under phase: 'playerInput').
    // After the chain settles: active is empty, deck has [A,B,C,D] (cascadeReset
    // moved them). postProcessActiveCards detects active changed → empty →
    // emits the FIRST pendingWaterfallPlan + waterfall:planReady.
    const playResult = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }] as GameAction[]);
    state = playResult.state;
    expect(state.activeCards.every(c => !c)).toBe(true);
    expect(state.remainingDeck.length).toBe(4);
    expect(state.pendingWaterfallPlan).not.toBeNull();
    expect(countSideEffect(playResult, 'waterfall:planReady')).toBe(1);

    const firstPlan = state.pendingWaterfallPlan!;
    // First plan: preview was empty, so no drops; deal will refill preview from deck.
    expect(firstPlan.dropAssignments.length).toBe(0);
    expect(firstPlan.nextPreviewCards.length).toBe(4);
    expect(firstPlan.nextRemainingDeck.length).toBe(0);

    // ===== Step 2: drive the first waterfall (drop → deal → complete) =====
    state = reduce(state, { type: 'APPLY_WATERFALL_DROP' }).state;
    // No drops in this plan, active row unchanged.
    expect(state.activeCards.every(c => !c)).toBe(true);

    state = reduce(state, { type: 'APPLY_WATERFALL_DEAL' }).state;
    // Preview filled from deck.
    expect(state.previewCards.filter(c => c).length).toBe(4);
    expect(state.remainingDeck.length).toBe(0);

    // ===== Step 3: COMPLETE_WATERFALL — my fix should auto-trigger 2nd waterfall =====
    let completeResult = reduce(state, { type: 'COMPLETE_WATERFALL' });
    state = completeResult.state;
    expect(state.pendingWaterfallPlan).not.toBeNull(); // not cleared — re-set
    expect(countSideEffect(completeResult, 'waterfall:planReady')).toBe(1);

    const secondPlan = state.pendingWaterfallPlan!;
    expect(secondPlan.dropAssignments.length).toBe(4); // all 4 preview → 4 active slots
    expect(secondPlan.nextPreviewCards.length).toBe(0); // deck empty → no refill

    // ===== Step 4: drive the second waterfall =====
    state = reduce(state, { type: 'APPLY_WATERFALL_DROP' }).state;
    expect(state.activeCards.filter(c => c).length).toBe(4); // active row populated
    expect(state.previewCards.every(c => !c)).toBe(true);

    state = reduce(state, { type: 'APPLY_WATERFALL_DEAL' }).state;
    expect(state.previewCards.every(c => !c)).toBe(true);
    expect(state.remainingDeck.length).toBe(0);

    // ===== Step 5: COMPLETE_WATERFALL — should NOT trigger a third =====
    completeResult = reduce(state, { type: 'COMPLETE_WATERFALL' });
    state = completeResult.state;
    expect(state.pendingWaterfallPlan).toBeNull(); // cleared, no third plan
    expect(countSideEffect(completeResult, 'waterfall:planReady')).toBe(0);

    // Final state: 4 monsters back on the active row, game continues normally.
    const activeIds = state.activeCards.filter(c => c).map(c => c!.id).sort();
    expect(activeIds).toEqual(['A', 'B', 'C', 'D']);
    expect(state.gameOver).toBe(false);
    expect(state.victory).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end test: 迷宫回溯 corner case
// ---------------------------------------------------------------------------

describe('迷宫回溯 (return-dungeon-bottom) — empty preview + empty deck soft-lock fix', () => {
  it('active 仅 1 张 + preview 牌堆都空 → 自动结算 → 两次 waterfall → 不 soft-lock', () => {
    // The schema short-circuit auto-resolves return-dungeon-bottom when
    // exactly 1 active card is present (no modal). After the cascade the
    // active row is empty, kicking off the same corner case as cascadeReset.
    const M = makeMonster('M-only');
    // `-1` suffix matches the `-pick-\d+` strip regex in getStarterBaseId,
    // so the schema dispatch resolves to `starter:starter-perm-reshuffle`.
    const card = makeReshuffleCard('-1');

    let state = makeState({
      activeCards: activeRow(M),
      previewCards: emptyRow(),
      remainingDeck: [],
      handCards: [card],
      phase: 'playerInput',
    });

    // ===== Step 1: PLAY_CARD — auto-resolves (1 active card path) =====
    // drain processes PLAY_CARD + RESOLVE_HERO_MAGIC_TARGET (auto-injected by
    // the schema short-circuit) + FINALIZE_MAGIC_CARD synchronously.
    const playResult = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }] as GameAction[]);
    state = playResult.state;
    // pendingMagicAction should be null (auto-resolved, no modal).
    expect(state.pendingMagicAction).toBeNull();
    expect(state.activeCards.every(c => !c)).toBe(true);
    expect(state.remainingDeck.map(c => c.id)).toEqual(['M-only']);
    expect(state.pendingWaterfallPlan).not.toBeNull();
    expect(countSideEffect(playResult, 'waterfall:planReady')).toBe(1);

    // ===== Step 2: drive first waterfall =====
    state = reduce(state, { type: 'APPLY_WATERFALL_DROP' }).state;
    state = reduce(state, { type: 'APPLY_WATERFALL_DEAL' }).state;
    // After deal: preview holds the single card, deck empty, active still empty.
    expect(state.previewCards.filter(c => c).length).toBe(1);
    expect(state.remainingDeck.length).toBe(0);
    expect(state.activeCards.every(c => !c)).toBe(true);

    // ===== Step 3: COMPLETE_WATERFALL — fix triggers 2nd waterfall =====
    let completeResult = reduce(state, { type: 'COMPLETE_WATERFALL' });
    state = completeResult.state;
    expect(state.pendingWaterfallPlan).not.toBeNull();
    expect(countSideEffect(completeResult, 'waterfall:planReady')).toBe(1);
    expect(state.pendingWaterfallPlan!.dropAssignments.length).toBe(1);

    // ===== Step 4: drive second waterfall =====
    state = reduce(state, { type: 'APPLY_WATERFALL_DROP' }).state;
    state = reduce(state, { type: 'APPLY_WATERFALL_DEAL' }).state;
    expect(state.activeCards.filter(c => c?.id === 'M-only').length).toBe(1);

    // ===== Step 5: COMPLETE_WATERFALL — no third trigger =====
    completeResult = reduce(state, { type: 'COMPLETE_WATERFALL' });
    state = completeResult.state;
    expect(state.pendingWaterfallPlan).toBeNull();
    expect(countSideEffect(completeResult, 'waterfall:planReady')).toBe(0);

    // Final state: monster is back on the active row, no soft-lock.
    expect(state.activeCards.filter(c => c).length).toBe(1);
    expect(state.gameOver).toBe(false);
    expect(state.victory).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sanity: the bug pre-existed in computeWaterfallDropPlan (called from the
// fix). Confirm it returns a sensible plan for the post-deal state.
// ---------------------------------------------------------------------------

describe('computeWaterfallDropPlan — sanity for the post-deal soft-lock state', () => {
  it('active=empty + preview=full + deck=empty → drops all preview into active, no refill', () => {
    const A = makeMonster('A');
    const B = makeMonster('B');
    const C = makeMonster('C');
    const D = makeMonster('D');
    const state = makeState({
      activeCards: emptyRow(),
      previewCards: activeRow(A, B, C, D),
      remainingDeck: [],
    });

    const plan = computeWaterfallDropPlan(state, false);
    expect(plan).not.toBeNull();
    expect(plan!.dropAssignments.length).toBe(4);
    expect(plan!.nextPreviewCards.length).toBe(0);
    expect(plan!.shouldDeclareVictory).toBe(false); // 4 cards just dropped into active
  });
});
