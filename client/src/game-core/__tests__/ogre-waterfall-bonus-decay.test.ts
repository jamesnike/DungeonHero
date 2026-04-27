/**
 * Regression: Ogre `bonusDecay` waterfall effect (重设计 2026-04)
 *
 * 旧设计（删除）：bonusDecay 削弱 装备伤害/护甲 + **法术伤害**
 * 新设计：bonusDecay 削弱 装备伤害/护甲 + **超杀吸血** (`permanentSpellLifesteal`)
 *
 * 关键回归点：
 *   1. `equipmentSlotBonuses[slot1/2].damage` -= amount
 *   2. `equipmentSlotBonuses[slot1/2].shield` -= amount
 *   3. `permanentSpellLifesteal` -= amount
 *   4. `permanentSpellDamageBonus` **不变**（旧 bug 是这里被扣 — 现在改成 lifesteal）
 *
 * 普通 Ogre amount=1，精英 Ogre amount=3。
 *
 * Phase 注：`APPLY_WATERFALL_DISCARD_EFFECTS` 在真实游戏里是 GameBoard 的
 * top-level `engine.dispatch`，走 `_processAction` 直接 reduce，绕过 pipeline
 * 的 `isInputContinuation` 闸门。测试里用 `drain([action])` 模拟，必须用默认
 * `phase: 'idle'`（不在 `INPUT_PHASES` 里），否则闸门会把首条 action 卡住。
 * 这跟 `amulet-perm-routing-on-destroy.test.ts` 的写法一致。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { GameAction } from '../actions';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeOgre(amount: number, isElite = false): GameCardData {
  return {
    id: isElite ? 'ogre-elite-1' : 'ogre-1',
    type: 'monster',
    monsterType: 'Ogre',
    name: isElite ? '精英 Ogre' : 'Ogre',
    value: 5,
    image: '',
    attack: 5,
    hp: 5,
    fury: 3,
    waterfallEffect: {
      type: 'bonusDecay' as any,
      amount,
      description: `被挤出时：所有装备栏永久伤害/护甲 -${amount}，超杀吸血 -${amount}`,
    },
    ...(isElite ? { eliteDoubleAttack: true } : {}),
  } as GameCardData;
}

describe('Ogre bonusDecay waterfall effect (装备伤害/护甲 + 超杀吸血)', () => {
  describe('普通 Ogre (amount=1)', () => {
    it('扣减 装备栏永久伤害/护甲 -1，超杀吸血 -1', () => {
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 5, shield: 4 },
          equipmentSlot2: { damage: 3, shield: 2 },
        },
        permanentSpellLifesteal: 6,
        permanentSpellDamageBonus: 7,
      });

      const result = drain(state, [
        { type: 'APPLY_WATERFALL_DISCARD_EFFECTS', discardCard: makeOgre(1), nextRemainingDeck: [] } as GameAction,
      ]);

      expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(4);
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(3);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(2);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(1);
      expect(result.state.permanentSpellLifesteal).toBe(5);
    });

    it('不再扣减 permanentSpellDamageBonus（旧设计已删除）', () => {
      const state = makeState({
        permanentSpellLifesteal: 4,
        permanentSpellDamageBonus: 7,
      });

      const result = drain(state, [
        { type: 'APPLY_WATERFALL_DISCARD_EFFECTS', discardCard: makeOgre(1), nextRemainingDeck: [] } as GameAction,
      ]);

      expect(result.state.permanentSpellDamageBonus).toBe(7);
      expect(result.state.permanentSpellLifesteal).toBe(3);
    });
  });

  describe('精英 Ogre (amount=3)', () => {
    it('扣减 装备栏永久伤害/护甲 -3，超杀吸血 -3', () => {
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 5, shield: 4 },
          equipmentSlot2: { damage: 6, shield: 5 },
        },
        permanentSpellLifesteal: 8,
        permanentSpellDamageBonus: 7,
      });

      const result = drain(state, [
        { type: 'APPLY_WATERFALL_DISCARD_EFFECTS', discardCard: makeOgre(3, true), nextRemainingDeck: [] } as GameAction,
      ]);

      expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(2);
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(1);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(3);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(2);
      expect(result.state.permanentSpellLifesteal).toBe(5);
      expect(result.state.permanentSpellDamageBonus).toBe(7);
    });
  });

  describe('边界：负值不被 floor', () => {
    it('超杀吸血 0 - 1 = -1（不 clamp）', () => {
      const state = makeState({ permanentSpellLifesteal: 0 });

      const result = drain(state, [
        { type: 'APPLY_WATERFALL_DISCARD_EFFECTS', discardCard: makeOgre(1), nextRemainingDeck: [] } as GameAction,
      ]);

      expect(result.state.permanentSpellLifesteal).toBe(-1);
    });

    it('装备栏伤害/护甲 1 - 3 = -2（精英 Ogre 打负值）', () => {
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 1, shield: 1 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
      });

      const result = drain(state, [
        { type: 'APPLY_WATERFALL_DISCARD_EFFECTS', discardCard: makeOgre(3, true), nextRemainingDeck: [] } as GameAction,
      ]);

      expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(-2);
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(-2);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(-3);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(-3);
    });
  });
});
