/**
 * 赎血召牌符 (self-damage-draw) — e2e tests.
 *
 * Trigger contract:
 *   - 当 APPLY_DAMAGE { selfInflicted: true } 实际造成 ≥1 点 HP 损失时，
 *     按装备数量 N 从背包随机抽 N 张牌（独立 ×N 叠加），受手牌上限约束。
 *   - 与「血怒战符」共用 `selfInflicted` 路径；非自伤（怪物攻击）不触发。
 *   - 护盾完全抵消时不触发（appliedDamage = 0）。
 *
 * 这些 case 覆盖：基本触发、N=2 的叠加、护盾抵消、非自伤、空背包、手牌上限约束。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';
import { initialCombatState } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

const SDD_AMULET = (id: string): GameCardData => ({
  id,
  type: 'amulet',
  name: '赎血召牌符',
  value: 0,
  image: '',
  amuletEffect: 'self-damage-draw',
} as any);

const FILLER = (id: string): GameCardData => ({
  id,
  type: 'magic',
  name: 'Filler',
  value: 0,
  image: '',
} as any);

describe('赎血召牌符 (self-damage-draw)', () => {
  it('selfInflicted 伤害实际生效 → 抽 1 张牌（单件）', () => {
    const backpack = [FILLER('bp1'), FILLER('bp2'), FILLER('bp3')];
    const state = makeState({
      hp: 20,
      amuletSlots: [SDD_AMULET('a1')] as any,
      backpackItems: backpack as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
    ]);

    expect(result.state.hp).toBe(17);
    expect(result.state.handCards.length).toBe(1);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('叠加 ×2 → 一次自伤抽 2 张牌', () => {
    const backpack = [FILLER('bp1'), FILLER('bp2'), FILLER('bp3'), FILLER('bp4')];
    const state = makeState({
      hp: 20,
      amuletSlots: [SDD_AMULET('a1'), SDD_AMULET('a2')] as any,
      backpackItems: backpack as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 2, source: 'test', selfInflicted: true } as any,
    ]);

    expect(result.state.hp).toBe(18);
    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('非 selfInflicted（怪物攻击）不触发', () => {
    const backpack = [FILLER('bp1'), FILLER('bp2')];
    const state = makeState({
      hp: 20,
      amuletSlots: [SDD_AMULET('a1')] as any,
      backpackItems: backpack as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'monster', selfInflicted: false } as any,
    ]);

    expect(result.state.hp).toBe(17);
    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('护盾完全抵消时不触发（appliedDamage = 0）', () => {
    const backpack = [FILLER('bp1'), FILLER('bp2')];
    const state = makeState({
      hp: 20,
      tempShield: 5,
      amuletSlots: [SDD_AMULET('a1')] as any,
      backpackItems: backpack as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
    ]);

    expect(result.state.hp).toBe(20);
    expect(result.state.tempShield).toBe(2);
    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('未装备护符 → 即使自伤也不抽牌', () => {
    const backpack = [FILLER('bp1'), FILLER('bp2')];
    const state = makeState({
      hp: 20,
      amuletSlots: [],
      backpackItems: backpack as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
    ]);

    expect(result.state.hp).toBe(17);
    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('背包为空 → 抽不到牌但效果不报错', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [SDD_AMULET('a1')] as any,
      backpackItems: [],
      handCards: [],
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
    ]);

    expect(result.state.hp).toBe(17);
    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(0);
  });

  it('受手牌上限约束（HAND_LIMIT 默认 6）— 已满则抽不出来', () => {
    const backpack = [FILLER('bp1'), FILLER('bp2')];
    // 手牌已 6 张顶到上限
    const fullHand = [
      FILLER('h1'), FILLER('h2'), FILLER('h3'),
      FILLER('h4'), FILLER('h5'), FILLER('h6'),
    ];
    const state = makeState({
      hp: 20,
      amuletSlots: [SDD_AMULET('a1'), SDD_AMULET('a2')] as any,
      backpackItems: backpack as any,
      handCards: fullHand as any,
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
    ]);

    expect(result.state.hp).toBe(17);
    expect(result.state.handCards.length).toBe(6);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('amount = 0 时不触发', () => {
    const backpack = [FILLER('bp1')];
    const state = makeState({
      hp: 20,
      amuletSlots: [SDD_AMULET('a1')] as any,
      backpackItems: backpack as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 0, source: 'test', selfInflicted: true } as any,
    ]);

    expect(result.state.hp).toBe(20);
    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(1);
  });
});
