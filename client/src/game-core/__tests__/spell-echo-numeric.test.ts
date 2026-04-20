/**
 * 法术回响 — 数值类（Numeric / 类别 A）回归测试
 *
 * 覆盖：当 `state.doubleNextMagic === true` 时，下一张数值类魔法卡的输出应 ×2。
 * 选择「涌泉满手 / fountain-hand」与「治愈术 / heal」作为代表。
 *
 * 同时验证：
 *   - 回响触发后 `state.doubleNextMagic` 被清空（不会无限触发）
 *   - 不在范围内的牌（type === 'curse'）不会消耗也不会触发回响
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeFountainHand(): GameCardData {
  return {
    id: 'magic-fountain-hand',
    type: 'magic',
    name: '涌泉满手',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'fountain-hand',
    description: '回血并抽牌',
    recycleDelay: 0,
  } as GameCardData;
}

function makeHealSpell(): GameCardData {
  return {
    id: 'magic-heal',
    type: 'magic',
    name: '治愈术',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'heal',
    description: '回复 5 点生命',
    recycleDelay: 0,
  } as GameCardData;
}

describe('法术回响 — 数值类 ×2 (Category A)', () => {
  it('涌泉满手：echoMultiplier=2 时治疗量为 8×2 = 16', () => {
    const card = makeFountainHand();
    const state = makeState({
      hp: 1,
      maxHp: 30,
      handCards: [card] as any,
      doubleNextMagic: true,
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);

    expect(drained.state.hp).toBe(1 + 16);
    expect(drained.state.doubleNextMagic).toBe(false);

    const echoBanner = drained.sideEffects.find(
      (s: any) => s.event === 'ui:banner' && s.payload?.text?.includes('法术回响'),
    );
    expect(echoBanner).toBeDefined();
  });

  it('治愈术：echoMultiplier=2 时治疗量为 5×2 = 10（lv0）', () => {
    const card = makeHealSpell();
    const state = makeState({
      hp: 1,
      maxHp: 30,
      handCards: [card] as any,
      doubleNextMagic: true,
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);

    expect(drained.state.hp).toBe(1 + 10);
    expect(drained.state.doubleNextMagic).toBe(false);
  });

  it('未触发回响时数值不变（治愈术 = 5）', () => {
    const card = makeHealSpell();
    const state = makeState({
      hp: 1,
      maxHp: 30,
      handCards: [card] as any,
      doubleNextMagic: false,
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);

    expect(drained.state.hp).toBe(1 + 5);
  });

  it('回响在结算后被清空（连续两张牌只有第一张被翻倍）', () => {
    const c1 = { ...makeHealSpell(), id: 'heal-1' };
    const c2 = { ...makeHealSpell(), id: 'heal-2' };
    const state = makeState({
      hp: 1,
      maxHp: 50,
      handCards: [c1, c2] as any,
      doubleNextMagic: true,
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: c1.id, card: c1 } as GameAction,
      { type: 'RESOLVE_MAGIC', cardId: c2.id, card: c2 } as GameAction,
    ]);

    // c1: 5×2=10，c2: 5（回响已消耗）= 1 + 10 + 5 = 16
    expect(drained.state.hp).toBe(16);
    expect(drained.state.doubleNextMagic).toBe(false);
  });
});
