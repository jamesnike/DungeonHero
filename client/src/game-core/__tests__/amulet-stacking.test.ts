/**
 * Amulet stacking semantics — N copies of the same amulet should stack.
 *
 * Universal rule per user spec: each equipped amulet operates independently,
 * and visible effects naturally aggregate. Some effects sum linearly (Strength
 * +4/amulet attack), some compound (Heal × 2^N, Flash damage / 2^N), some
 * accumulate per-amulet bonuses (Persuade temp-attack), and progress-counter
 * amulets tick by N per qualifying event.
 *
 * This test file pins the canonical aggregation rules in `computeAmuletEffects`
 * for representative amulets, plus verifies the dual-guard fix (the original
 * regression: with 2 dual-guard amulets, perfect-block must grant +2 permanent
 * armor, not +1).
 */

import { describe, expect, it } from 'vitest';
import { computeAmuletEffects } from '../equipment';
import type { GameCardData } from '../types';

function makeAmulet(effect: string, id: string, upgradeLevel = 0): GameCardData {
  return {
    id,
    type: 'amulet',
    name: `${effect}-${id}`,
    value: 0,
    amuletEffect: effect,
    upgradeLevel,
  } as GameCardData;
}

describe('computeAmuletEffects stacking', () => {
  describe('linear stack (count)', () => {
    it('双守护圣盾 ×2 — dualGuardCount = 2', () => {
      const fx = computeAmuletEffects([
        makeAmulet('dual-guard', 'dg-1'),
        makeAmulet('dual-guard', 'dg-2'),
      ] as any);
      expect(fx.dualGuardCount).toBe(2);
    });

    it('力量 ×3 — strengthCount = 3 (consumer multiplies aura by N)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('strength', 's-1'),
        makeAmulet('strength', 's-2'),
        makeAmulet('strength', 's-3'),
      ] as any);
      expect(fx.strengthCount).toBe(3);
    });

    it('均衡 ×2 — balanceCount = 2 (consumer multiplies aura by N)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('balance', 'b-1'),
        makeAmulet('balance', 'b-2'),
      ] as any);
      expect(fx.balanceCount).toBe(2);
    });

    it('生命 ×3 — lifeOverkillBonus = 4 × N', () => {
      const fx = computeAmuletEffects([
        makeAmulet('life', 'l-1'),
        makeAmulet('life', 'l-2'),
        makeAmulet('life', 'l-3'),
      ] as any);
      expect(fx.lifeOverkillBonus).toBe(12);
    });

    it('击晕金币 ×3 — stunGoldCount = 3 (consumer multiplies +10 per amulet)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('stun-gold', 'sg-1'),
        makeAmulet('stun-gold', 'sg-2'),
        makeAmulet('stun-gold', 'sg-3'),
      ] as any);
      expect(fx.stunGoldCount).toBe(3);
    });

    it('击晕率 ×3 — stunRateBoost = 20 × N (each amulet adds 20% stun chance)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('stun-rate-boost', 'sr-1'),
        makeAmulet('stun-rate-boost', 'sr-2'),
        makeAmulet('stun-rate-boost', 'sr-3'),
      ] as any);
      expect(fx.stunRateBoost).toBe(60);
    });
  });

  describe('compound stack (counts feed into 2^N at consumer)', () => {
    it('治愈 ×3 — healCount = 3 (consumer multiplies heal by 2^3 = 8)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('heal', 'h-1'),
        makeAmulet('heal', 'h-2'),
        makeAmulet('heal', 'h-3'),
      ] as any);
      expect(fx.healCount).toBe(3);
    });

    it('闪光 ×2 — flashCount = 2 (consumer divides damage by 2^2 = 4 and grants 2 extra attacks)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('flash', 'f-1'),
        makeAmulet('flash', 'f-2'),
      ] as any);
      expect(fx.flashCount).toBe(2);
    });
  });

  describe('summed bonuses (per-amulet bonus accumulated)', () => {
    it('怀柔之印 ×2 (base + upgraded) — count = 2, bonus = 10 + 20 = 30', () => {
      const fx = computeAmuletEffects([
        makeAmulet('persuade-on-temp-attack', 'p-1', 0),
        makeAmulet('persuade-on-temp-attack', 'p-2', 1),
      ] as any);
      expect(fx.persuadeOnTempAttackCount).toBe(2);
      expect(fx.persuadeOnTempAttackBonus).toBe(30);
    });

    it('劝降归袋符 ×2 (base + upgraded) — count = 2, total = 1 + 2 = 3', () => {
      const fx = computeAmuletEffects([
        makeAmulet('persuade-grant-recycle-fetch', 'pg-1', 0),
        makeAmulet('persuade-grant-recycle-fetch', 'pg-2', 1),
      ] as any);
      expect(fx.persuadeGrantRecycleFetchCount).toBe(2);
      expect(fx.persuadeGrantRecycleFetchTotal).toBe(3);
    });
  });

  describe('progress / discrete-event counters', () => {
    it('回收锻造 ×2 — recycleForgeCount = 2 (advances forge progress by 2 per play)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('recycle-forge', 'rf-1'),
        makeAmulet('recycle-forge', 'rf-2'),
      ] as any);
      expect(fx.recycleForgeCount).toBe(2);
    });

    it('装备打捞 ×2 — equipmentSalvageCount = 2 (consumer reduces maxDurability by N)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('equipment-salvage', 'es-1'),
        makeAmulet('equipment-salvage', 'es-2'),
      ] as any);
      expect(fx.equipmentSalvageCount).toBe(2);
    });

    it('孤牌 ×2 — loneCardCount = 2 (consumer draws N extra cards)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('lone-card', 'lc-1'),
        makeAmulet('lone-card', 'lc-2'),
      ] as any);
      expect(fx.loneCardCount).toBe(2);
    });

    it('翻金 ×3 — flipGoldCount = 3 (consumer awards FLIP_GOLD_REWARD × N per flip)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('flip-gold', 'fg-1'),
        makeAmulet('flip-gold', 'fg-2'),
        makeAmulet('flip-gold', 'fg-3'),
      ] as any);
      expect(fx.flipGoldCount).toBe(3);
    });

    it('弹射 ×2 — catapultCount = 2 (consumer draws 2 × N cards on discard)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('catapult', 'c-1'),
        makeAmulet('catapult', 'c-2'),
      ] as any);
      expect(fx.catapultCount).toBe(2);
    });

    it('discard-zap ×2 — discardShockCount = 2 (consumer fires N independent zaps)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('discard-zap', 'dz-1'),
        makeAmulet('discard-zap', 'dz-2'),
      ] as any);
      expect(fx.discardShockCount).toBe(2);
    });

    it('flip-zap ×3 — flipZapCount = 3 (consumer fires N independent zaps per flip)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('flip-zap', 'fz-1'),
        makeAmulet('flip-zap', 'fz-2'),
        makeAmulet('flip-zap', 'fz-3'),
      ] as any);
      expect(fx.flipZapCount).toBe(3);
    });

    it('招灵书印 ×2 — deleteDrawCount = 2 (consumer draws 2 × N cards per delete)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('delete-draw', 'dd-1'),
        makeAmulet('delete-draw', 'dd-2'),
      ] as any);
      expect(fx.deleteDrawCount).toBe(2);
    });

    it('墓园守卫 ×3 — lastWordsExtraTriggerCount = 3 (consumer fires lastWords 1 + N times per base trigger)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('last-words-extra-trigger', 'lwx-1'),
        makeAmulet('last-words-extra-trigger', 'lwx-2'),
        makeAmulet('last-words-extra-trigger', 'lwx-3'),
      ] as any);
      expect(fx.lastWordsExtraTriggerCount).toBe(3);
    });
  });

  describe('combat counters', () => {
    it('狂暴攻击 ×3 — bloodrageAttackCount = 3 (consumer adds 3 × N attack on self-damage)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('bloodrage-attack', 'br-1'),
        makeAmulet('bloodrage-attack', 'br-2'),
        makeAmulet('bloodrage-attack', 'br-3'),
      ] as any);
      expect(fx.bloodrageAttackCount).toBe(3);
    });

    it('赎血召牌符 ×3 — selfDamageDrawCount = 3 (consumer draws N cards per self-damage event)', () => {
      const fx = computeAmuletEffects([
        makeAmulet('self-damage-draw', 'sdd-1'),
        makeAmulet('self-damage-draw', 'sdd-2'),
        makeAmulet('self-damage-draw', 'sdd-3'),
      ] as any);
      expect(fx.selfDamageDrawCount).toBe(3);
    });

    it('护甲减半 ×2 — armorHalveEndureCount = 2', () => {
      const fx = computeAmuletEffects([
        makeAmulet('armor-halve-endure', 'ah-1'),
        makeAmulet('armor-halve-endure', 'ah-2'),
      ] as any);
      expect(fx.armorHalveEndureCount).toBe(2);
    });

    it('攻击劝降折扣 ×2 — attackPersuadeDiscountCount = 2', () => {
      const fx = computeAmuletEffects([
        makeAmulet('attack-persuade-discount', 'apd-1'),
        makeAmulet('attack-persuade-discount', 'apd-2'),
      ] as any);
      expect(fx.attackPersuadeDiscountCount).toBe(2);
    });
  });

  describe('mixed amulets co-exist independently', () => {
    it('mix of strength ×2, dual-guard ×1, heal ×3 produces independent counters', () => {
      const fx = computeAmuletEffects([
        makeAmulet('strength', 's-1'),
        makeAmulet('strength', 's-2'),
        makeAmulet('dual-guard', 'dg-1'),
        makeAmulet('heal', 'h-1'),
        makeAmulet('heal', 'h-2'),
        makeAmulet('heal', 'h-3'),
      ] as any);
      expect(fx.strengthCount).toBe(2);
      expect(fx.dualGuardCount).toBe(1);
      expect(fx.healCount).toBe(3);
    });
  });

  describe('zero baseline', () => {
    it('empty slots — every counter is 0', () => {
      const fx = computeAmuletEffects([] as any);
      expect(fx.strengthCount).toBe(0);
      expect(fx.balanceCount).toBe(0);
      expect(fx.healCount).toBe(0);
      expect(fx.flashCount).toBe(0);
      expect(fx.dualGuardCount).toBe(0);
      expect(fx.lifeOverkillBonus).toBe(0);
      expect(fx.stunRateBoost).toBe(0);
      expect(fx.persuadeOnTempAttackBonus).toBe(0);
      expect(fx.lastWordsExtraTriggerCount).toBe(0);
    });
  });
});
