/**
 * 唤回秘药 · 转型 (`discard-recycle-to-hand:N`) 弃回 → 回收袋取回 流程测试
 *
 * 该转型效果由 `唤回秘药` (`transform-recycle-grant`) potion 赋给手牌：
 *   "选择一张手牌，赋予「转型：选择一张手牌弃回，从回收袋随机取 1 张牌加入手牌」"
 *
 * 与旧版 `recycle-to-hand:N`（直接从回收袋抽牌、不弃手牌）不同，新版要求
 * 互动式弃回 1 张手牌，再从回收袋随机抽 1 张到手牌。
 *
 * 三条边界条件（玩家已确认设计意图）：
 *   1. **手牌没有可弃牌**（仅源卡 + 诅咒）→ 跳过弃回，**仍**尝试从回收袋抽。
 *   2. **回收袋为空**         → 仍要求玩家弃 1 张（discard_anyway）。
 *   3. **弃回语义**           → 走 `DISCARD_OWNED_CARD`，触发 onDiscardDraw / catapult 等弃置联动。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { SideEffect } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

/**
 * 模拟 engine.dispatch → _processAction：
 *   1. 直接 reduce 顶层 action（绕过 drain 的 input-pause 门，因为这是
 *      玩家输入而非系统层 follow-up）；
 *   2. 把 enqueued follow-up actions 推到 actionQueue 头部并 drain 一遍。
 *
 * 这样测试才能跑通 `phase: 'playerInput'` 下的 RESOLVE_HAND_DISCARD_SELECTION
 * 流程（drain 单独喂这条 action 会被 input-pause 挡掉）。
 */
function processAction(state: GameState, action: GameAction): { state: GameState; sideEffects: SideEffect[] } {
  const reduced = reduce(state, action);
  let next: GameState = {
    ...reduced.state,
    actionQueue: [...reduced.enqueuedActions, ...reduced.state.actionQueue],
  };
  const allSideEffects: SideEffect[] = [...reduced.sideEffects];
  if (next.actionQueue.length > 0) {
    const drained = drain(next, next.actionQueue);
    next = { ...drained.state, actionQueue: drained.queue };
    allSideEffects.push(...drained.sideEffects);
  }
  return { state: next, sideEffects: allSideEffects };
}

function makeFiller(id: string, name = `Filler-${id}`): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name,
    value: 0,
    image: '',
  } as GameCardData;
}

function makeCurse(id: string): GameCardData {
  return {
    id,
    type: 'curse' as const,
    name: `诅咒-${id}`,
    value: 0,
    image: '',
  } as unknown as GameCardData;
}

/**
 * 转型源卡：一张 `magic` (perm-magic) 牌，带有 transform 字段。
 * APPLY_TRANSFORM_CATEGORY 比较的是 transformChainPrevCategory（由前一张牌设定）
 * 与当前牌的类别。我们让 prev='event'、cur='perm-magic'，类别不同 → 转型触发。
 */
function makeTransformSource(id = 'src'): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: '转型源卡',
    value: 0,
    image: '',
    magicType: 'permanent',
    transformBonus: '弃 1 张手牌·回收袋取 1 张',
    transformEffect: 'discard-recycle-to-hand:1',
  } as GameCardData;
}

function makeRecycleBagCard(id: string, name = `Bag-${id}`): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name,
    value: 0,
    image: '',
  } as GameCardData;
}

describe('唤回秘药·转型: discard-recycle-to-hand', () => {
  it('手牌有可弃牌 + 回收袋有牌 → 弹出弃回弹窗，确认后玩家选的卡进坟场，回收袋牌进手牌', () => {
    const src = makeTransformSource();
    const h1 = makeFiller('h1', 'Alpha');
    const h2 = makeFiller('h2', 'Beta');
    const bag1 = makeRecycleBagCard('bag1', 'BagAlpha');
    const state = makeState({
      handCards: [src, h1, h2],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
      transformChainPrevCategory: 'event',
    });

    const after = processAction(state, { type: 'APPLY_TRANSFORM_CATEGORY', card: src } as GameAction);

    expect(after.state.pendingHandDiscardSelection).not.toBeNull();
    const pending = after.state.pendingHandDiscardSelection!;
    expect(pending.subEffect).toBe('transform-discard-recycle');
    expect(pending.count).toBe(1);
    expect(pending.sourceCardId).toBe(src.id);
    expect(pending.context.kind).toBe('transform-discard-recycle');
    expect(after.state.handCards.find(c => c.id === 'h1')).toBeDefined();
    expect(after.state.handCards.find(c => c.id === 'h2')).toBeDefined();
    expect(after.state.permanentMagicRecycleBag.length).toBe(1);

    const resolved = processAction(after.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1'],
    } as GameAction);

    expect(resolved.state.pendingHandDiscardSelection).toBeNull();
    expect(resolved.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(resolved.state.discardedCards.find(c => c.id === 'h1')).toBeDefined();
    expect(resolved.state.handCards.find(c => c.id === 'bag1')).toBeDefined();
    expect(resolved.state.permanentMagicRecycleBag.find(c => c.id === 'bag1')).toBeUndefined();
  });

  it('手牌没有可弃牌（仅源卡 + 诅咒）→ 跳过弃回，仍从回收袋抽 1 张到手', () => {
    const src = makeTransformSource();
    const curse = makeCurse('curse-1');
    const bag1 = makeRecycleBagCard('bag1', 'BagAlpha');
    const state = makeState({
      handCards: [src, curse],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
      transformChainPrevCategory: 'event',
    });

    const after = processAction(state, { type: 'APPLY_TRANSFORM_CATEGORY', card: src } as GameAction);

    expect(after.state.pendingHandDiscardSelection).toBeNull();
    expect(after.state.handCards.find(c => c.id === 'curse-1')).toBeDefined();
    expect(after.state.handCards.find(c => c.id === 'bag1')).toBeDefined();
    expect(after.state.permanentMagicRecycleBag.find(c => c.id === 'bag1')).toBeUndefined();
  });

  it('回收袋为空但手牌有可弃牌 → 仍弹窗，玩家弃 1 张，无牌可抽（discard_anyway）', () => {
    const src = makeTransformSource();
    const h1 = makeFiller('h1', 'Alpha');
    const state = makeState({
      handCards: [src, h1],
      permanentMagicRecycleBag: [] as GameCardData[],
      transformChainPrevCategory: 'event',
    });

    const after = processAction(state, { type: 'APPLY_TRANSFORM_CATEGORY', card: src } as GameAction);

    expect(after.state.pendingHandDiscardSelection).not.toBeNull();
    const handBeforeResolve = after.state.handCards.length;

    const resolved = processAction(after.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1'],
    } as GameAction);

    expect(resolved.state.pendingHandDiscardSelection).toBeNull();
    expect(resolved.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(resolved.state.discardedCards.find(c => c.id === 'h1')).toBeDefined();
    expect(resolved.state.handCards.length).toBe(handBeforeResolve - 1);
    expect(resolved.state.permanentMagicRecycleBag.length).toBe(0);
    expect(resolved.sideEffects.some(
      e => e.event === 'ui:banner' && (e.payload as any)?.text?.includes('回收袋为空'),
    )).toBe(true);
  });

  it('手牌无可弃 + 回收袋为空 → 不弹窗、不抽牌，仅 banner 提示（src 仍在手中，因未走 PLAY_CARD）', () => {
    const src = makeTransformSource();
    const curse = makeCurse('curse-1');
    const state = makeState({
      handCards: [src, curse],
      permanentMagicRecycleBag: [] as GameCardData[],
      transformChainPrevCategory: 'event',
    });

    const after = processAction(state, { type: 'APPLY_TRANSFORM_CATEGORY', card: src } as GameAction);

    expect(after.state.pendingHandDiscardSelection).toBeNull();
    expect(after.state.handCards.find(c => c.id === 'curse-1')).toBeDefined();
    expect(after.state.handCards.find(c => c.id === 'src')).toBeDefined();
    expect(after.state.permanentMagicRecycleBag.length).toBe(0);
    expect(after.sideEffects.some(
      e => e.event === 'ui:banner' && (e.payload as any)?.text?.includes('转型触发'),
    )).toBe(true);
  });

  it('类别相同（prev=perm-magic, cur=perm-magic）→ 转型不触发，无弹窗', () => {
    const src = makeTransformSource();
    const h1 = makeFiller('h1');
    const bag1 = makeRecycleBagCard('bag1');
    const state = makeState({
      handCards: [src, h1],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
      transformChainPrevCategory: 'perm-magic',
    });

    const after = processAction(state, { type: 'APPLY_TRANSFORM_CATEGORY', card: src } as GameAction);

    expect(after.state.pendingHandDiscardSelection).toBeNull();
    expect(after.state.handCards.find(c => c.id === 'h1')).toBeDefined();
    expect(after.state.permanentMagicRecycleBag.find(c => c.id === 'bag1')).toBeDefined();
  });

  it('弃回经 DISCARD_OWNED_CARD 路由：非永久卡进坟场（owned_discard 语义）', () => {
    const src = makeTransformSource();
    const h1 = makeFiller('h1', 'NormalCard');
    const bag1 = makeRecycleBagCard('bag1');
    const state = makeState({
      handCards: [src, h1],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
      transformChainPrevCategory: 'event',
    });

    let result = processAction(state, { type: 'APPLY_TRANSFORM_CATEGORY', card: src } as GameAction);
    result = processAction(result.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1'],
    } as GameAction);

    expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'h1')).toBeUndefined();
  });

  it('弃回经 DISCARD_OWNED_CARD 路由：Perm 卡（recycleDelay > 0）进回收袋', () => {
    const src = makeTransformSource();
    const permCard: GameCardData = {
      ...makeFiller('h1', 'PermCard'),
      magicType: 'permanent',
      recycleDelay: 2,
    } as GameCardData;
    const bag1 = makeRecycleBagCard('bag1');
    const state = makeState({
      handCards: [src, permCard],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
      transformChainPrevCategory: 'event',
    });

    let result = processAction(state, { type: 'APPLY_TRANSFORM_CATEGORY', card: src } as GameAction);
    result = processAction(result.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1'],
    } as GameAction);

    expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bag1')).toBeDefined();
  });

  it('选择数量 != count → reducer 拒绝（modal 仍开着、手牌不变）', () => {
    const src = makeTransformSource();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const bag1 = makeRecycleBagCard('bag1');
    const state = makeState({
      handCards: [src, h1, h2],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
      transformChainPrevCategory: 'event',
    });

    const after = processAction(state, { type: 'APPLY_TRANSFORM_CATEGORY', card: src } as GameAction);
    expect(after.state.pendingHandDiscardSelection).not.toBeNull();

    const before = after.state;
    const rejected = reduce(before, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1', 'h2'],
    } as GameAction);
    expect(rejected.state.pendingHandDiscardSelection).toBe(before.pendingHandDiscardSelection);
    expect(rejected.state.handCards.length).toBe(before.handCards.length);
  });
});
