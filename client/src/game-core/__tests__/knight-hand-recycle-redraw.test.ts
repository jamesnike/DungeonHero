/**
 * 洗册待回 (knight:hand-recycle-redraw) tests — Perm 1 magic.
 *
 * 卡面：将所有可回收手牌（curse 与源卡排除，共 X 张）洗入回收袋，
 *       然后从背包抽 X+N 张牌（N = [1, 2][upgradeLevel]）。
 *
 * 与「清囊重启」(hand-purge-redraw) 关键区别：
 *   - 清囊重启 走 DISCARD_OWNED_CARD：非 Perm 进坟场、Perm 进回收袋，触发
 *     catapult / discard-zap / onDiscardDraw 等弃置联动。
 *   - 洗册待回 走 ADD_TO_RECYCLE_BAG：**全部**手牌强制进回收袋（让它们以后
 *     通过 waterfall 回到背包），**不**触发上述弃置联动（"洗"不是"弃"）。
 *
 * 法术回响（C 类雪球）：
 *   iter 1: 移走 X1 → 抽 X1+N → 手牌现 X1+N
 *   iter 2: 移走 X1+N → 抽 (X1+N)+N → 手牌现 X1+2N
 *
 * 覆盖：
 *   1. PLAY_CARD → 完整链：所有手牌进回收袋 + 抽 X+1
 *   2. Lv0 / Lv1：N = 1 / 2
 *   3. 手牌为空：X=0，仍抽 N 张
 *   4. 诅咒留手：不进回收袋、不计入 X
 *   5. 抽牌受手牌上限约束
 *   6. 不触发 onDiscardDraw（"洗"非"弃"）
 *   7. 法术回响 C 类：迭代两次
 *   8. 卡自身进回收袋（recycleDelay: 1）
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
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeHandRecycleRedraw(idSuffix = 'hrr', upgradeLevel = 0): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '洗册待回',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '永久魔法：手牌洗入回收袋（共 X 张），从背包抽 X+N 张。',
    knightEffect: 'hand-recycle-redraw',
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
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay: 2,
  } as GameCardData;
}

function makeCurseCard(id: string): GameCardData {
  return {
    id,
    type: 'curse',
    name: `Curse-${id}`,
    value: 0,
    image: '',
    curseEffect: 'blood-curse',
  } as unknown as GameCardData;
}

function makeEchoRemnant(id = 'echo-rem'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '回响残页',
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay: 2,
    onDiscardDraw: 2,
  } as unknown as GameCardData;
}

describe('洗册待回 (knight:hand-recycle-redraw)', () => {
  it('Lv0: PLAY_CARD → 移 X 张到回收袋，从背包抽 X+1 张', () => {
    const card = makeHandRecycleRedraw('basic', 0);
    const inHand = [
      makeFiller('h1'),
      makeFiller('h2'),
      makeFiller('h3'),
    ];
    const inBackpack = [
      makeFiller('b1'),
      makeFiller('b2'),
      makeFiller('b3'),
      makeFiller('b4'),
      makeFiller('b5'),
    ];
    const state = makeState({
      handCards: [card, ...inHand],
      backpackItems: inBackpack,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // X = 3 → 抽 4 张。手牌净变化：移走 3 张 + 抽 4 张 + 移走源卡 = 净 +1 张。
    expect(result.state.handCards.length).toBe(4);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h1')).toBe(true);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h2')).toBe(true);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h3')).toBe(true);
    // backpack 抽 4 张后：5 - 4 = 1 张。
    expect(result.state.backpackItems.length).toBe(1);
    // 源卡走回收袋（recycleDelay: 1）
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
  });

  it('Lv1: 抽 X+2 张', () => {
    const card = makeHandRecycleRedraw('lv1', 1);
    const inHand = [makeFiller('h1'), makeFiller('h2')];
    const inBackpack = [
      makeFiller('b1'),
      makeFiller('b2'),
      makeFiller('b3'),
      makeFiller('b4'),
    ];
    const state = makeState({
      handCards: [card, ...inHand],
      backpackItems: inBackpack,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // X = 2 → 抽 X+2 = 4 张。手牌：原 2 张移走 + 4 张新抽 = 4 张。
    expect(result.state.handCards.length).toBe(4);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h1')).toBe(true);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h2')).toBe(true);
    expect(result.state.backpackItems.length).toBe(0);
  });

  it('手牌为空（仅源卡）：X=0，仍抽 N=1 张', () => {
    const card = makeHandRecycleRedraw('empty', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('b1'), makeFiller('b2')],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // X = 0 → 抽 1 张。
    expect(result.state.handCards.length).toBe(1);
    expect(result.state.backpackItems.length).toBe(1);
    // 没有"手牌"被移到回收袋（仅源卡自己进回收袋）
    expect(result.state.permanentMagicRecycleBag.length).toBe(1);
    expect(result.state.permanentMagicRecycleBag[0].id).toBe(card.id);
  });

  it('诅咒留手：不进回收袋、不计入 X', () => {
    const card = makeHandRecycleRedraw('curse', 0);
    const curse = makeCurseCard('curse1');
    const inHand = [makeFiller('h1'), makeFiller('h2'), curse];
    const inBackpack = [
      makeFiller('b1'),
      makeFiller('b2'),
      makeFiller('b3'),
      makeFiller('b4'),
    ];
    const state = makeState({
      handCards: [card, ...inHand],
      backpackItems: inBackpack,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // X = 2（h1, h2，不算 curse）→ 抽 X+1 = 3 张。手牌：curse 留手 + 3 张新抽 = 4 张。
    expect(result.state.handCards.length).toBe(4);
    expect(result.state.handCards.some(c => c.id === 'curse1')).toBe(true);
    // 诅咒不进回收袋
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'curse1')).toBe(false);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h1')).toBe(true);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h2')).toBe(true);
  });

  it('Perm 与非 Perm 手牌都进回收袋（不分流到坟场）', () => {
    const card = makeHandRecycleRedraw('mix', 0);
    const nonPerm = makeFiller('np1', 'NonPerm');
    const perm = makePermFiller('p1', 'PermCard');
    const state = makeState({
      handCards: [card, nonPerm, perm],
      backpackItems: [makeFiller('b1'), makeFiller('b2'), makeFiller('b3')],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 非 Perm 也进回收袋（不去坟场）—— 这是和 hand-purge-redraw 关键区别
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'np1')).toBe(true);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'p1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'np1')).toBe(false);
    expect(result.state.discardedCards.some(c => c.id === 'p1')).toBe(false);
  });

  it('抽牌受手牌上限约束（HAND_LIMIT）', () => {
    const card = makeHandRecycleRedraw('limit', 1); // Lv1: N=2
    // 手牌满到上限附近：源卡 + (HAND_LIMIT-1) 张（移走后空 = HAND_LIMIT 抽到 HAND_LIMIT-1+N 张? 看上限）
    const fillers = Array.from({ length: HAND_LIMIT - 1 }, (_, i) => makeFiller(`h${i}`));
    const card2 = card;
    const lotsOfBackpack = Array.from({ length: 30 }, (_, i) => makeFiller(`b${i}`));
    const state = makeState({
      handCards: [card2, ...fillers],
      backpackItems: lotsOfBackpack,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card2.id } as GameAction]);

    // 手牌不应超过 HAND_LIMIT
    expect(result.state.handCards.length).toBeLessThanOrEqual(HAND_LIMIT);
  });

  it('不触发 onDiscardDraw（"洗"不是"弃"）', () => {
    const card = makeHandRecycleRedraw('echo-rem', 0);
    const echoRemnant = makeEchoRemnant('er1');
    const lotsOfBackpack = Array.from({ length: 10 }, (_, i) => makeFiller(`b${i}`));
    const state = makeState({
      handCards: [card, echoRemnant],
      backpackItems: lotsOfBackpack,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 回响残页进回收袋，但不触发 onDiscardDraw 的额外抽牌
    // X = 1 (echoRemnant) → 抽 X+1 = 2 张。手牌净 = 2 张（不是 4 张如果 onDiscardDraw 触发了）
    expect(result.state.handCards.length).toBe(2);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'er1')).toBe(true);
  });

  it('卡自身进回收袋（recycleDelay: 1），不进坟场', () => {
    const card = makeHandRecycleRedraw('self', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('b1')],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(false);
  });

  it('法术回响 C 类雪球：iter1 移 X1，抽 X1+N → iter2 移 X1+N，抽 X1+2N', () => {
    // X1 = 2, N = 1 (Lv0)
    // iter 1: 移走 2 张, 抽 3 张 → 手牌 = 3
    // iter 2: 移走 3 张, 抽 4 张 → 手牌 = 4
    // 总共移走 5 张，抽 7 张
    const card = makeHandRecycleRedraw('echo', 0);
    const inHand = [makeFiller('h1'), makeFiller('h2')];
    // 背包够多防 limit / 空袋
    const inBackpack = Array.from({ length: 10 }, (_, i) => makeFiller(`b${i}`));
    const state = makeState({
      handCards: [card, ...inHand],
      backpackItems: inBackpack,
      doubleNextMagic: true, // 触发 echo
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 总进回收袋的"手牌" = h1 + h2 + iter1 抽的 3 张 = 5 张
    // 加上源卡自身 = 6 张
    expect(result.state.permanentMagicRecycleBag.length).toBe(6);
    // 最终手牌 = iter2 抽的 4 张
    expect(result.state.handCards.length).toBe(4);
    // 背包消耗 = 3 (iter1) + 4 (iter2) = 7 张 → 10 - 7 = 3 张
    expect(result.state.backpackItems.length).toBe(3);
    // doubleNextMagic 被消费
    expect(result.state.doubleNextMagic).toBeFalsy();
  });

  it('echo + 手牌空（仅源卡）：iter1 移 0 抽 N → iter2 移 N 抽 2N', () => {
    // N = 1, echo=2:
    // iter 1: 移 0, 抽 1 → 手牌 = 1
    // iter 2: 移 1, 抽 2 → 手牌 = 2
    const card = makeHandRecycleRedraw('echo-empty', 0);
    const inBackpack = Array.from({ length: 5 }, (_, i) => makeFiller(`b${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: inBackpack,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.handCards.length).toBe(2);
    // 进回收袋：iter2 移走的 1 张（iter1 抽到的）+ 源卡 = 2 张
    expect(result.state.permanentMagicRecycleBag.length).toBe(2);
  });

  it('echo + 背包空：iter1 抽不到，iter2 也抽不到', () => {
    const card = makeHandRecycleRedraw('echo-no-bp', 0);
    const inHand = [makeFiller('h1'), makeFiller('h2')];
    const state = makeState({
      handCards: [card, ...inHand],
      backpackItems: [], // 空背包
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // iter1: 移 2 抽 0 → 手 0
    // iter2: 移 0 抽 0 → 手 0
    expect(result.state.handCards.length).toBe(0);
    // h1 h2 + 源卡 = 3 张进回收袋
    expect(result.state.permanentMagicRecycleBag.length).toBe(3);
  });
});
