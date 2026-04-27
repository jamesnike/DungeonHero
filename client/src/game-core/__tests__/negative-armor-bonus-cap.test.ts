/**
 * 负值的永久护甲 / 临时护甲 必须算进 armor cap
 *
 * 单计数器护甲模型 (`shield-armor-vs-durability.mdc`) 下，cap = max(0, base + perm + temp)。
 * 负值的 perm 或 temp（来源：bonusDecay 瀑流诅咒、amuletCapacity-1 事件等）
 * 必须**减少** cap，而不是被 `Math.max(0, perm)` 这种"个体 floor"丢掉。
 *
 * 历史上有 7 处独立计算 cap 的代码用 `permanentBonus = Math.max(0, slotShieldBonus)`
 * 模式，把 perm 单独 floor 在 0：
 *   - combat.ts × 3 (routeReflectDamageToHero / reduceShieldBash / reduceResolveBlock)
 *   - shield-self-damage.ts
 *   - useCardOperations.ts × 3 (getSlotCurrentArmor / getEquipmentSlotStatModifier shield/monster)
 *   - helpers.ts (computeSlotCurrentArmor)
 *   - waterfall.ts (temp 过期后的 cap 计算)
 *
 * 用户场景：base=1, temp=3, perm=-1 → cap 应该是 max(0, 1+3-1) = 3，而不是
 * `1 + max(0,-1) + 3 = 4`。修复后所有 cap-calc 路径用 sum-then-floor。
 */

import { describe, expect, it } from 'vitest';
import { computeSlotArmorValuePure } from '../helpers';
import { computeShieldBlockValue } from '../combat';
import { getSlotArmorCap, getSlotCurrentArmor } from '../equipment';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { EquipmentItem } from '@/components/game-board/types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

describe('Negative perm / temp armor counted in cap (single-counter model)', () => {
  describe('getSlotArmorCap (canonical helper in equipment.ts)', () => {
    it('counts negative perm: base 1 + temp 3 + perm -1 = 3', () => {
      const shield: EquipmentItem = {
        id: 'sh-1',
        type: 'shield',
        name: '盾',
        value: 1,
        armorMax: 1,
        durability: 1,
        maxDurability: 1,
      } as EquipmentItem;
      const state = makeState({
        equipmentSlot1: shield,
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: -1 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
        slotTempArmor: { equipmentSlot1: 3, equipmentSlot2: 0 },
      });

      expect(getSlotArmorCap(state, 'equipmentSlot1')).toBe(3);
    });

    it('counts negative temp: base 5 + perm 0 + temp -2 = 3', () => {
      const shield: EquipmentItem = {
        id: 'sh-1',
        type: 'shield',
        name: '盾',
        value: 5,
        armorMax: 5,
        durability: 1,
        maxDurability: 1,
      } as EquipmentItem;
      const state = makeState({
        equipmentSlot1: shield,
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: 0 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
        slotTempArmor: { equipmentSlot1: -2, equipmentSlot2: 0 },
      });

      expect(getSlotArmorCap(state, 'equipmentSlot1')).toBe(3);
    });

    it('floors final sum at 0 when total goes negative: base 1 + perm -5 + temp 0 = 0', () => {
      const shield: EquipmentItem = {
        id: 'sh-1',
        type: 'shield',
        name: '盾',
        value: 1,
        armorMax: 1,
        durability: 1,
        maxDurability: 1,
      } as EquipmentItem;
      const state = makeState({
        equipmentSlot1: shield,
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: -5 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
      });

      expect(getSlotArmorCap(state, 'equipmentSlot1')).toBe(0);
    });

    it('monster equipment: base 4 (hp) + perm -1 + temp 2 = 5', () => {
      const monsterEquip: EquipmentItem = {
        id: 'm-1',
        type: 'monster',
        name: '怪物装备',
        value: 4,
        hp: 4,
        durability: 1,
        maxDurability: 1,
      } as EquipmentItem;
      const state = makeState({
        equipmentSlot1: monsterEquip,
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: -1 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
        slotTempArmor: { equipmentSlot1: 2, equipmentSlot2: 0 },
      });

      expect(getSlotArmorCap(state, 'equipmentSlot1')).toBe(5);
    });
  });

  describe('getSlotCurrentArmor — armor=undefined defaults to cap (with negative bonuses)', () => {
    it('user scenario: base 1 + temp 3 + perm -1, armor undefined → reads as 3 (not 4)', () => {
      const shield: EquipmentItem = {
        id: 'sh-1',
        type: 'shield',
        name: '盾',
        value: 1,
        armorMax: 1,
        durability: 2,
        maxDurability: 2,
      } as EquipmentItem;
      const state = makeState({
        equipmentSlot1: shield,
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: -1 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
        slotTempArmor: { equipmentSlot1: 3, equipmentSlot2: 0 },
      });

      expect(getSlotCurrentArmor(state, 'equipmentSlot1')).toBe(3);
    });

    it('clamps existing stored armor to new (lower) cap', () => {
      const shield: EquipmentItem = {
        id: 'sh-1',
        type: 'shield',
        name: '盾',
        value: 1,
        armorMax: 1,
        armor: 4, // stale: was full at cap=4 before perm went to -1
        durability: 2,
        maxDurability: 2,
      } as EquipmentItem;
      const state = makeState({
        equipmentSlot1: shield,
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: -1 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
        slotTempArmor: { equipmentSlot1: 3, equipmentSlot2: 0 },
      });

      // cap = 1 + (-1) + 3 = 3; stored 4 clamps down
      expect(getSlotCurrentArmor(state, 'equipmentSlot1')).toBe(3);
    });
  });

  describe('computeSlotArmorValuePure (helpers.ts) — defenseBonus + negative perm', () => {
    it('base 1 + defense 0 + perm -1 + temp 3 = 3', () => {
      const shield: EquipmentItem = {
        id: 'sh-1',
        type: 'shield',
        name: '盾',
        value: 1,
        armorMax: 1,
        durability: 2,
        maxDurability: 2,
      } as EquipmentItem;
      const state = makeState({
        equipmentSlot1: shield,
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: -1 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
        slotTempArmor: { equipmentSlot1: 3, equipmentSlot2: 0 },
      });

      expect(computeSlotArmorValuePure(state, 'equipmentSlot1')).toBe(3);
    });
  });

  describe('computeShieldBlockValue (combat.ts) — already correct (sum-then-floor)', () => {
    it('counts negative perm: shieldValue 1 + defense 0 + perm -1 + temp 3 = 3', () => {
      const value = computeShieldBlockValue({
        shieldValue: 1,
        slotId: 'equipmentSlot1',
        slotShieldBonus: -1,
        slotTempArmor: 3,
        defenseBonus: 0,
        amuletEffects: {} as any,
        isMonsterEquip: false,
        gold: 0,
      });

      expect(value).toBe(3);
    });
  });
});
