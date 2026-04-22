/**
 * 清囊重启 (knight:hand-purge-redraw) tests
 *
 * 卡面：永久（Perm 1）。弃回所有手牌（curse 留手），从背包抽 N 张牌
 * （N = 3 / 4 / 5，对应升级 0 / 1 / 2）。
 *
 * 弃回走标准 DISCARD_OWNED_CARD（perm-aware 路由）：
 *   - 非 Perm 牌进坟场，Perm 牌（含被永恒铭刻过的）进回收袋；
 *   - 触发 catapult / discard-zap / onDiscardDraw / 雷霆符印 等弃置联动。
 *
 * 法术回响：弃回是结构操作（C 类，二次时手牌已空，自动 no-op）；
 * 抽牌是数值操作（A 类，count × echoMultiplier）。
 *
 * 覆盖：
 *   1. 基础：弃回所有手牌，抽 3 张
 *   2. Perm 卡走回收袋、非 Perm 卡走坟场（perm-aware 分流）
 *   3. curse 留手不被弃回
 *   4. 升级 1/2：抽 4 / 5 张
 *   5. 手牌为空：仍抽 N 张
 *   6. 抽牌受手牌上限约束
 *   7. 触发 onDiscardDraw（回响残页 弃回时再抽 2 张）
 *   8. 法术回响：抽牌数 × 2
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { HAND_LIMIT } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeHandPurgeRedraw(idSuffix = 'hpr', upgradeLevel = 0): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '清囊重启',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '弃回全部手牌，从背包抽 N 张。',
    knightEffect: 'hand-purge-redraw',
    description: 'test',
    recycleDelay: 1,
    upgradeLevel,
  } as any;
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

function makePermFiller(id: string, name = `Perm-${id}`): GameCardData {
  // permanent magic with recycleDelay -> goes to recycle bag on discard
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay: 1,
  } as GameCardData;
}

function makeEchoRemnant(id = 'echo-rem'): GameCardData {
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

function makeCurse(id = 'curse-1'): GameCardData {
  return {
    id,
    type: 'curse' as any,
    name: '贪婪诅咒',
    value: 0,
    image: '',
    isCurse: true,
  } as any;
}

// ---------------------------------------------------------------------------
// 基础效果
// ---------------------------------------------------------------------------

describe('清囊重启 — 基础效果', () => {
  it('弃回所有手牌（非 Perm 进坟场），从背包抽 3 张', () => {
    const card = makeHandPurgeRedraw('basic');
    const h1 = makeFiller('h1', 'H1');
    const h2 = makeFiller('h2', 'H2');
    const h3 = makeFiller('h3', 'H3');
    const bp1 = makeFiller('bp1', 'BP1');
    const bp2 = makeFiller('bp2', 'BP2');
    const bp3 = makeFiller('bp3', 'BP3');
    const state = makeState({
      handCards: [card, h1, h2, h3],
      backpackItems: [bp1, bp2, bp3] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 卡自身已离手（Perm 1 → 回收袋）
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeDefined();

    // 三张普通手牌 → 坟场
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === 'h2')).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === 'h3')).toBeUndefined();
    expect(result.state.discardedCards.some(c => c.id === 'h1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'h2')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'h3')).toBe(true);

    // 三张背包牌 → 手牌
    expect(result.state.handCards.some(c => c.id === 'bp1')).toBe(true);
    expect(result.state.handCards.some(c => c.id === 'bp2')).toBe(true);
    expect(result.state.handCards.some(c => c.id === 'bp3')).toBe(true);
    // 背包被清空
    expect(result.state.backpackItems.length).toBe(0);
  });

  it('Perm 卡 perm-aware 分流：Perm 进回收袋，非 Perm 进坟场', () => {
    const card = makeHandPurgeRedraw('perm-route');
    const plain = makeFiller('plain-1', 'Plain');
    const perm = makePermFiller('perm-1', 'PermCard');
    const state = makeState({
      handCards: [card, plain, perm],
      backpackItems: [] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 普通卡 → 坟场
    expect(result.state.discardedCards.some(c => c.id === 'plain-1')).toBe(true);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'plain-1')).toBe(false);

    // Perm 卡 → 回收袋
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'perm-1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'perm-1')).toBe(false);
  });

  it('curse 卡留手不被弃回', () => {
    const card = makeHandPurgeRedraw('curse-keep');
    const plain = makeFiller('h1');
    const curse = makeCurse('curse-1');
    const state = makeState({
      handCards: [card, plain, curse],
      backpackItems: [] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 普通卡被弃
    expect(result.state.handCards.some(c => c.id === 'h1')).toBe(false);
    // 诅咒留手
    expect(result.state.handCards.some(c => c.id === 'curse-1')).toBe(true);
  });

  it('手牌为空（除自身外）：跳过弃回，仍正常抽 3 张', () => {
    const card = makeHandPurgeRedraw('empty-hand');
    const bp1 = makeFiller('bp1');
    const bp2 = makeFiller('bp2');
    const bp3 = makeFiller('bp3');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1, bp2, bp3] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.handCards.length).toBe(3);
    expect(result.state.handCards.some(c => c.id === 'bp1')).toBe(true);
    expect(result.state.handCards.some(c => c.id === 'bp2')).toBe(true);
    expect(result.state.handCards.some(c => c.id === 'bp3')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 升级
// ---------------------------------------------------------------------------

describe('清囊重启 — 升级', () => {
  it('升级 1：抽 4 张', () => {
    const card = makeHandPurgeRedraw('up1', 1);
    const bps = Array.from({ length: 6 }, (_, i) => makeFiller(`bp${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.handCards.length).toBe(4);
  });

  it('升级 2：抽 5 张', () => {
    const card = makeHandPurgeRedraw('up2', 2);
    const bps = Array.from({ length: 6 }, (_, i) => makeFiller(`bp${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.handCards.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 手牌上限
// ---------------------------------------------------------------------------

describe('清囊重启 — 手牌上限', () => {
  it('抽牌受手牌上限约束（默认 HAND_LIMIT = 8）', () => {
    // 留 5 张未弃回的诅咒，再加这张卡 = 6；卡用掉后剩 5 张诅咒在手；
    // 抽 5 张会让手牌到 10，但上限 8，因此最多再补 3 张。
    const card = makeHandPurgeRedraw('limit', 2);
    const curses = Array.from({ length: 5 }, (_, i) => makeCurse(`curse-${i}`));
    const bps = Array.from({ length: 10 }, (_, i) => makeFiller(`bp${i}`));
    const state = makeState({
      handCards: [card, ...curses],
      backpackItems: bps as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 5 个 curse + 至多到 HAND_LIMIT 张
    expect(result.state.handCards.length).toBeLessThanOrEqual(HAND_LIMIT);
    // 5 张 curse 仍在
    expect(result.state.handCards.filter(c => (c as any).isCurse).length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// onDiscardDraw 联动
// ---------------------------------------------------------------------------

describe('清囊重启 — 触发 onDiscardDraw（回响残页）', () => {
  it('回响残页 被弃回 → 进回收袋 + 额外从背包抽 2 张', () => {
    const card = makeHandPurgeRedraw('with-echo');
    const echoRem = makeEchoRemnant();
    const bp1 = makeFiller('bp1', 'BP1');
    const bp2 = makeFiller('bp2', 'BP2');
    const bp3 = makeFiller('bp3', 'BP3');
    const bp4 = makeFiller('bp4', 'BP4');
    const bp5 = makeFiller('bp5', 'BP5');
    const state = makeState({
      handCards: [card, echoRem],
      backpackItems: [bp1, bp2, bp3, bp4, bp5] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 回响残页 → 回收袋（不是坟场）
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'echo-rem')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'echo-rem')).toBe(false);

    // 抽到的总张数 = 卡自身 3 张 + onDiscardDraw 2 张 = 5 张
    // （只要不超手牌上限）
    const drawn = result.state.handCards.filter(c => c.id.startsWith('bp'));
    expect(drawn.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 法术回响
// ---------------------------------------------------------------------------

describe('清囊重启 — 法术回响', () => {
  it('回响触发：抽牌数 × 2（基础 3 → 6 张）', () => {
    const card = makeHandPurgeRedraw('echo');
    const bps = Array.from({ length: 8 }, (_, i) => makeFiller(`bp${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      doubleNextMagic: true,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // doubleNextMagic 被消耗
    expect(result.state.doubleNextMagic).toBe(false);
    // 手牌：3 × 2 = 6 张（无诅咒占位、未触发 onDiscardDraw、空手起步）
    expect(result.state.handCards.length).toBe(6);
  });
});
