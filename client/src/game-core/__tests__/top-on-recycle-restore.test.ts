/**
 * 「置顶」(`topOnRecycleRestore`) 关键词
 *
 * 行为契约：
 *   - 当卡从回收袋洗回背包时（任意 recycle→backpack 路径），如果带
 *     `topOnRecycleRestore: true`，则 prepend 到 `backpackItems[0]`（背包第 1 格），
 *     让玩家立刻能在背包最显眼位置看到它。普通卡仍 append 到 backpack 末尾。
 *   - 容量语义：仍然占 backpack 容量配额——背包满时跟普通卡一样无法洗回，
 *     自然也不触发置顶（这一帧留在回收袋，下次瀑流再算）。
 *   - 集中分流点：`game-core/cards.ts` `processRecycleBag`。
 *   - 视觉：第一阶段沿用 `waterfall:recycleRestored` 绿环动画（payload.cards 含全部
 *     restored，包括置顶卡）；第二阶段 `card:promotedToDeckTop` side effect 给
 *     banner / log 用（事件名是历史命名，当前语义已改为「背包顶」）。
 *   - 字段未设 / 设 false：完全跟旧实现一致（回归保护）。
 *   - 应用范围：「专属感召」(starter-perm-discover-class-to-hand) 是唯一原生
 *     带置顶的卡；其余卡是普通行为。
 *
 * 历史注：本机制早期实现是"放到 `remainingDeck[0]`（牌堆顶）"，后来发现玩家的直觉
 * 是"放到背包顶让我能马上看到卡回来了"——而不是"塞进牌堆顶让卡再次消失"。
 * 已迁移到 `backpackItems[0]` 语义。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createStarterDiscoverClassToHandCard, STARTER_CARD_IDS } from '../deck';
import { processRecycleBag } from '../cards';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * `processRecycleBag` 是纯 helper，不经过 dispatch 链 / pipeline，所以单元测试 fixture
 * 用什么 phase 都不影响结果。统一用 `phase: 'playerInput'` 跟其它 reducer-level 测试
 * 对齐 (`pipeline-input-continuation.mdc`)。
 */
function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

/**
 * 端到端 helper：用于测试「顶级 dispatch action」如 APPLY_WATERFALL_EFFECTS /
 * RESTORE_RECYCLE_BAG。这些 action 在真实游戏走 `engine.dispatch → _processAction →
 * reduce()` 直接执行（绕过 `isInputContinuation` 白名单），所以测试 fixture 不能用
 * `phase: 'playerInput'`（否则 drain 的 INPUT_PHASES 检查会让顶级 action 在执行前
 * 提前 return —— 见 `pipeline.ts:160`）。
 *
 * 这条 helper 用默认 phase（`'idle'`，不在 INPUT_PHASES 里），跟现有
 * `waterfall-heal-amulet.test.ts` 的 `drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' }])`
 * 同款写法对齐。
 */
function makeIdleState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

/** 普通 Perm magic：recycleDelay = 1，无置顶。 */
function makePermMagic(id: string, recycleDelay = 1): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: `Plain-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay,
  } as GameCardData;
}

/** Perm magic with topOnRecycleRestore: true. */
function makeTopPerm(id: string, recycleDelay = 1): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: `Top-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay,
    topOnRecycleRestore: true,
  } as GameCardData;
}

/** 普通牌（用作 backpack 占位，方便测试 prepend/append 顺序）。 */
function makeMonster(id: string): GameCardData {
  return {
    id,
    type: 'monster' as const,
    name: `Monster-${id}`,
    value: 0,
    image: '',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1. processRecycleBag 单元测试
// ---------------------------------------------------------------------------

describe('processRecycleBag — 「置顶」分流（背包顶）', () => {
  it('混合卡：1 张置顶 + 1 张普通，置顶 prepend 到 backpackItems[0]，普通 append 末尾', () => {
    const topCard = { ...makeTopPerm('top-1'), _recycleWaits: 1 } as GameCardData;
    const plainCard = { ...makePermMagic('plain-1'), _recycleWaits: 1 } as GameCardData;
    const existingBackpack = makeMonster('m-existing');
    const state = makeState({
      permanentMagicRecycleBag: [topCard, plainCard],
      backpackItems: [existingBackpack],
    });

    const result = processRecycleBag(state);

    expect(result.restored.length).toBe(2);
    expect(result.restoredToBackpack.map(c => c.id)).toEqual(['plain-1']);
    expect(result.restoredToBackpackTop.map(c => c.id)).toEqual(['top-1']);
    // 关键：顺序是 [置顶卡, ...原 backpack, ...普通卡]
    expect(result.patch.backpackItems?.map(c => c.id)).toEqual(['top-1', 'm-existing', 'plain-1']);
    // 关键：不再写 remainingDeck
    expect(result.patch.remainingDeck).toBeUndefined();
    expect(result.patch.permanentMagicRecycleBag?.length).toBe(0);
  });

  it('未设 topOnRecycleRestore（字段缺省）：行为完全等同旧实现，patch.remainingDeck 不写入', () => {
    const plainCard = { ...makePermMagic('plain-1'), _recycleWaits: 1 } as GameCardData;
    const state = makeState({
      permanentMagicRecycleBag: [plainCard],
      backpackItems: [],
    });

    const result = processRecycleBag(state);

    expect(result.restored.length).toBe(1);
    expect(result.restoredToBackpack.length).toBe(1);
    expect(result.restoredToBackpackTop.length).toBe(0);
    expect(result.patch.backpackItems?.length).toBe(1);
    // 关键回归保护：没有置顶卡时，patch 不应该覆盖 remainingDeck（任何时候都不应该）。
    expect(result.patch.remainingDeck).toBeUndefined();
  });

  it('多张置顶：按原回收袋顺序 prepend 到 backpackItems 头部', () => {
    const topA = { ...makeTopPerm('top-A'), _recycleWaits: 1 } as GameCardData;
    const topB = { ...makeTopPerm('top-B'), _recycleWaits: 1 } as GameCardData;
    const existingBackpack = makeMonster('m-existing');
    const state = makeState({
      permanentMagicRecycleBag: [topA, topB],
      backpackItems: [existingBackpack],
    });

    const result = processRecycleBag(state);

    // 置顶卡按回收袋原序排在前面，再接原 backpack。
    expect(result.patch.backpackItems?.map(c => c.id)).toEqual(['top-A', 'top-B', 'm-existing']);
    expect(result.patch.remainingDeck).toBeUndefined();
  });

  it('置顶卡仍未到 ready (_recycleWaits > 1)：留在回收袋，不触发置顶', () => {
    const topCard = { ...makeTopPerm('top-1', 3), _recycleWaits: 3 } as GameCardData;
    const state = makeState({
      permanentMagicRecycleBag: [topCard],
      backpackItems: [],
    });

    const result = processRecycleBag(state);

    expect(result.restored.length).toBe(0);
    expect(result.restoredToBackpackTop.length).toBe(0);
    expect(result.patch.permanentMagicRecycleBag?.[0]?.id).toBe('top-1');
    expect((result.patch.permanentMagicRecycleBag?.[0] as any)?._recycleWaits).toBe(2);
    expect(result.patch.remainingDeck).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. 容量边界
// ---------------------------------------------------------------------------

describe('processRecycleBag — 容量边界', () => {
  // BASE_BACKPACK_CAPACITY = 12（client/src/game-core/constants.ts）。
  // capacity = BASE + backpackCapacityModifier；available = max(0, capacity - backpack.length)。
  const BASE_CAP = 12;

  it('背包满（available = 0）：置顶卡跟普通卡一样无法洗回，留在回收袋', () => {
    const topCard = { ...makeTopPerm('top-1'), _recycleWaits: 1 } as GameCardData;
    // 用负 modifier 把 capacity 打到 0：modifier = -BASE。
    const state = makeState({
      permanentMagicRecycleBag: [topCard],
      backpackItems: [],
      backpackCapacityModifier: -BASE_CAP,
    });

    const result = processRecycleBag(state);

    // 容量 = 0 → toRestore 为空 → 置顶卡留在 overflow 里
    expect(result.restoredToBackpackTop.length).toBe(0);
    expect(result.restoredToBackpack.length).toBe(0);
    expect(result.restored.length).toBe(0);
    expect(result.remaining.length).toBe(1);
    expect(result.remaining[0].id).toBe('top-1');
    // 关键：背包没动
    expect(result.patch.backpackItems?.length).toBe(0);
    expect(result.patch.remainingDeck).toBeUndefined();
  });

  it('背包仅剩 1 格 + 回收袋有 1 普 1 置顶：按回收袋顺序切片，先到先得（置顶）', () => {
    // 第一张 top-1 拿到唯一的 slot，prepend 到 backpackItems[0]；
    // 第二张 plain-1 因 available 已用尽（capacity 只支撑 1 张就绪卡）overflow 留在 bag。
    const topCard = { ...makeTopPerm('top-1'), _recycleWaits: 1 } as GameCardData;
    const plainCard = { ...makePermMagic('plain-1'), _recycleWaits: 1 } as GameCardData;
    const state = makeState({
      permanentMagicRecycleBag: [topCard, plainCard],
      backpackItems: [],
      // capacity = BASE_CAP + modifier；想要 available = 1 ⇒ capacity = 1 ⇒ modifier = 1 - BASE_CAP
      backpackCapacityModifier: 1 - BASE_CAP,
    });

    const result = processRecycleBag(state);

    expect(result.restored.length).toBe(1);
    expect(result.restored[0].id).toBe('top-1');
    expect(result.restoredToBackpackTop.map(c => c.id)).toEqual(['top-1']);
    expect(result.restoredToBackpack.length).toBe(0);
    expect(result.remaining.length).toBe(1);
    expect(result.remaining[0].id).toBe('plain-1');
    // 置顶卡进 backpack[0]
    expect(result.patch.backpackItems?.map(c => c.id)).toEqual(['top-1']);
    expect(result.patch.remainingDeck).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. 端到端：waterfall 自动 -1 路径
// ---------------------------------------------------------------------------

describe('「置顶」端到端 — APPLY_WATERFALL_EFFECTS', () => {
  it('置顶 perm magic（waits=1）经一次瀑流 → backpackItems[0]，不在 remainingDeck', () => {
    const topCard = { ...makeTopPerm('top-1'), _recycleWaits: 1 } as GameCardData;
    const existingBackpack = makeMonster('m-existing');
    const oldDeckCard = makeMonster('m-deck-existing');
    const state = makeIdleState({
      permanentMagicRecycleBag: [topCard],
      backpackItems: [existingBackpack],
      remainingDeck: [oldDeckCard] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    // 置顶卡必须 prepend 到 backpack 第 1 格
    expect(result.state.permanentMagicRecycleBag.length).toBe(0);
    expect(result.state.backpackItems[0]?.id).toBe('top-1');
    expect(result.state.backpackItems[1]?.id).toBe('m-existing');
    // remainingDeck 完全不动
    expect((result.state.remainingDeck as GameCardData[])[0]?.id).toBe('m-deck-existing');

    // 同时验证两条 side effect 都发了
    const restored = result.sideEffects.find(e => e.event === 'waterfall:recycleRestored');
    const promoted = result.sideEffects.find(e => e.event === 'card:promotedToDeckTop');
    expect(restored).toBeDefined();
    expect((restored?.payload as any)?.cards?.[0]?.id).toBe('top-1');
    expect(promoted).toBeDefined();
    expect((promoted?.payload as any)?.cards?.[0]?.id).toBe('top-1');
  });

  it('回归：普通 perm magic 经一次瀑流 → backpack 末尾（不发 promotedToDeckTop 事件）', () => {
    const plainCard = { ...makePermMagic('plain-1'), _recycleWaits: 1 } as GameCardData;
    const existingBackpack = makeMonster('m-existing');
    const state = makeIdleState({
      permanentMagicRecycleBag: [plainCard],
      backpackItems: [existingBackpack],
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.permanentMagicRecycleBag.length).toBe(0);
    // 普通卡 append 到末尾
    expect(result.state.backpackItems[0]?.id).toBe('m-existing');
    expect(result.state.backpackItems[1]?.id).toBe('plain-1');

    const restored = result.sideEffects.find(e => e.event === 'waterfall:recycleRestored');
    const promoted = result.sideEffects.find(e => e.event === 'card:promotedToDeckTop');
    expect(restored).toBeDefined();
    expect(promoted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. 端到端：通用 RESTORE_RECYCLE_BAG reducer 路径（回收熔炉 amulet）
// ---------------------------------------------------------------------------

describe('「置顶」端到端 — RESTORE_RECYCLE_BAG', () => {
  it('置顶卡 ready 时 → backpackItems[0]，不在 remainingDeck', () => {
    const topCard = { ...makeTopPerm('top-1'), _recycleWaits: 1 } as GameCardData;
    const oldDeckCard = makeMonster('m-deck-existing');
    const state = makeIdleState({
      permanentMagicRecycleBag: [topCard],
      backpackItems: [],
      remainingDeck: [oldDeckCard] as any,
    });

    const result = drain(state, [{ type: 'RESTORE_RECYCLE_BAG' } as GameAction]);

    expect(result.state.permanentMagicRecycleBag.length).toBe(0);
    expect(result.state.backpackItems[0]?.id).toBe('top-1');
    // remainingDeck 完全不动
    expect((result.state.remainingDeck as GameCardData[])[0]?.id).toBe('m-deck-existing');

    const promoted = result.sideEffects.find(e => e.event === 'card:promotedToDeckTop');
    expect(promoted).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. 「专属感召」专项
// ---------------------------------------------------------------------------

describe('「专属感召」专项 — topOnRecycleRestore: true', () => {
  it('createStarterDiscoverClassToHandCard 产出的卡带 topOnRecycleRestore: true + recycleDelay: 1', () => {
    const card = createStarterDiscoverClassToHandCard();
    expect(card.topOnRecycleRestore).toBe(true);
    expect(card.recycleDelay).toBe(1);
    expect(card.id).toBe(STARTER_CARD_IDS.discoverClassToHand);
  });

  it('端到端：专属感召在回收袋（waits=1）→ APPLY_WATERFALL_EFFECTS → 进 backpackItems[0]', () => {
    const ganzhao = createStarterDiscoverClassToHandCard();
    const inBag = { ...ganzhao, _recycleWaits: 1 } as GameCardData;
    const oldDeckCard = makeMonster('m-deck-existing');
    const state = makeIdleState({
      permanentMagicRecycleBag: [inBag],
      backpackItems: [],
      remainingDeck: [oldDeckCard] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    // 关键：专属感召在背包第 1 格，不在 remainingDeck
    expect(result.state.backpackItems[0]?.id).toBe(STARTER_CARD_IDS.discoverClassToHand);
    expect((result.state.remainingDeck as GameCardData[])[0]?.id).toBe('m-deck-existing');
    expect(result.state.permanentMagicRecycleBag.length).toBe(0);
  });

  // 回归保护（user 报告：「专属感召在 waterfall 洗回背包时消失」）。
  // ----------------------------------------------------------------------
  // 旧 bug：APPLY_WATERFALL_EFFECTS 把置顶卡 prepend 到 state.remainingDeck，
  // 但 pendingWaterfallPlan.nextRemainingDeck 是 TRIGGER_WATERFALL 时计算的
  // stale 快照，从未同步。后续 APPLY_WATERFALL_DEAL 用
  // `patch.remainingDeck = plan.nextRemainingDeck` 覆盖整个 deck，把刚 prepend
  // 的置顶卡擦掉 → 专属感召凭空消失。
  //
  // **新语义下这条 bug 自动被消除**：置顶卡现在走 `backpackItems[0]`，跟
  // `pendingWaterfallPlan.nextRemainingDeck` 完全无关。但我们仍然保留这条
  // 端到端测试覆盖完整管线（EFFECTS → DROP → DEAL），确保任何未来对
  // waterfall 管线的改动不会让置顶卡再次消失。
  it('回归：专属感召经完整 waterfall 管线（EFFECTS→DROP→DEAL）后仍在 backpackItems[0]', () => {
    const ganzhao = createStarterDiscoverClassToHandCard();
    const inBag = { ...ganzhao, _recycleWaits: 1 } as GameCardData;
    const oldDeckCard = makeMonster('m-old');

    // 模拟 TRIGGER_WATERFALL 计算的 plan：nextPreviewCards=[]（不发新 preview），
    // nextRemainingDeck=[oldDeckCard]（计算时刻的快照，**不**包含 ganzhao —— 它会进 backpack）。
    const plan = {
      dropAssignments: [],
      resolvedDropCards: [],
      dropPreviewIndices: [],
      dropTargetSlots: [],
      discardCard: null,
      discardPreviewIndex: null,
      discardDestination: 'graveyard' as const,
      nextPreviewCards: [],
      nextRemainingDeck: [oldDeckCard],
      newPreviewStacks: {},
      shouldDeclareVictory: false,
      stuckFinalMonsters: [],
      rng: makeIdleState().rng,
    };

    const state = makeIdleState({
      permanentMagicRecycleBag: [inBag],
      backpackItems: [],
      remainingDeck: [oldDeckCard] as any,
      pendingWaterfallPlan: plan as any,
    });

    const result = drain(state, [
      { type: 'APPLY_WATERFALL_EFFECTS' } as GameAction,
      { type: 'APPLY_WATERFALL_DROP' } as GameAction,
      { type: 'APPLY_WATERFALL_DEAL' } as GameAction,
    ]);

    // 关键断言：专属感召**没有**消失。完整管线跑完后它在 backpackItems[0]。
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    // 真正应该在的地方：背包第 1 格
    expect(result.state.backpackItems[0]?.id).toBe(STARTER_CARD_IDS.discoverClassToHand);
    // remainingDeck 跟 plan 一致，无 ganzhao
    expect((result.state.remainingDeck as GameCardData[])[0]?.id).toBe('m-old');
    expect((result.state.remainingDeck as GameCardData[]).find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
  });

  // 回归（最完整 end-to-end）：复刻真实游戏完整链路。
  // 1. 从「专属感召在手牌」开始
  // 2. dispatch ADD_TO_RECYCLE_BAG（模拟 FINALIZE_MAGIC_CARD 的路由结果）
  // 3. 模拟 active row 已经清空 → 通过任何能触发 postProcessActiveCards 的 action
  //    让 reducer 自动计算 pendingWaterfallPlan
  // 4. dispatch APPLY_WATERFALL_EFFECTS / DROP / DEAL（startWaterfallAnimation 做的事）
  // 5. 断言：专属感召在 backpackItems[0]，不在其它任何位置
  it('回归（end-to-end）：从手牌出 → 进回收袋 → 自动 plan → 完整瀑流 → 专属感召在 backpackItems[0]', async () => {
    const { computeWaterfallDropPlan } = await import('../rules/waterfall');
    const ganzhao = createStarterDiscoverClassToHandCard();

    // Active row 全空（瀑流自动触发的最常见 trigger）+ deck 有几张普通怪物。
    const c1 = makeMonster('c1');
    const c2 = makeMonster('c2');
    const c3 = makeMonster('c3');
    const c4 = makeMonster('c4');
    const c5 = makeMonster('c5');

    let state = makeIdleState({
      permanentMagicRecycleBag: [],
      backpackItems: [],
      remainingDeck: [c1, c2, c3, c4, c5] as any,
      activeCards: [null, null, null, null] as any,
      previewCards: [null, null, null, null] as any,
    });

    // Step 1: 把 ganzhao 进回收袋（FINALIZE_MAGIC_CARD 的最终步骤）
    const r1 = drain(state, [{ type: 'ADD_TO_RECYCLE_BAG', card: ganzhao } as GameAction]);
    state = r1.state;
    expect(state.permanentMagicRecycleBag.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeDefined();
    expect((state.permanentMagicRecycleBag.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand) as any)?._recycleWaits).toBe(1);

    // Step 2: 模拟瀑流计划被自动计算
    const plan = computeWaterfallDropPlan(state, false);
    expect(plan).not.toBeNull();
    state = { ...state, pendingWaterfallPlan: plan!, rng: plan!.rng };

    // Step 3: 跑完整 startWaterfallAnimation 顺序
    const r2 = drain(state, [
      { type: 'APPLY_WATERFALL_EFFECTS' } as GameAction,
      { type: 'APPLY_WATERFALL_DROP' } as GameAction,
      { type: 'APPLY_WATERFALL_DEAL' } as GameAction,
    ]);
    state = r2.state;

    // 关键断言：专属感召在 backpackItems[0]，绝对不能消失。
    expect(state.permanentMagicRecycleBag.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect(state.handCards.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect(state.discardedCards.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect((state.remainingDeck as GameCardData[]).find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect(state.backpackItems[0]?.id).toBe(STARTER_CARD_IDS.discoverClassToHand);
    // Preview 应该有 [c1, c2, c3, c4]（不被 ganzhao 影响），不应有 ganzhao
    expect(state.previewCards.find(c => c?.id === STARTER_CARD_IDS.discoverClassToHand)).toBeFalsy();
  });

  // 回归（更接近真实游戏的 fixture）：plan.nextPreviewCards 非空 + 多张 deck 卡。
  // 这条测试覆盖 user 实际遇到的场景：active 行清空触发瀑流，preview 卡 drop 进
  // active，新的 preview 从 deck 抽 4 张，剩余 deck 进 nextRemainingDeck。
  it('回归（真实 fixture）：preview drop + 新 preview 抽牌 后，专属感召仍在 backpackItems[0]', () => {
    const ganzhao = createStarterDiscoverClassToHandCard();
    const inBag = { ...ganzhao, _recycleWaits: 1 } as GameCardData;
    const c1 = makeMonster('c1');
    const c2 = makeMonster('c2');
    const c3 = makeMonster('c3');
    const c4 = makeMonster('c4');
    const c5 = makeMonster('c5');
    const c6 = makeMonster('c6');
    const c7 = makeMonster('c7');
    const c8 = makeMonster('c8');

    const plan = {
      dropAssignments: [],
      resolvedDropCards: [],
      dropPreviewIndices: [],
      dropTargetSlots: [],
      discardCard: null,
      discardPreviewIndex: null,
      discardDestination: 'graveyard' as const,
      nextPreviewCards: [c1, c2, c3, c4],
      nextRemainingDeck: [c5, c6, c7, c8],
      newPreviewStacks: {},
      shouldDeclareVictory: false,
      stuckFinalMonsters: [],
      rng: makeIdleState().rng,
    };

    const state = makeIdleState({
      permanentMagicRecycleBag: [inBag],
      backpackItems: [],
      remainingDeck: [c1, c2, c3, c4, c5, c6, c7, c8] as any,
      pendingWaterfallPlan: plan as any,
    });

    const result = drain(state, [
      { type: 'APPLY_WATERFALL_EFFECTS' } as GameAction,
      { type: 'APPLY_WATERFALL_DROP' } as GameAction,
      { type: 'APPLY_WATERFALL_DEAL' } as GameAction,
    ]);

    // 专属感召必须在 backpackItems[0]（不是 deck / hand / 坟场 / recycleBag）。
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect((result.state.remainingDeck as GameCardData[]).find(c => c.id === STARTER_CARD_IDS.discoverClassToHand)).toBeUndefined();
    expect(result.state.backpackItems[0]?.id).toBe(STARTER_CARD_IDS.discoverClassToHand);
    // 后续 deck 顺序按 plan：[c5, c6, c7, c8]（c1-c4 已经进 preview）。
    expect((result.state.remainingDeck as GameCardData[]).map(c => c.id)).toEqual(['c5', 'c6', 'c7', 'c8']);
    // Preview 应该是 plan.nextPreviewCards = [c1, c2, c3, c4]（不被 ganzhao 影响）。
    expect(result.state.previewCards.filter(Boolean).map(c => c!.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });
});
