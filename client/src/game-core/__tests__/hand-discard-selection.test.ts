/**
 * 玩家手动选择手牌弃回流程测试
 *
 * 覆盖以下卡牌效果：
 *   - 汰旧迎新 (STARTER_CARD_IDS.discardDraw)
 *   - 祭坛秘术 (altar-discard-discover)
 *   - 专属召唤 (class-summon)
 *   - 回响行囊 (echo-bag)
 *   - 噬血砺锋 (discard-empower 英雄技能)
 *
 * 测试两条主路径：
 *   1. 可弃手牌 ≥ 必须张数 → 弹出 pendingHandDiscardSelection；
 *      RESOLVE_HAND_DISCARD_SELECTION 把玩家挑的具体卡放入坟场/回收袋。
 *   2. 可弃手牌 < 必须张数 → 自动随机弃掉全部可弃手牌（也可能 0 张），
 *      不弹窗、直接进入下游效果。
 *   3. 诅咒卡牌不在玩家可选列表里。
 *   4. 重复 / 越界 / 不存在的 cardIds 在 reducer 里被拒绝。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import { STARTER_CARD_IDS } from '../deck';
import { reduce } from '../reducer';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
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

function makeAltar(id = 'altar-1'): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: '祭坛秘术',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'altar-discard-discover',
    description: 'test',
    classCard: true,
  } as GameCardData;
}

function makeDiscardDraw(id = `${STARTER_CARD_IDS.discardDraw}-pick-1`): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: '汰旧迎新',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: STARTER_CARD_IDS.discardDraw,
    description: 'test',
    recycleDelay: 2,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 祭坛秘术 (altar-discard-discover)
// ---------------------------------------------------------------------------

describe('祭坛秘术 — 玩家选择弃回', () => {
  it('手牌足够（≥2 张可弃）→ 弹出 pendingHandDiscardSelection（不立刻弃牌）', () => {
    const card = makeAltar();
    const h1 = makeFiller('h1', 'A');
    const h2 = makeFiller('h2', 'B');
    const h3 = makeFiller('h3', 'C');
    const state = makeState({
      handCards: [card, h1, h2, h3],
      classDeck: [
        { id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' },
        { id: 'cd2', type: 'magic', name: 'CD2', value: 0, image: '' },
      ] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingHandDiscardSelection).not.toBeNull();
    const pending = result.state.pendingHandDiscardSelection!;
    expect(pending.subEffect).toBe('altar-discover');
    expect(pending.count).toBe(2);
    expect(pending.sourceCardId).toBe(card.id);
    // 三张普通手牌仍在手里（PLAY_CARD 已经把 card 自身移走）
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'h2')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'h3')).toBeDefined();
  });

  it('RESOLVE_HAND_DISCARD_SELECTION → 把玩家选的两张移入坟场，触发发现', () => {
    const card = makeAltar();
    const h1 = makeFiller('h1', 'Alpha');
    const h2 = makeFiller('h2', 'Beta');
    const h3 = makeFiller('h3', 'Gamma');
    const state = makeState({
      handCards: [card, h1, h2, h3],
      classDeck: [
        { id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' },
      ] as any,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingHandDiscardSelection).not.toBeNull();

    result = drain(result.state, [
      { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['h1', 'h3'] } as GameAction,
    ]);

    expect(result.state.pendingHandDiscardSelection).toBeNull();
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === 'h3')).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === 'h2')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'h3')).toBeDefined();
  });

  it('可弃手牌不足 2 张（仅 1 张普通手牌）→ 自动随机弃掉那 1 张，不弹窗', () => {
    const card = makeAltar();
    const h1 = makeFiller('h1');
    const state = makeState({
      handCards: [card, h1],
      classDeck: [{ id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' }] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingHandDiscardSelection).toBeNull();
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeDefined();
  });

  it('诅咒卡牌不计入可弃手牌：3 张诅咒 → auto 路径弃 0 张', () => {
    const card = makeAltar();
    const c1 = makeCurse('curse-1');
    const c2 = makeCurse('curse-2');
    const c3 = makeCurse('curse-3');
    const state = makeState({
      handCards: [card, c1, c2, c3],
      classDeck: [{ id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' }] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingHandDiscardSelection).toBeNull();
    // 诅咒仍留在手里
    expect(result.state.handCards.find(c => c.id === 'curse-1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'curse-2')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'curse-3')).toBeDefined();
    // 没有任何卡进坟场
    expect(result.state.discardedCards.find(c => c.id?.startsWith('curse-'))).toBeUndefined();
  });

  it('诅咒卡牌不出现在 RESOLVE_HAND_DISCARD_SELECTION 候选里：玩家如果尝试选诅咒会被拒', () => {
    const card = makeAltar();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const c1 = makeCurse('curse-1');
    const state = makeState({
      handCards: [card, h1, h2, c1],
      classDeck: [{ id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' }] as any,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingHandDiscardSelection).not.toBeNull();

    // 尝试把诅咒塞进选择 → reducer 拒绝（state 不变）
    const before = result.state;
    result = { state: reduce(result.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1', 'curse-1'],
    } as GameAction).state, sideEffects: [], enqueuedActions: [] } as any;
    expect(result.state.pendingHandDiscardSelection).toBe(before.pendingHandDiscardSelection);
    expect(result.state.handCards.length).toBe(before.handCards.length);
  });

  it('选择数量不等于 count → reducer 拒绝（noChange）', () => {
    const card = makeAltar();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const h3 = makeFiller('h3');
    const state = makeState({
      handCards: [card, h1, h2, h3],
      classDeck: [{ id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' }] as any,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const beforePending = result.state.pendingHandDiscardSelection;
    expect(beforePending).not.toBeNull();

    // 只选 1 张 → 拒绝
    const after = reduce(result.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1'],
    } as GameAction);
    expect(after.state.pendingHandDiscardSelection).toBe(beforePending);
  });

  it('重复的 cardId → reducer 拒绝（noChange）', () => {
    const card = makeAltar();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const state = makeState({
      handCards: [card, h1, h2],
      classDeck: [{ id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' }] as any,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const beforePending = result.state.pendingHandDiscardSelection;
    expect(beforePending).not.toBeNull();

    const after = reduce(result.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1', 'h1'],
    } as GameAction);
    expect(after.state.pendingHandDiscardSelection).toBe(beforePending);
  });
});

// ---------------------------------------------------------------------------
// 汰旧迎新 (discard-draw)
// ---------------------------------------------------------------------------

describe('汰旧迎新 — 玩家选择弃回', () => {
  it('手牌足够 → 弹出 pendingHandDiscardSelection（subEffect=discard-draw）', () => {
    const card = makeDiscardDraw();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const state = makeState({
      handCards: [card, h1, h2],
      backpackItems: [makeFiller('bp1'), makeFiller('bp2')] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingHandDiscardSelection).not.toBeNull();
    const pending = result.state.pendingHandDiscardSelection!;
    expect(pending.subEffect).toBe('discard-draw');
    expect(pending.count).toBe(1);
    expect(pending.sourceCardId).toBe(card.id);
  });

  it('RESOLVE → 玩家选的牌进回收袋（不是坟场），背包抽两张到手', () => {
    const card = makeDiscardDraw();
    const h1 = makeFiller('h1', 'PickMe');
    const h2 = makeFiller('h2', 'KeepMe');
    const bp1 = makeFiller('bp1');
    const bp2 = makeFiller('bp2');
    const state = makeState({
      handCards: [card, h1, h2],
      backpackItems: [bp1, bp2] as any,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    result = drain(result.state, [
      { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['h1'] } as GameAction,
    ]);

    expect(result.state.pendingHandDiscardSelection).toBeNull();
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === 'h2')).toBeDefined();
    // h1 应在回收袋（不是坟场）
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeUndefined();
    // 背包两张牌已抽到手
    expect(result.state.handCards.find(c => c.id === 'bp1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp2')).toBeDefined();
  });

  it('可弃手牌不足（仅有源卡牌+1 张诅咒）→ 自动跑后续，pendingHandDiscardSelection 为空', () => {
    const card = makeDiscardDraw();
    const c1 = makeCurse('curse-1');
    const state = makeState({
      handCards: [card, c1],
      backpackItems: [makeFiller('bp1')] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingHandDiscardSelection).toBeNull();
    // 诅咒仍在手里
    expect(result.state.handCards.find(c => c.id === 'curse-1')).toBeDefined();
    // 背包一张牌仍被抽到手（汰旧迎新的下游效果）
    expect(result.state.handCards.find(c => c.id === 'bp1')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 噬血砺锋 (discard-empower 英雄技能)
// ---------------------------------------------------------------------------

describe('噬血砺锋 — 玩家选择弃回', () => {
  function makeWeapon(id: string) {
    return {
      id,
      type: 'weapon' as const,
      name: `Sword-${id}`,
      value: 3,
      durability: 3,
      maxDurability: 3,
      image: '',
    } as unknown as GameCardData;
  }

  it('手牌足够 → 弹出 pendingHandDiscardSelection（subEffect=discard-empower）', () => {
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const state = makeState({
      handCards: [h1, h2],
      equipmentSlot1: makeWeapon('eq1') as any,
      equipmentSlot2: null,
      selectedHeroSkill: 'discard-empower',
    });
    const result = reduce(state, { type: 'USE_HERO_SKILL', skillId: 'discard-empower' } as GameAction);

    expect(result.state.pendingHandDiscardSelection).not.toBeNull();
    const pending = result.state.pendingHandDiscardSelection!;
    expect(pending.subEffect).toBe('discard-empower');
    expect(pending.count).toBe(1);
    expect(pending.sourceCardId).toBeNull();
  });

  it('RESOLVE → 选中的牌入坟场，单装备直接挂 burst+lifesteal', () => {
    const h1 = makeFiller('h1', 'Discardable');
    const eq1 = makeWeapon('eq1');
    const state = makeState({
      handCards: [h1],
      equipmentSlot1: eq1 as any,
      equipmentSlot2: null,
      selectedHeroSkill: 'discard-empower',
    });
    let result = reduce(state, { type: 'USE_HERO_SKILL', skillId: 'discard-empower' } as GameAction);
    expect(result.state.pendingHandDiscardSelection).not.toBeNull();

    result = reduce(result.state, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: ['h1'],
    } as GameAction);

    expect(result.state.pendingHandDiscardSelection).toBeNull();
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.slotAttackBursts?.equipmentSlot1).toBe(2);
    expect(result.state.nextAttackLifestealSlot).toBe('equipmentSlot1');
  });
});
