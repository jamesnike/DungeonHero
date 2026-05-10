/**
 * Regression test for: ghost buildings being skipped by 命运挪移 and 乾坤挪移.
 *
 * User-reported bug: when activeCards = [ghost, normalA, normalB],
 *   - 命运挪移 (最左 ↔ 最右) should swap ghost ↔ normalB but appeared to skip
 *     the ghost.
 *   - 乾坤挪移 (最左两张) should swap ghost ↔ normalA but appeared to skip the
 *     ghost.
 *
 * Code reading shows both resolvers use `cards[i] != null` (which DOES
 * include ghosts), so this test pins down the real behavior.
 *
 * NOTE: 命运挪移 and 乾坤挪移 had their effects swapped — 命运挪移 now does
 * the leftmost↔rightmost trade and 乾坤挪移 now does the leftmost-two trade.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    ...overrides,
  };
}

function makeGhostBuilding(id: string, name = '增幅祭坛'): GameCardData {
  return {
    id,
    type: 'building' as any,
    name,
    value: 0,
    image: '',
    isGhost: true,
    hp: 2,
    maxHp: 2,
  } as GameCardData;
}

// Mirror the real-world 增幅祭坛 placement from useEventSystem.ts (full field set).
function makeRealAmplifyAltar(id: string, slotIdx: number): GameCardData {
  return {
    id,
    type: 'building' as any,
    name: '增幅祭坛',
    value: 0,
    image: '',
    isGhost: true,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    hp: 2,
    maxHp: 2,
    hasReleaseCharge: true,
    _fateBladeLastSlot: slotIdx,
    _amplifyTargetCardId: 'some-target',
    _amplifyTargetName: 'TargetCard',
    description: 'test',
    eventChoices: [
      { text: '发动增幅祭坛（目标：TargetCard）', hint: 'test', effect: 'amplify-altar-activate' },
    ],
  } as any;
}

function makeMonster(id: string, name = 'normal'): GameCardData {
  return {
    id,
    type: 'monster',
    name,
    value: 1,
    image: '',
    hp: 5,
    maxHp: 5,
    attack: 1,
  } as GameCardData;
}

function makeCrossroadsLeftSwap(): GameCardData {
  return {
    id: 'crossroads-left-swap-1',
    type: 'magic',
    name: '命运挪移',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'crossroads-left-swap',
    description: '将地城行最左和最右的卡牌对换位置。',
  } as GameCardData;
}

function makeStarterDungeonSwap(): GameCardData {
  return {
    id: STARTER_CARD_IDS.dungeonSwap,
    type: 'magic',
    name: '乾坤挪移',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: 'test',
    recycleDelay: 1,
  } as GameCardData;
}

describe('命运挪移 / 乾坤挪移 — 幽灵建筑参与换位（用户报 bug 回归测试）', () => {
  it('命运挪移：[幽灵, 普通A, 普通B] → 应交换 幽灵(最左) ↔ 普通B(最右)', () => {
    const card = makeCrossroadsLeftSwap();
    const ghost = makeGhostBuilding('ghost-altar');
    const normalA = makeMonster('m-a', 'NormalA');
    const normalB = makeMonster('m-b', 'NormalB');

    const state = makeState({
      handCards: [card],
      activeCards: [ghost, normalA, normalB, null, null] as any,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id },
    ] as any);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[0]?.id).toBe(normalB.id);
    expect(after[1]?.id).toBe(normalA.id);
    expect(after[2]?.id).toBe(ghost.id);
  });

  it('乾坤挪移：[幽灵, 普通A, 普通B] → 应交换 幽灵 ↔ 普通A（最左两张）', () => {
    const card = makeStarterDungeonSwap();
    const ghost = makeGhostBuilding('ghost-altar');
    const normalA = makeMonster('m-a', 'NormalA');
    const normalB = makeMonster('m-b', 'NormalB');

    const state = makeState({
      handCards: [card],
      activeCards: [ghost, normalA, normalB, null, null] as any,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id },
    ] as any);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[0]?.id).toBe(normalA.id);
    expect(after[1]?.id).toBe(ghost.id);
    expect(after[2]?.id).toBe(normalB.id);
  });

  it('命运挪移：[普通A, 幽灵, 普通B] → 应交换 普通A(最左) ↔ 普通B(最右)', () => {
    const card = makeCrossroadsLeftSwap();
    const ghost = makeGhostBuilding('ghost-altar');
    const normalA = makeMonster('m-a', 'NormalA');
    const normalB = makeMonster('m-b', 'NormalB');

    const state = makeState({
      handCards: [card],
      activeCards: [normalA, ghost, normalB, null, null] as any,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id },
    ] as any);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[0]?.id).toBe(normalB.id);
    expect(after[1]?.id).toBe(ghost.id);
    expect(after[2]?.id).toBe(normalA.id);
  });

  it('乾坤挪移：[幽灵A, null, null, null, 幽灵B] → 应交换 幽灵A ↔ 幽灵B（仅 2 张非空，最左两张 = 幽灵A + 幽灵B）', () => {
    const card = makeStarterDungeonSwap();
    const ghostA = makeGhostBuilding('ghost-a', '幽灵A');
    const ghostB = makeGhostBuilding('ghost-b', '幽灵B');

    const state = makeState({
      handCards: [card],
      activeCards: [ghostA, null, null, null, ghostB] as any,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id },
    ] as any);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[0]?.id).toBe(ghostB.id);
    expect(after[4]?.id).toBe(ghostA.id);
  });

  // ---------- Real 增幅祭坛 (full field fidelity) ----------
  it('命运挪移：[真实增幅祭坛(slot 0), 普通A, 普通B] → 应交换 增幅祭坛 ↔ 普通B(最右) 并更新 _fateBladeLastSlot', () => {
    const card = makeCrossroadsLeftSwap();
    const ghost = makeRealAmplifyAltar('altar-real', 0);
    const normalA = makeMonster('m-a', 'NormalA');
    const normalB = makeMonster('m-b', 'NormalB');

    const state = makeState({
      handCards: [card],
      activeCards: [ghost, normalA, normalB, null, null] as any,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id },
    ] as any);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[0]?.id).toBe(normalB.id);
    expect(after[1]?.id).toBe(normalA.id);
    expect(after[2]?.id).toBe(ghost.id);
    expect((after[2] as any)?._fateBladeLastSlot).toBe(2);
  });

  it('乾坤挪移：[真实增幅祭坛(slot 0), 普通A, 普通B, null, null] → 应交换 祭坛 ↔ 普通A（最左两张）', () => {
    const card = makeStarterDungeonSwap();
    const ghost = makeRealAmplifyAltar('altar-real', 0);
    const normalA = makeMonster('m-a', 'NormalA');
    const normalB = makeMonster('m-b', 'NormalB');

    const state = makeState({
      handCards: [card],
      activeCards: [ghost, normalA, normalB, null, null] as any,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id },
    ] as any);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[0]?.id).toBe(normalA.id);
    expect(after[1]?.id).toBe(ghost.id);
    expect(after[2]?.id).toBe(normalB.id);
    expect((after[1] as any)?._fateBladeLastSlot).toBe(1);
  });

  // ---------- Ghost buried in stack scenario ----------
  // Hypothesis: user might be seeing a case where the ghost is buried in
  // activeCardStacks under a normal card. The swap only moves the top card
  // (activeCards[i]); the stack stays at its column. Let's verify this
  // scenario explicitly so we know what the current behavior is.

  it('命运挪移：[普通X (ghost in stack), 普通A, 普通B] → 仅交换顶层 普通X(最左) ↔ 普通B(最右)，幽灵留在第 0 列堆叠', () => {
    const card = makeCrossroadsLeftSwap();
    const ghost = makeGhostBuilding('ghost-altar');
    const topX = makeMonster('m-x', 'TopX');
    const normalA = makeMonster('m-a', 'NormalA');
    const normalB = makeMonster('m-b', 'NormalB');

    const state = makeState({
      handCards: [card],
      activeCards: [topX, normalA, normalB, null, null] as any,
      activeCardStacks: { 0: [ghost] },
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id },
    ] as any);

    const after = result.state.activeCards as (GameCardData | null)[];
    const stacksAfter = result.state.activeCardStacks ?? {};

    expect(after[0]?.id).toBe(normalB.id);
    expect(after[1]?.id).toBe(normalA.id);
    expect(after[2]?.id).toBe(topX.id);

    expect(stacksAfter[0]).toBeDefined();
    expect(stacksAfter[0]?.[0]?.id).toBe(ghost.id);
  });
});
