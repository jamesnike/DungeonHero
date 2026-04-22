/**
 * 地震泉涌 (knight:quake-stun-draw) — Perm 1 magic.
 *
 * 卡面：永久（Perm 1）。失去 1 HP（自伤），从背包抽 floor(stunCap / 10) 张牌。
 *
 * 公式：
 *   hpCost    = 1 * echoMultiplier
 *   drawCount = floor(stunCap / 10) * echoMultiplier
 *
 * - HP 自伤走 APPLY_DAMAGE selfInflicted（与 blood-draw 同管线，触发 血怒/复生赐福/
 *   self-damage-draw / totalDamageTaken / 护甲吸血 等所有自伤联动）
 * - Echo (A 类，与 血契抽引 一致)：HP 损失与抽牌都 ×echoMultiplier
 * - stunCap < 10（公式 = 0）：仍消耗 magic、仍掉 HP、0 抽
 * - 抽牌受手牌上限约束（drawMultipleFromBackpack）
 * - 不设升级
 *
 * 覆盖：
 *   1. stunCap=10：失 1 HP，抽 1 张
 *   2. stunCap=50：失 1 HP，抽 5 张
 *   3. stunCap=100（最大）：失 1 HP，抽 10 张（受手牌上限约束）
 *   4. stunCap=8（< 10）：失 1 HP，0 抽，magic 仍消耗
 *   5. stunCap=15（不能整除）：floor(15/10)=1 张
 *   6. Echo ×2：HP 损失 2、抽牌 ×2
 *   7. Echo ×2 + stunCap < 10：HP 损失 2、0 抽
 *   8. 背包不够：抽到耗尽
 *   9. 自伤走 totalDamageTaken
 *   10. magic 进回收袋（Perm 1）
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

function makeCard(idSuffix = 'qsd'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '地震泉涌',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '失去 1 HP，从背包抽 floor(击晕上限/10) 张牌。',
    knightEffect: 'quake-stun-draw',
    description: 'test',
    recycleDelay: 1,
  } as any;
}

function makeFiller(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `BP-${id}`,
    value: 0,
    image: '',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 主公式
// ---------------------------------------------------------------------------

describe('地震泉涌 — 主公式', () => {
  it('stunCap=10 → 抽 1 张，HP -1', () => {
    const card = makeCard('s10');
    const bps = Array.from({ length: 4 }, (_, i) => makeFiller(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      hp: 30,
      stunCap: 10,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(29);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(1);
  });

  it('stunCap=50 → 抽 5 张，HP -1', () => {
    const card = makeCard('s50');
    const bps = Array.from({ length: 8 }, (_, i) => makeFiller(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      hp: 30,
      stunCap: 50,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(29);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(5);
  });

  it('stunCap=100 → 想抽 10 张，受手牌上限约束', () => {
    const card = makeCard('s100');
    const bps = Array.from({ length: 12 }, (_, i) => makeFiller(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      hp: 30,
      stunCap: 100,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(29);
    // PLAY_CARD 路径：magic 抽牌前已离手 → 抽满到 HAND_LIMIT
    expect(result.state.handCards.length).toBeLessThanOrEqual(HAND_LIMIT);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(HAND_LIMIT);
  });

  it('stunCap=15（不能整除 10）→ floor(15/10)=1 张', () => {
    const card = makeCard('s15');
    const bps = Array.from({ length: 4 }, (_, i) => makeFiller(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      hp: 30,
      stunCap: 15,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(29);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 边界：stunCap < 10
// ---------------------------------------------------------------------------

describe('地震泉涌 — 击晕上限不足 10', () => {
  it('stunCap=8 → 0 抽，但仍掉 1 HP、magic 仍消耗', () => {
    const card = makeCard('low');
    const bps = [makeFiller('bp-keep')];
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      hp: 30,
      stunCap: 8,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(29);
    expect(result.state.backpackItems.length).toBe(1);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(0);
    // magic 进回收袋
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
  });

  it('stunCap=0 → 0 抽，但仍掉 1 HP', () => {
    const card = makeCard('zero');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('bp-1')] as any,
      hp: 30,
      stunCap: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(29);
    expect(result.state.backpackItems.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 法术回响（A 类，跟 blood-draw 一致：HP 与抽牌都 ×echo）
// ---------------------------------------------------------------------------

describe('地震泉涌 — 法术回响', () => {
  it('Echo ×2 + stunCap=20：HP -2、抽 4 张（base 2 × echo 2）', () => {
    const card = makeCard('echo');
    const bps = Array.from({ length: 8 }, (_, i) => makeFiller(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      hp: 30,
      stunCap: 20,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(28);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(4);
    expect(result.state.doubleNextMagic).toBe(false);
  });

  it('Echo ×2 + stunCap=8：HP -2、0 抽（base 0 × echo 2 = 0）', () => {
    const card = makeCard('echo-zero');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('bp-keep')] as any,
      hp: 30,
      stunCap: 8,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(28);
    expect(result.state.backpackItems.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 背包不够 / 自伤联动 / 卡处置
// ---------------------------------------------------------------------------

describe('地震泉涌 — 背包不够', () => {
  it('stunCap=50（想抽 5 张）但背包只有 2 张 → 抽 2 张然后停止，HP 仍 -1', () => {
    const card = makeCard('dry');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('bp-x'), makeFiller('bp-y')] as any,
      hp: 30,
      stunCap: 50,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(29);
    expect(result.state.backpackItems.length).toBe(0);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(2);
  });
});

describe('地震泉涌 — 自伤联动', () => {
  it('HP 损失计入 totalDamageTaken（自伤走 selfInflicted）', () => {
    const card = makeCard('self-track');
    const state = makeState({
      handCards: [card],
      backpackItems: [] as any,
      hp: 30,
      stunCap: 30,
      totalDamageTaken: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(29);
    expect(result.state.totalDamageTaken).toBe(1);
  });
});

describe('地震泉涌 — 处置', () => {
  it('Perm 1 magic：play 后入回收袋（recycleDelay=1）', () => {
    const card = makeCard('perm');
    const state = makeState({
      handCards: [card],
      backpackItems: [] as any,
      hp: 30,
      stunCap: 10,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(false);
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
  });
});
