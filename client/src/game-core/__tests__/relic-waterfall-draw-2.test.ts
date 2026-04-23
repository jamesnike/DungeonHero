/**
 * 永恒护符·瀑流汲取（waterfall-draw-2）：每次瀑流推进时，从背包抽 2 张牌。
 *
 * 关键不变量：
 * - 抽牌走 backpack（与 `.cursor/rules/draw-cards-defaults-to-backpack.mdc` 一致）。
 * - **抽牌时机：怪物落到 active row 之后**（同一 reduce step：与 drop 一起 patch
 *   handCards / activeCards），保证抽到的卡触发 onEnterHandEffect 时能看到本波刚
 *   落下的怪物。这是 user 显式要求的修正——之前放在 APPLY_WATERFALL_EFFECTS 阶
 *   段，先于 drop，导致 三牌惊雷 等"上手对全场怪造成法伤"的卡看不到新落怪。
 * - 抽到的卡名写入 log（玩家可看到具体抽了什么）。
 * - 没装备此护符时不抽牌、不写 log。
 * - 回收袋当波恢复的卡这一波就能被抽到（与 `recycle-shuffle` 起始护符联动）。
 *   recycle bag tick 在 APPLY_WATERFALL_EFFECTS，draw 在 APPLY_WATERFALL_DROP，
 *   两者由 GameBoard 顺序 dispatch，state 持久化所以联动天然成立。
 * - 背包不足/手牌满时不报错、走 fallback log。
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
import type { ActiveRowSlots } from '@/components/game-board/types';
// 注册 on-enter-hand handler（含 three-card-thunder-onhand）。
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeBackpackCard(i: number, name?: string): GameCardData {
  return {
    id: `bp-${i}`,
    type: 'magic',
    name: name ?? `测试卡 ${i}`,
    value: 1,
  };
}

/**
 * 构造一个最简 `pendingWaterfallPlan`。默认无落怪，便于专注测试 draw 行为。
 * 传 `dropAssignments` 时会让 reducer 真的把卡 patch 进 active row（用于
 * on-enter-hand 联动测试）。
 */
function makePlan(opts: {
  dropAssignments?: Array<{ previewIndex: number; card: GameCardData; slotIndex: number }>;
} = {}) {
  const dropAssignments = opts.dropAssignments ?? [];
  return {
    dropAssignments,
    resolvedDropCards: dropAssignments.map(d => d.card),
    dropPreviewIndices: dropAssignments.map(d => d.previewIndex),
    dropTargetSlots: dropAssignments.map(d => d.slotIndex),
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

function emptyRow(): ActiveRowSlots {
  return [null, null, null, null, null] as unknown as ActiveRowSlots;
}

function getLogMessages(sideEffects: ReadonlyArray<{ event: string; payload: unknown }>): string[] {
  return sideEffects
    .filter(e => e.event === 'log:entry')
    .map(e => (e.payload as { message: string }).message);
}

describe('永恒护符·瀑流汲取 (waterfall-draw-2)', () => {
  it('真的把 2 张牌从背包搬到手牌（在 APPLY_WATERFALL_DROP 同一 reduce step 内）', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [
        makeBackpackCard(1, '火球术'),
        makeBackpackCard(2, '冰锥术'),
        makeBackpackCard(3, '闪电链'),
      ],
      handCards: [],
      pendingWaterfallPlan: makePlan(),
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DROP' });

    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('log 里包含「永恒护符·瀑流汲取」前缀和具体卡名', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [
        makeBackpackCard(1, '火球术'),
        makeBackpackCard(2, '冰锥术'),
      ],
      handCards: [],
      pendingWaterfallPlan: makePlan(),
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DROP' });
    const logs = getLogMessages(result.sideEffects ?? []);

    const drawLog = logs.find(m => m.includes('永恒护符·瀑流汲取'));
    expect(drawLog).toBeDefined();
    expect(drawLog).toContain('火球术');
    expect(drawLog).toContain('冰锥术');
  });

  it('为每张抽到的卡 emit 一条 card:drawnToHand 事件（UI 动画用）', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [makeBackpackCard(1), makeBackpackCard(2), makeBackpackCard(3)],
      handCards: [],
      pendingWaterfallPlan: makePlan(),
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DROP' });
    const drawnEvents = (result.sideEffects ?? []).filter(e => e.event === 'card:drawnToHand');

    expect(drawnEvents).toHaveLength(2);
    for (const evt of drawnEvents) {
      expect((evt.payload as { source: string }).source).toBe('backpack');
    }
  });

  it('未持有此护符时既不抽牌也不写 log', () => {
    const state = makeState({
      eternalRelics: [],
      backpackItems: [makeBackpackCard(1), makeBackpackCard(2)],
      handCards: [],
      pendingWaterfallPlan: makePlan(),
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DROP' });
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(2);
    expect(logs.find(m => m.includes('永恒护符·瀑流汲取'))).toBeUndefined();
  });

  it('背包为空时 emit fallback log，不报错', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [],
      handCards: [],
      pendingWaterfallPlan: makePlan(),
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DROP' });
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.length).toBe(0);
    expect(logs.find(m => m.includes('背包无可抽卡'))).toBeDefined();
  });

  it('背包仅 1 张时也只写 1 张的 log（fallback 不触发）', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [makeBackpackCard(1, '独苗卡')],
      handCards: [],
      pendingWaterfallPlan: makePlan(),
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DROP' });
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.length).toBe(1);
    const drawLog = logs.find(m => m.includes('永恒护符·瀑流汲取'));
    expect(drawLog).toBeDefined();
    expect(drawLog).toContain('独苗卡');
    expect(drawLog).toContain('1 张');
  });

  // ---------------------------------------------------------------------------
  // user 显式要求：抽牌在怪物落到 active row 之后。这条测试是这次重构的核心
  // 回归测试——保证抽到的 onEnterHand 卡（如 三牌惊雷）能命中本波刚落下的怪物。
  // ---------------------------------------------------------------------------
  it('抽到带 onEnterHandEffect 的卡能看到本波刚落下的怪物（同一 reduce step）', () => {
    const droppedMonster: GameCardData = {
      id: 'm-just-dropped',
      type: 'monster',
      name: 'JustDropped',
      monsterType: 'Goblin',
      value: 50,
      attack: 0,
      hp: 50,
      maxHp: 50,
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
    };

    // 三牌惊雷 with onEnterHandEffect — 上手对 active row 全体怪造成 1 法伤。
    const thunderCard: GameCardData = {
      id: 'magic-thunder-bp',
      type: 'magic',
      name: '三牌惊雷',
      value: 0,
      classCard: true,
      magicType: 'permanent',
      knightEffect: 'three-card-thunder',
      onEnterHandEffect: 'three-card-thunder-onhand',
      recycleDelay: 2,
    } as GameCardData;

    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      // 背包只有这一张，必然被抽中。
      backpackItems: [thunderCard],
      handCards: [],
      // 落怪 plan：怪物从 preview[1] 落到 active[1]。
      activeCards: emptyRow(),
      previewCards: (() => {
        const row: (GameCardData | null)[] = [null, droppedMonster, null, null, null];
        return row as unknown as ActiveRowSlots;
      })(),
      pendingWaterfallPlan: makePlan({
        dropAssignments: [{ previewIndex: 1, card: droppedMonster, slotIndex: 1 }],
      }),
    });

    // 必须用 drain：postProcessHandEntries 在 reduce 后 enqueue
    // TRIGGER_ON_ENTER_HAND，需要 pipeline 把它跑完才能验证 on-enter-hand 命中。
    const result = drain(state, [{ type: 'APPLY_WATERFALL_DROP' } as GameAction]);

    // 1. 怪物确实落到了 active row。
    expect(result.state.activeCards[1]?.id).toBe('m-just-dropped');
    // 2. 三牌惊雷被抽到了手牌。
    expect(result.state.handCards.map(c => c.id)).toContain('magic-thunder-bp');
    // 3. 关键：on-enter-hand 命中了刚落下的怪物（hp 50 → 49）。
    //    如果时序错了（draw 发生在 drop 之前），active[1] 当时是 null，
    //    on-enter-hand 找不到怪物，hp 不会变。
    const monsterAfter = result.state.activeCards[1];
    expect(monsterAfter?.hp).toBe(49);
  });

  it('回收袋当波恢复的卡这一波就能被抽到（与 recycle-shuffle 联动；EFFECTS→DROP 顺序 dispatch）', () => {
    // recycle bag tick 在 APPLY_WATERFALL_EFFECTS，draw 在 APPLY_WATERFALL_DROP。
    // 两者由 GameBoard 顺序 dispatch；state 在两次 dispatch 之间持久化，所以
    // 第一次 tick 把卡放回背包后，第二次 dispatch 看到的 backpack 已包含它。
    const restoredCard: GameCardData = {
      id: 'recycled-1',
      type: 'magic',
      name: '复返之卡',
      value: 1,
      magicType: 'permanent',
      recycleDelay: 1,
      _recycleWaits: 1,
    };

    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [],
      handCards: [],
      permanentMagicRecycleBag: [restoredCard],
      pendingWaterfallPlan: makePlan(),
    });

    const result = drain(state, [
      { type: 'APPLY_WATERFALL_EFFECTS' } as GameAction,
      { type: 'APPLY_WATERFALL_DROP' } as GameAction,
    ]);
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.map(c => c.id)).toContain('recycled-1');
    const drawLog = logs.find(m => m.includes('永恒护符·瀑流汲取'));
    expect(drawLog).toContain('复返之卡');
  });

  it('未 dispatch APPLY_WATERFALL_DROP（仅 APPLY_WATERFALL_EFFECTS）时不抽牌——确认时序已迁出 EFFECTS', () => {
    // 回归保护：曾经把 draw 放在 EFFECTS 阶段，本次重构迁出。如果未来有人误把
    // draw 加回 EFFECTS，这条测试会立刻失败。
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [makeBackpackCard(1, '甲'), makeBackpackCard(2, '乙')],
      handCards: [],
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.length).toBe(0);
    expect(logs.find(m => m.includes('永恒护符·瀑流汲取'))).toBeUndefined();
  });
});
