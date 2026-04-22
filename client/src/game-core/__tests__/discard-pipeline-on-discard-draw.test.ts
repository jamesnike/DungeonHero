/**
 * Regression: 共享弃置流水线（DISCARD_OWNED_CARD → APPLY_DISCARD_EFFECTS）
 *
 * 修复前 bug：以下卡/技能在弃回手牌时，绕过了 APPLY_DISCARD_EFFECTS：
 *   - 专属召唤（class-summon, instant + permanent 两个分支）
 *   - 祭坛秘术（altar-discard-discover）
 *   - 汰旧迎新（discard-draw）
 *   - 回响行囊（echo-bag, resolveEchoBag inline + finalizeEchoBag modal）
 *   - 噬血砺锋（discard-empower 英雄技能）
 *
 * 表现：被弃回的卡（如「回响残页」onDiscardDraw: 2、「墓语回响」onDiscardDraw: 3、
 *      触发 honor-blood 的卡、catapult/discard-zap 护符等）的弃置副作用全部不触发。
 *
 * 修复：所有 finalize* / inline 弃回路径改用 DISCARD_OWNED_CARD action，
 *      由统一的 reduceDiscardOwnedCard 路由（永久 → 回收袋；非永久 → 坟场）
 *      并 enqueue APPLY_DISCARD_EFFECTS。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import { STARTER_CARD_IDS } from '../deck';
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

function makeEchoRemnant(id = 'echo-rem-1'): GameCardData {
  // 「回响残页」: permanent magic with onDiscardDraw: 2
  return {
    id,
    type: 'magic',
    name: '回响残页',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: 'on-discard-draw-2',
    description: '永久魔法：被弃回时，从背包抽 2 张牌。',
    onDiscardDraw: 2,
    recycleDelay: 1,
  } as GameCardData;
}

function makeClassSummonInstant(id = 'cs-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '专属召唤',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: '即时魔法：弃回至多 2 张牌，获得一张职业专属卡。',
  } as GameCardData;
}

function makeClassSummonPermanent(id = 'cs-perm-1'): GameCardData {
  // upgraded 专属召唤 (Perm 2)
  return {
    id,
    type: 'magic',
    name: '专属召唤',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: '永久魔法：弃回至多 2 张牌，获得一张职业专属卡。',
    recycleDelay: 2,
  } as GameCardData;
}

function makeAltar(id = 'altar-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '祭坛秘术',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'altar-discard-discover',
    classCard: true,
  } as GameCardData;
}

function makeDiscardDraw(id = `${STARTER_CARD_IDS.discardDraw}-pick-1`): GameCardData {
  return {
    id,
    type: 'magic',
    name: '汰旧迎新',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: STARTER_CARD_IDS.discardDraw,
    recycleDelay: 2,
  } as GameCardData;
}

function makeEchoBag(id = 'echo-bag-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '回响行囊',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: '即时魔法：弃回至多 2 张手牌，从坟场发现 2 张牌，再从背包抽 2 张牌。',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 专属召唤
// ---------------------------------------------------------------------------

describe('专属召唤 → 回响残页弃回触发 onDiscardDraw', () => {
  it('instant 专属召唤：手牌只剩 回响残页 一张可弃 → 弃回后从背包抽 2 张', () => {
    const cs = makeClassSummonInstant();
    const echoRem = makeEchoRemnant();
    const bp1 = makeFiller('bp1', 'BP1');
    const bp2 = makeFiller('bp2', 'BP2');
    const state = makeState({
      handCards: [cs, echoRem],
      backpackItems: [bp1, bp2] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);

    // 回响残页 已离手 → 走回收袋（永久卡）
    expect(result.state.handCards.find(c => c.id === 'echo-rem-1')).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-1')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'echo-rem-1')).toBeUndefined();
    // onDiscardDraw: 2 触发：bp1 / bp2 都被抽到手
    expect(result.state.handCards.find(c => c.id === 'bp1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp2')).toBeDefined();
  });

  it('permanent 专属召唤（升级版）：回响残页弃回也应触发 onDiscardDraw', () => {
    const cs = makeClassSummonPermanent();
    const echoRem = makeEchoRemnant();
    const bp1 = makeFiller('bp1', 'BP1');
    const bp2 = makeFiller('bp2', 'BP2');
    const state = makeState({
      handCards: [cs, echoRem],
      backpackItems: [bp1, bp2] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);

    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp2')).toBeDefined();
  });

  it('普通（非永久）魔法被 专属召唤 弃回 → 进坟场（不是回收袋）', () => {
    const cs = makeClassSummonInstant();
    const f1 = makeFiller('f1', 'Plain');
    const state = makeState({
      handCards: [cs, f1],
      backpackItems: [] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);
    expect(result.state.discardedCards.find(c => c.id === 'f1')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'f1')).toBeUndefined();
  });

  it('用户报告复现：手牌只有 专属召唤 + 两张 Perm → 两张 Perm 都应进回收袋（不是坟场）', () => {
    const cs = makeClassSummonInstant();
    const perm1 = makeEchoRemnant('echo-rem-A');
    const perm2 = makeEchoRemnant('echo-rem-B');
    const state = makeState({
      handCards: [cs, perm1, perm2],
      backpackItems: [] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);

    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-A')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-B')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'echo-rem-A')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'echo-rem-B')).toBeUndefined();
  });

  it('用户报告复现 (permanent variant)：升级版专属召唤 + 两张 Perm → 两张都进回收袋', () => {
    const cs = makeClassSummonPermanent();
    const perm1 = makeEchoRemnant('echo-rem-A');
    const perm2 = makeEchoRemnant('echo-rem-B');
    const state = makeState({
      handCards: [cs, perm1, perm2],
      backpackItems: [] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);

    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-A')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-B')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'echo-rem-A')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'echo-rem-B')).toBeUndefined();
  });

  it('Perm 类型覆盖：专属召唤 + 一张 perm 装备 + 一张 perm 事件 → 都进回收袋', () => {
    const cs = makeClassSummonInstant();
    const permWeapon: GameCardData = {
      id: 'perm-w',
      type: 'weapon',
      name: 'PermWeapon',
      value: 3,
      image: '',
      attack: 3,
      durability: 2,
      maxDurability: 2,
      permEquipment: true,
    } as GameCardData;
    const permEvent: GameCardData = {
      id: 'perm-evt',
      type: 'event',
      name: 'PermEvent',
      value: 0,
      image: '',
      isPermanentEvent: true,
    } as GameCardData;
    const state = makeState({
      handCards: [cs, permWeapon, permEvent],
      backpackItems: [] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);

    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'perm-w')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'perm-evt')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'perm-w')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'perm-evt')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 祭坛秘术
// ---------------------------------------------------------------------------

describe('祭坛秘术 → 回响残页弃回触发 onDiscardDraw', () => {
  it('auto 路径：手牌只剩 回响残页 一张 → 自动弃回，触发抽牌；永久卡进回收袋', () => {
    const card = makeAltar();
    const echoRem = makeEchoRemnant();
    const bp1 = makeFiller('bp1');
    const bp2 = makeFiller('bp2');
    const state = makeState({
      handCards: [card, echoRem],
      backpackItems: [bp1, bp2] as any,
      classDeck: [{ id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' }] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp2')).toBeDefined();
  });

  it('modal 路径：玩家选择 回响残页 弃回 → 进回收袋 + 抽 2 张', () => {
    const card = makeAltar();
    const echoRem = makeEchoRemnant();
    const f1 = makeFiller('f1');
    const bp1 = makeFiller('bp1');
    const bp2 = makeFiller('bp2');
    const state = makeState({
      handCards: [card, echoRem, f1],
      backpackItems: [bp1, bp2] as any,
      classDeck: [{ id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' }] as any,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingHandDiscardSelection).not.toBeNull();
    result = drain(result.state, [
      { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['echo-rem-1', 'f1'] } as GameAction,
    ]);
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-1')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'f1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp2')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 汰旧迎新（强制回收袋；onDiscardDraw 仍要触发）
// ---------------------------------------------------------------------------

describe('汰旧迎新 → 回响残页弃回触发 onDiscardDraw', () => {
  it('modal 路径：玩家选 回响残页 → 强制回收袋 + 触发 onDiscardDraw（背包再抽 2 张+原本 2 张）', () => {
    const card = makeDiscardDraw();
    const echoRem = makeEchoRemnant();
    const f1 = makeFiller('f1', 'Plain');
    const bp1 = makeFiller('bp1');
    const bp2 = makeFiller('bp2');
    const bp3 = makeFiller('bp3');
    const bp4 = makeFiller('bp4');
    const state = makeState({
      handCards: [card, echoRem, f1],
      backpackItems: [bp1, bp2, bp3, bp4] as any,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingHandDiscardSelection).not.toBeNull();
    result = drain(result.state, [
      { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['echo-rem-1'] } as GameAction,
    ]);

    // 回响残页 → 回收袋（汰旧迎新强制）
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-1')).toBeDefined();
    // 汰旧迎新本身从背包抽 2 张 + 回响残页 onDiscardDraw 再抽 2 张 = 共 4 张
    const drawnFromBackpack = ['bp1', 'bp2', 'bp3', 'bp4'].filter(id =>
      result.state.handCards.find(c => c.id === id),
    );
    expect(drawnFromBackpack.length).toBe(4);
  });

  it('普通卡被 汰旧迎新 弃回 → 仍然进回收袋（不进坟场，保留卡牌设计）', () => {
    const card = makeDiscardDraw();
    const f1 = makeFiller('f1', 'Plain');
    const state = makeState({
      handCards: [card, f1],
      backpackItems: [] as any,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['f1'] } as GameAction,
    ]);
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'f1')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'f1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 回响行囊
// ---------------------------------------------------------------------------

describe('回响行囊 → 回响残页弃回触发 onDiscardDraw', () => {
  it('回响残页被 回响行囊 弃回 → 进回收袋 + 触发 onDiscardDraw 抽牌', () => {
    const card = makeEchoBag();
    const echoRem = makeEchoRemnant();
    const f1 = makeFiller('f1', 'Plain');
    const bp1 = makeFiller('bp1');
    const bp2 = makeFiller('bp2');
    const state = makeState({
      handCards: [card, echoRem, f1],
      backpackItems: [bp1, bp2] as any,
      discardedCards: [] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 回响残页 必然在被随机弃的两张里（因为只有 2 张可弃）→ 进回收袋
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'echo-rem-1')).toBeDefined();
    // 普通卡 f1 → 坟场
    expect(result.state.discardedCards.find(c => c.id === 'f1')).toBeDefined();
    // onDiscardDraw 触发：bp1 / bp2 抽到手
    expect(result.state.handCards.find(c => c.id === 'bp1')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'bp2')).toBeDefined();
  });
});
