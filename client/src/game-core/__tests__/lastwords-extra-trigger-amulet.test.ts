/**
 * 墓园守卫 (last-words-extra-trigger amulet) — 装备的遗言额外多触发 1 次
 *
 * Pins:
 * 1. computeAmuletEffects: aggregates linearly (N amulets → count = N).
 * 2. computeEquipmentBreakEffects: gold / permDamage / permShield / lastWordsSlotTempBuff
 *    / lastWordsMaxHpBoost / drawFromBackpack accumulate cumulatively across
 *    1 + N iterations.
 * 3. computeEquipmentDisplacementLastWords: same cumulative semantics, no revive.
 * 4. Per-trigger amulet interaction: 绝响之符 (lastwords-monster-debuff) fires
 *    on EACH iteration, so monster attack reduction × (1 + N).
 * 5. Stacking: N amulets + base trigger = 1 + N total iterations (linear).
 * 6. 墓语遗愿 (crypt-deathwish) calls displacement 2× — combined with N amulets
 *    we expect 2 × (1 + N) total iterations (each crypt-deathwish call independently
 *    amplified by the amulet).
 */

import { describe, expect, it } from 'vitest';
import {
  computeEquipmentBreakEffects,
  computeEquipmentDisplacementLastWords,
} from '../rules/equipment-effects';
import { computeAmuletEffects } from '../equipment';
import { createInitialGameState } from '../state';
import { createEmptyAmuletEffects } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(id: string, attack: number): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mon-${id}`,
    value: attack,
    attack,
    hp: 5,
    maxHp: 5,
    fury: 1,
    currentLayer: 1,
  } as GameCardData;
}

describe('墓园守卫 (last-words-extra-trigger amulet)', () => {
  describe('computeAmuletEffects integration', () => {
    it('lastWordsExtraTriggerCount is 0 by default', () => {
      const fx = computeAmuletEffects([]);
      expect(fx.lastWordsExtraTriggerCount).toBe(0);
    });

    it('1 amulet → count = 1', () => {
      const a: GameCardData = {
        id: 'a1',
        type: 'amulet',
        name: '墓园守卫',
        value: 1,
        amuletEffect: 'last-words-extra-trigger',
      };
      const fx = computeAmuletEffects([a]);
      expect(fx.lastWordsExtraTriggerCount).toBe(1);
    });

    it('3 amulets → count = 3 (linear)', () => {
      const make = (id: string): GameCardData => ({
        id,
        type: 'amulet',
        name: '墓园守卫',
        value: 1,
        amuletEffect: 'last-words-extra-trigger',
      });
      const fx = computeAmuletEffects([make('a1'), make('a2'), make('a3')]);
      expect(fx.lastWordsExtraTriggerCount).toBe(3);
    });
  });

  describe('computeEquipmentBreakEffects — cumulative effects across iterations', () => {
    it('1 amulet (count=1) → gold accumulates 2× from 1 base + 1 extra trigger', () => {
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'GoldBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyGold: 5,
      } as GameCardData;
      const state = makeState({ equipmentSlot1: weapon as any, gold: 100 });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsExtraTriggerCount: 1,
      };

      const r = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      expect(r.patch.gold).toBe(110); // 100 + 5×2
    });

    it('2 amulets (count=2) → gold accumulates 3× from 1 base + 2 extra triggers', () => {
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'GoldBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyGold: 5,
      } as GameCardData;
      const state = makeState({ equipmentSlot1: weapon as any, gold: 0 });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsExtraTriggerCount: 2,
      };

      const r = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      expect(r.patch.gold).toBe(15); // 0 + 5×3
    });

    it('1 amulet → permanent slot damage bonus accumulates across 2 triggers', () => {
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'TestBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyPermanentDamage: 1,
      } as GameCardData;
      const state = makeState({ equipmentSlot1: weapon as any });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsExtraTriggerCount: 1,
      };

      const r = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      const baseBonus = state.equipmentSlotBonuses.equipmentSlot1.damage;
      const newBonus = r.patch.equipmentSlotBonuses?.equipmentSlot1.damage ?? baseBonus;
      expect(newBonus - baseBonus).toBe(2); // +1 × 2 triggers
    });

    it('1 amulet → drawFromBackpack accumulates: onDestroyDraw=2 → 4 total', () => {
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'DrawBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyDraw: 2,
      } as GameCardData;
      const state = makeState({ equipmentSlot1: weapon as any });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsExtraTriggerCount: 1,
      };

      const r = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      expect(r.drawFromBackpack).toBe(4);
    });

    it('1 amulet → lastWordsSlotTempBuff stacks accumulate: each trigger adds 3 atk + 3 armor → 6/6 over 2 triggers', () => {
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'TestBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        lastWordsSlotTempBuff: 1,
      } as GameCardData;
      const state = makeState({
        equipmentSlot1: weapon as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsExtraTriggerCount: 1,
      };

      const r = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      expect(r.patch.slotTempAttack?.equipmentSlot1).toBe(6); // 3 × 2 triggers
      expect(r.patch.slotTempArmor?.equipmentSlot1).toBe(6);
    });

    it('1 amulet → permanentMaxHpBonus accumulates: lastWordsMaxHpBoost=1 → +8 (4×2 triggers)', () => {
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'MaxHpBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        lastWordsMaxHpBoost: 1,
      } as GameCardData;
      const state = makeState({ equipmentSlot1: weapon as any, permanentMaxHpBonus: 0 });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsExtraTriggerCount: 1,
      };

      const r = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      expect(r.patch.permanentMaxHpBonus).toBe(8); // 4 × 2 triggers
    });

    it('count=0 (no amulet) → behaves identically to base case (1 trigger only)', () => {
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'GoldBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyGold: 5,
      } as GameCardData;
      const state = makeState({ equipmentSlot1: weapon as any, gold: 100 });

      const r = computeEquipmentBreakEffects(
        state,
        'equipmentSlot1',
        weapon,
        createEmptyAmuletEffects(),
      );
      expect(r.patch.gold).toBe(105); // 100 + 5×1
    });
  });

  describe('computeEquipmentDisplacementLastWords — cumulative effects', () => {
    it('1 amulet → onDestroyGold accumulates 2× under displacement', () => {
      const displaced: GameCardData = {
        id: 's1',
        type: 'shield',
        name: 'GoldShield',
        value: 0,
        onDestroyGold: 7,
      } as GameCardData;
      const state = makeState({ gold: 0 });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsExtraTriggerCount: 1,
      };

      const r = computeEquipmentDisplacementLastWords(
        state,
        'equipmentSlot2',
        displaced,
        amuletEffects,
      );
      expect(r.patch.gold).toBe(14); // 7 × 2
    });

    it('count=0 → 1 trigger only', () => {
      const displaced: GameCardData = {
        id: 's1',
        type: 'shield',
        name: 'GoldShield',
        value: 0,
        onDestroyGold: 7,
      } as GameCardData;
      const state = makeState({ gold: 0 });

      const r = computeEquipmentDisplacementLastWords(
        state,
        'equipmentSlot2',
        displaced,
        createEmptyAmuletEffects(),
      );
      expect(r.patch.gold).toBe(7);
    });
  });

  describe('per-trigger amulet co-firing (绝响之符 + 墓园守卫)', () => {
    it('break: monster attack reduced × (1 + N) iterations', () => {
      const m1 = makeMonster('m1', 10);
      const activeCards: ActiveRowSlots = [m1, null, null, null, null];
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'TestBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyPermanentDamage: 1, // need any lastWords to trigger debuff
      } as GameCardData;
      const state = makeState({ activeCards, equipmentSlot1: weapon as any });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsMonsterDebuffCount: 1, // 绝响之符 -1 per trigger
        lastWordsExtraTriggerCount: 2,  // 墓园守卫 ×2 → 1 + 2 = 3 triggers
      };

      const r = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      const updated = (r.patch.activeCards ?? activeCards) as ActiveRowSlots;
      expect(updated[0]?.attack).toBe(7); // 10 - 1 × 3
    });

    it('displacement: monster attack reduced × (1 + N) iterations', () => {
      const m1 = makeMonster('m1', 6);
      const activeCards: ActiveRowSlots = [m1, null, null, null, null];
      const displaced: GameCardData = {
        id: 's1',
        type: 'shield',
        name: 'GoldShield',
        value: 0,
        onDestroyGold: 5,
      } as GameCardData;
      const state = makeState({ activeCards });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsMonsterDebuffCount: 1,
        lastWordsExtraTriggerCount: 1, // 1 + 1 = 2 triggers
      };

      const r = computeEquipmentDisplacementLastWords(
        state,
        'equipmentSlot2',
        displaced,
        amuletEffects,
      );
      const updated = (r.patch.activeCards ?? activeCards) as ActiveRowSlots;
      expect(updated[0]?.attack).toBe(4); // 6 - 1 × 2
    });
  });

  describe('equipment with NO lastWords → amulet has no effect', () => {
    it('plain weapon (no onDestroy* fields) does not trigger any iteration effects', () => {
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'PlainBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
      } as GameCardData;
      const state = makeState({ equipmentSlot1: weapon as any, gold: 100 });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        lastWordsExtraTriggerCount: 5, // even with N=5, nothing fires if no lastWords
      };

      const r = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      expect(r.patch.gold).toBeUndefined();
      expect(r.drawFromBackpack).toBe(0);
      expect(r.classCardDraw).toBe(0);
    });
  });
});
