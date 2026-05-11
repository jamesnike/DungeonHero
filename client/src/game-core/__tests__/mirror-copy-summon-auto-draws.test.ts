/**
 * 影摹召引符 (`mirror-copy-summon` amulet) — broader auto-draw scope.
 *
 * Bug history: 影摹召引符 had `applyMirrorCopySummonStreak`（旧实现）只被
 * `DRAW_CARDS source: 'backpack'|'deck'` 和 `DRAW_FROM_BACKPACK` 两条 reducer
 * 入口调用。用户最常见的「自动抽牌」（每处理一张地城卡，UI 自动 dispatch
 * `PROCESS_AUTO_DRAWS` 从背包抽 1 张）以及永恒护符·瀑流汲取 (`waterfall-draw-2`)、
 * 各 magic / hero-magic / potion resolver **直调** `drawMultipleFromBackpack` /
 * `drawFromBackpackToHandPure` 的路径完全绕过了计数器——用户报告「影摹召引符
 * 自动抽牌 不增加 计数」。
 *
 * 修复：把 streak 逻辑提到 `game-core/cards.ts` 的
 * `applyMirrorCopySummonProgress` 通用 helper，**所有**把卡从背包真正交付到
 * 手牌的路径都调用它。
 *
 * 本测试覆盖三类此前缺失的路径：
 *   1. `PROCESS_AUTO_DRAWS`（dungeon.ts）— 主 bug 现场
 *   2. `APPLY_WATERFALL_DROP` 走 `waterfall-draw-2`（waterfall.ts）
 *   3. 代表性 magic resolver 路径（`回收轮转` / guild-recycle-reshuffle）
 *
 * (基础 `DRAW_CARDS` / `DRAW_FROM_BACKPACK` 路径在
 * `mirror-copy-summon-amulet.test.ts` 已覆盖。)
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { getEternalRelic } from '@/lib/eternalRelics';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { AmuletItem, ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    handLimitBonus: 50,
    ...overrides,
  };
}

function makeMirrorCopySummonAmulet(id = 'mcs-1'): AmuletItem {
  return {
    id,
    type: 'amulet' as const,
    name: '影摹召引符',
    value: 1,
    image: '',
    classCard: true,
    unique: true,
    amuletEffect: 'mirror-copy-summon',
  } as AmuletItem;
}

function makePlainCard(id: string): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: `Plain-${id}`,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData;
}

function makeBackpack(count: number, prefix = 'bp'): GameCardData[] {
  return Array.from({ length: count }, (_, i) => makePlainCard(`${prefix}-${i}`));
}

function findGrantedMirrorCopies(hand: GameCardData[]): GameCardData[] {
  return hand.filter(
    c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy',
  );
}

// ---------------------------------------------------------------------------
// 1) PROCESS_AUTO_DRAWS — 用户报的主 bug 现场
// ---------------------------------------------------------------------------

describe('影摹召引符 — PROCESS_AUTO_DRAWS (自动抽牌)', () => {
  it('单次 12 张自动抽牌 → streak 归 0，发出 1 张镜影摹形', () => {
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(16),
      handCards: [],
      pendingAutoDrawCount: 12,
    });

    const result = drain(state, [{ type: 'PROCESS_AUTO_DRAWS' } as GameAction]);

    expect(result.state.mirrorCopySummonStreak).toBe(0);
    const granted = findGrantedMirrorCopies(result.state.handCards);
    expect(granted).toHaveLength(1);
    expect(granted[0].name).toBe('镜影摹形');

    const triggered = result.sideEffects.find(
      e => e.event === 'combat:mirrorCopySummonTriggered',
    );
    expect(triggered).toBeDefined();
    expect((triggered?.payload as { count: number; threshold: number }).count).toBe(1);
  });

  it('累积自动抽牌：先 11 后 1 → 第 12 张时触发一次', () => {
    let state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(20),
      handCards: [],
      pendingAutoDrawCount: 11,
    });

    let r = drain(state, [{ type: 'PROCESS_AUTO_DRAWS' } as GameAction]);
    state = r.state;
    expect(state.mirrorCopySummonStreak).toBe(11);
    expect(findGrantedMirrorCopies(state.handCards)).toHaveLength(0);

    state = { ...state, pendingAutoDrawCount: 1 };
    r = drain(state, [{ type: 'PROCESS_AUTO_DRAWS' } as GameAction]);
    state = r.state;
    expect(state.mirrorCopySummonStreak).toBe(0);
    expect(findGrantedMirrorCopies(state.handCards)).toHaveLength(1);
  });

  it('2 件影摹召引符 → 6 张自动抽牌即触发 1 次（streak ×2 stacking）', () => {
    const state = makeState({
      amuletSlots: [
        makeMirrorCopySummonAmulet('mcs-1'),
        makeMirrorCopySummonAmulet('mcs-2'),
      ] as AmuletItem[],
      maxAmuletSlots: 2,
      backpackItems: makeBackpack(10),
      handCards: [],
      pendingAutoDrawCount: 6,
    });

    const result = drain(state, [{ type: 'PROCESS_AUTO_DRAWS' } as GameAction]);

    expect(result.state.mirrorCopySummonStreak).toBe(0);
    expect(findGrantedMirrorCopies(result.state.handCards)).toHaveLength(1);
  });

  it('背包提前耗尽时只按真实抽到张数计数', () => {
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(3),
      handCards: [],
      pendingAutoDrawCount: 12,
    });

    const result = drain(state, [{ type: 'PROCESS_AUTO_DRAWS' } as GameAction]);

    expect(result.state.mirrorCopySummonStreak).toBe(3);
    expect(findGrantedMirrorCopies(result.state.handCards)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2) APPLY_WATERFALL_DROP + waterfall-draw-2 永恒护符
// ---------------------------------------------------------------------------

describe('影摹召引符 — APPLY_WATERFALL_DROP (永恒护符·瀑流汲取)', () => {
  function makePlan() {
    return {
      dropAssignments: [],
      resolvedDropCards: [],
      dropPreviewIndices: [],
      dropTargetSlots: [],
      discardCard: null,
      discardPreviewIndex: null,
      discardDestination: 'graveyard' as const,
      nextPreviewCards: [],
      nextRemainingDeck: [],
      newPreviewStacks: {},
      shouldDeclareVictory: false,
      stuckFinalMonsters: [],
      rng: createRng(1),
    } as any;
  }

  it('瀑流汲取 +2 抽牌 → streak +2', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(5),
      handCards: [],
      pendingWaterfallPlan: makePlan(),
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DROP' });

    expect(result.state.handCards.length).toBe(2);
    expect(result.state.mirrorCopySummonStreak).toBe(2);
  });

  it('累积 6 次瀑流汲取 → 第 6 次触发 1 张镜影摹形（6×2 = 12）', () => {
    let state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(20),
      handCards: [],
      pendingWaterfallPlan: makePlan(),
    });

    for (let i = 0; i < 5; i++) {
      const r = reduce(state, { type: 'APPLY_WATERFALL_DROP' });
      state = { ...r.state, pendingWaterfallPlan: makePlan() };
    }
    expect(state.mirrorCopySummonStreak).toBe(10);
    expect(findGrantedMirrorCopies(state.handCards)).toHaveLength(0);

    // 第 6 次：reducer 自身 + enqueue ADD_CARDS_TO_HAND（绕过 drain 的 phase gate，
    // 直接走 reduce + 手动 follow-up 处理，模拟 GameEngine.dispatch 顶层路径）。
    const r6 = reduce(state, { type: 'APPLY_WATERFALL_DROP' });
    expect(r6.state.mirrorCopySummonStreak).toBe(0);
    // ADD_CARDS_TO_HAND 在 enqueuedActions 里，需要进一步 process。
    let finalState = r6.state;
    for (const followUp of r6.enqueuedActions ?? []) {
      const followResult = reduce(finalState, followUp);
      finalState = followResult.state;
    }
    expect(findGrantedMirrorCopies(finalState.handCards)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3) Magic resolver: 回收轮转 (guild-recycle-reshuffle) 单张抽牌
// ---------------------------------------------------------------------------

describe('影摹召引符 — magic resolver 直调 drawFromBackpackToHandPure', () => {
  function makeRecycleCycleCard(id = 'rc-1'): GameCardData {
    return {
      id,
      type: 'magic' as const,
      name: '回收轮转',
      value: 0,
      image: '',
      magicType: 'instant',
      magicEffect: 'guild-recycle-reshuffle',
    } as GameCardData;
  }

  function activeRowOf(): ActiveRowSlots {
    return [null, null, null, null, null] as unknown as ActiveRowSlots;
  }

  it('回收轮转 抽 1 张 → streak +1（每次累计直到 12 触发）', () => {
    let state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(14),
      activeCards: activeRowOf(),
    });

    // 累计 11 次 → streak = 11，未触发。
    for (let i = 0; i < 11; i++) {
      const card = makeRecycleCycleCard(`rc-${i}`);
      state = { ...state, handCards: [card] };
      const r = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      state = r.state;
    }
    expect(state.mirrorCopySummonStreak).toBe(11);
    expect(findGrantedMirrorCopies(state.handCards)).toHaveLength(0);

    // 第 12 次 → 触发 1 张镜影摹形，streak 归 0。
    const card = makeRecycleCycleCard('rc-11');
    state = { ...state, handCards: [...state.handCards, card] };
    const r = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(r.state.mirrorCopySummonStreak).toBe(0);
    expect(findGrantedMirrorCopies(r.state.handCards)).toHaveLength(1);
  });
});
