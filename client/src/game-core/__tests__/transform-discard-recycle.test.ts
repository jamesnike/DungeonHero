/**
 * 唤回秘药 · 侧击 (`discard-recycle-to-hand:N`) 弃回 → 回收袋取回 流程测试
 *
 * 该侧击效果由 `唤回秘药` (`transform-recycle-grant`) potion 赋给手牌：
 *   "选择一张手牌，赋予「侧击：选择一张手牌弃回，从回收袋随机取 1 张牌加入手牌」"
 *
 * 历史背景：早期实现挂在「转型」上（同一交互流程曾用 transformEffect 字段触发），
 * 现已迁移为「侧击」触发——放在手牌最左 / 最右位置打出时生效。卡面 / 文案 / 触发
 * 条件全部统一到 flankEffect / flankEffectId 系统。
 *
 * 内部 subEffect / context.kind 仍保留 `'transform-discard-recycle'` 名字——它描述
 * 的是「弃回·回收袋取」这条互动流程的 *形状*，跟当前触发条件无关。
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
 * 侧击源卡：一张普通 magic 牌，带 flankEffect / flankEffectId。
 * 触发条件：放在手牌**最左**（index 0）或**最右**（最后一位）打出。
 * 测试中我们把它放在 index 0 → 走 PLAY_CARD 时 isFlank=true。
 */
function makeFlankSource(id = 'src'): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: '侧击源卡',
    value: 0,
    image: '',
    flankEffect: '弃 1 张手牌·回收袋取 1 张',
    flankEffectId: 'discard-recycle-to-hand:1',
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

describe('唤回秘药·侧击: discard-recycle-to-hand', () => {
  it('手牌有可弃牌 + 回收袋有牌 → 弹出弃回弹窗，确认后玩家选的卡进坟场，回收袋牌进手牌', () => {
    const src = makeFlankSource();
    const h1 = makeFiller('h1', 'Alpha');
    const h2 = makeFiller('h2', 'Beta');
    const bag1 = makeRecycleBagCard('bag1', 'BagAlpha');
    // src 在 index 0（最左）→ 出牌时 isFlank=true
    const state = makeState({
      handCards: [src, h1, h2],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
    });

    const after = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);

    expect(after.state.pendingHandDiscardSelection).not.toBeNull();
    const pending = after.state.pendingHandDiscardSelection!;
    expect(pending.subEffect).toBe('transform-discard-recycle');
    expect(pending.count).toBe(1);
    expect(pending.sourceCardId).toBe(src.id);
    expect(pending.context.kind).toBe('transform-discard-recycle');
    // 源卡已经被 PLAY_CARD 移出手牌
    expect(after.state.handCards.find(c => c.id === src.id)).toBeUndefined();
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
    const src = makeFlankSource();
    const curse = makeCurse('curse-1');
    const bag1 = makeRecycleBagCard('bag1', 'BagAlpha');
    // src 在 index 0（最左）→ flank
    const state = makeState({
      handCards: [src, curse],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
    });

    const after = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);

    expect(after.state.pendingHandDiscardSelection).toBeNull();
    expect(after.state.handCards.find(c => c.id === 'curse-1')).toBeDefined();
    expect(after.state.handCards.find(c => c.id === 'bag1')).toBeDefined();
    expect(after.state.permanentMagicRecycleBag.find(c => c.id === 'bag1')).toBeUndefined();
  });

  it('回收袋为空但手牌有可弃牌 → 仍弹窗，玩家弃 1 张，无牌可抽（discard_anyway）', () => {
    const src = makeFlankSource();
    const h1 = makeFiller('h1', 'Alpha');
    const state = makeState({
      handCards: [src, h1],
      permanentMagicRecycleBag: [] as GameCardData[],
    });

    const after = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);

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

  it('手牌无可弃 + 回收袋为空 → 不弹窗、不抽牌，仅 banner 提示', () => {
    const src = makeFlankSource();
    const curse = makeCurse('curse-1');
    const state = makeState({
      handCards: [src, curse],
      permanentMagicRecycleBag: [] as GameCardData[],
    });

    const after = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);

    expect(after.state.pendingHandDiscardSelection).toBeNull();
    expect(after.state.handCards.find(c => c.id === 'curse-1')).toBeDefined();
    expect(after.state.permanentMagicRecycleBag.length).toBe(0);
    expect(after.sideEffects.some(
      e => e.event === 'ui:banner' && (e.payload as any)?.text?.includes('侧击触发'),
    )).toBe(true);
  });

  it('源卡不在最左/最右（中间位置）→ 不是 flank，不触发弃回·回收袋取效果', () => {
    const src = makeFlankSource();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const bag1 = makeRecycleBagCard('bag1');
    // src 在 index 1（中间）→ isFlank=false
    const state = makeState({
      handCards: [h1, src, h2],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
    });

    const after = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);

    expect(after.state.pendingHandDiscardSelection).toBeNull();
    expect(after.state.handCards.find(c => c.id === 'h1')).toBeDefined();
    expect(after.state.handCards.find(c => c.id === 'h2')).toBeDefined();
    // 回收袋牌仍在袋里（侧击未触发，没人去取）
    expect(after.state.permanentMagicRecycleBag.find(c => c.id === 'bag1')).toBeDefined();
    expect(after.state.handCards.find(c => c.id === 'bag1')).toBeUndefined();
  });

  it('源卡在最右位置（rightmost flank）→ 同样触发弃回·回收袋取流程', () => {
    const src = makeFlankSource();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const bag1 = makeRecycleBagCard('bag1');
    // src 在最后一位（最右）→ isFlank=true
    const state = makeState({
      handCards: [h1, h2, src],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
    });

    const after = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);

    expect(after.state.pendingHandDiscardSelection).not.toBeNull();
  });

  it('弃回经 DISCARD_OWNED_CARD 路由：非永久卡进坟场（owned_discard 语义）', () => {
    const src = makeFlankSource();
    const h1 = makeFiller('h1', 'NormalCard');
    const bag1 = makeRecycleBagCard('bag1');
    const state = makeState({
      handCards: [src, h1],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
    });

    let result = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);
    result = processAction(result.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1'],
    } as GameAction);

    expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'h1')).toBeUndefined();
  });

  it('弃回经 DISCARD_OWNED_CARD 路由：Perm 卡（recycleDelay > 0）进回收袋', () => {
    const src = makeFlankSource();
    const permCard: GameCardData = {
      ...makeFiller('h1', 'PermCard'),
      magicType: 'permanent',
      recycleDelay: 2,
    } as GameCardData;
    const bag1 = makeRecycleBagCard('bag1');
    const state = makeState({
      handCards: [src, permCard],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
    });

    let result = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);
    result = processAction(result.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1'],
    } as GameAction);

    expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bag1')).toBeDefined();
  });

  it('选择数量 != count → reducer 拒绝（modal 仍开着、手牌不变）', () => {
    const src = makeFlankSource();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const bag1 = makeRecycleBagCard('bag1');
    const state = makeState({
      handCards: [src, h1, h2],
      permanentMagicRecycleBag: [bag1] as GameCardData[],
    });

    const after = processAction(state, { type: 'PLAY_CARD', cardId: src.id } as GameAction);
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
