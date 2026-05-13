/**
 * 辞剑相易 (knight:persuade-to-temp-attack) — Perm 1 magic.
 *
 * Behavior:
 *   - X mirrors the hero-card "下次劝降 +X%" sticker exactly:
 *       X = persuadeAmuletBonus           (temp; cleared)
 *         + persuadeDiscount.rateBonus    (temp; cleared — same semantics as
 *                                           PERSUADE_MONSTER auto-clearing
 *                                           persuadeDiscount)
 *         + permanentPersuadeBonus        (perm; NOT cleared)
 *         + (persuadeLevel - 1) * 5       (perm; NOT cleared — comes from
 *                                           persuadeLevel+1 events like
 *                                           威压交涉 / 永誓低吟 / 怀柔圣殿)
 *   - Per equipment slot += Math.ceil(X / 3) temp attack (slot1 + slot2 each)
 *   - "Cleared 临时部分":
 *       persuadeAmuletBonus → 0;
 *       persuadeDiscount.rateBonus → 0 (costReduction PRESERVED — we don't
 *       null the whole object so any cost discount the player has stays).
 *   - X = 0 on a pass: that pass fizzles (no temp attack added) but the card
 *     is still consumed normally.
 *   - Spell Echo (Category C, structural): runs `echoMultiplier` times.
 *     After pass 1, both temp parts are cleared, so pass 2's X = perm-only
 *     contributors (permanentPersuadeBonus + (persuadeLevel - 1) * 5). If any
 *     perm contributor > 0, pass 2 still adds another ceil(perm/3) per slot.
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

function makePersuadeBladeCard(idSuffix = 'a'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '辞剑相易',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：下次劝降 +X% 转化成双栏各 ⌈X/3⌉ 临时攻击；清空临时劝降加成。',
    description: '永久：将「下次劝降 +X%」转化为左右装备栏各 ⌈X/3⌉ 临时攻击，并清空临时劝降率（永久部分保留）。',
    knightEffect: 'persuade-to-temp-attack',
    recycleDelay: 1,
    maxUpgradeLevel: 0,
  } as any;
}

// ---------------------------------------------------------------------------
// Single pass — basic mechanic
// ---------------------------------------------------------------------------

describe('辞剑相易 PLAY_CARD — single pass', () => {
  it('temp = 30, perm = 0 → each slot +10 temp atk; persuadeAmuletBonus → 0', () => {
    const card = makePersuadeBladeCard('p1');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 30,
      permanentPersuadeBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(10);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(10);
    expect(result.state.persuadeAmuletBonus).toBe(0);
    expect(result.state.permanentPersuadeBonus).toBe(0);
  });

  it('ceil rounding: temp = 25 → ceil(25/3) = 9 per slot', () => {
    const card = makePersuadeBladeCard('p2');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 25,
      permanentPersuadeBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(9);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(9);
  });

  it('ceil rounding: temp = 20 → ceil(20/3) = 7 per slot', () => {
    const card = makePersuadeBladeCard('p3');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 20,
      permanentPersuadeBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(7);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(7);
  });

  it('X = perm only: temp = 0, perm = 15 → ceil(15/3) = 5 per slot; perm preserved', () => {
    const card = makePersuadeBladeCard('p4');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 15,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(5);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(5);
    expect(result.state.persuadeAmuletBonus).toBe(0);
    expect(result.state.permanentPersuadeBonus).toBe(15);
  });

  it('X = temp + perm: temp = 10, perm = 8 → ceil(18/3) = 6 per slot', () => {
    const card = makePersuadeBladeCard('p5');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 10,
      permanentPersuadeBonus: 8,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(6);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(6);
    expect(result.state.persuadeAmuletBonus).toBe(0);
    expect(result.state.permanentPersuadeBonus).toBe(8);
  });

  it('X = 0 (no buffs): fizzle — no temp attack added; persuadeAmuletBonus stays 0', () => {
    const card = makePersuadeBladeCard('p6');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 0,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.slotTempAttack?.equipmentSlot2 ?? 0).toBe(0);
    expect(result.state.persuadeAmuletBonus).toBe(0);
    // The card is still consumed (no longer in hand, and recycleDelay puts it
    // into the permanent magic recycle bag).
    expect(result.state.handCards.find((c: any) => c.id === card.id)).toBeUndefined();
  });

  it('preserves existing temp attack on slots (additive, not replace)', () => {
    const card = makePersuadeBladeCard('p7');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 12,
      permanentPersuadeBonus: 0,
      slotTempAttack: { equipmentSlot1: 5, equipmentSlot2: 3 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(5 + 4);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(3 + 4);
  });
});

// ---------------------------------------------------------------------------
// persuadeDiscount.rateBonus is the "event-given temp buff" (e.g. 际遇轮盘
// +20%, certain magic). It contributes to X and gets cleared, but
// costReduction (also temp on the same object) MUST be preserved.
// ---------------------------------------------------------------------------

describe('辞剑相易 — persuadeDiscount.rateBonus contributes to X and is cleared', () => {
  it('discount.rateBonus only: 20 → ceil(20/3)=7 per slot; rateBonus → 0; costReduction preserved', () => {
    const card = makePersuadeBladeCard('d1');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 0,
      persuadeDiscount: { costReduction: 5, rateBonus: 20 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(7);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(7);
    expect(result.state.persuadeDiscount?.rateBonus).toBe(0);
    expect(result.state.persuadeDiscount?.costReduction).toBe(5);
  });

  it('all three contributors stack: amulet=10, discount.rateBonus=12, perm=8 → ceil(30/3)=10 per slot', () => {
    const card = makePersuadeBladeCard('d2');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 10,
      permanentPersuadeBonus: 8,
      persuadeDiscount: { costReduction: 0, rateBonus: 12 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(10);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(10);
    expect(result.state.persuadeAmuletBonus).toBe(0);
    expect(result.state.persuadeDiscount?.rateBonus).toBe(0);
    expect(result.state.permanentPersuadeBonus).toBe(8);
  });

  it('discount = null (no discount object) is fine; X falls back to amulet+perm only', () => {
    const card = makePersuadeBladeCard('d3');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 9,
      permanentPersuadeBonus: 0,
      persuadeDiscount: null,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(3);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(3);
    expect(result.state.persuadeDiscount).toBeNull();
  });

  it('discount has costReduction but rateBonus=0: contributes nothing; costReduction stays', () => {
    const card = makePersuadeBladeCard('d4');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 0,
      persuadeDiscount: { costReduction: 8, rateBonus: 0 },
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // X = 0 → fizzle, but costReduction must NOT be touched.
    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.slotTempAttack?.equipmentSlot2 ?? 0).toBe(0);
    expect(result.state.persuadeDiscount?.costReduction).toBe(8);
    expect(result.state.persuadeDiscount?.rateBonus).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// persuadeLevel contributes (persuadeLevel - 1) * 5 to X (permanent, never
// cleared). Source: persuadeLevel+1 events such as 威压交涉 / 永誓低吟 / 怀柔圣殿.
// This is the bug class reported by user "我有一个永久的 5% 劝降加成，用了这张牌
// 后应该获得 ⌈5/3⌉ 的临时攻击，但是却没有获得" — pre-fix, the resolver only
// summed three components and ignored persuadeLevel, so X = 0 → fizzle.
// ---------------------------------------------------------------------------

describe('辞剑相易 — persuadeLevel contributes (persuadeLevel - 1) * 5 to X', () => {
  it('repro from bug report: persuadeLevel = 2 (UI shows +5%), all else 0 → ceil(5/3) = 2 per slot', () => {
    const card = makePersuadeBladeCard('lv1');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 0,
      persuadeDiscount: null,
      persuadeLevel: 2,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(2);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(2);
    // persuadeLevel is permanent — must NOT be touched.
    expect(result.state.persuadeLevel).toBe(2);
  });

  it('persuadeLevel = 3 (UI shows +10%), all else 0 → ceil(10/3) = 4 per slot', () => {
    const card = makePersuadeBladeCard('lv2');
    const state = makeState({
      handCards: [card] as any,
      persuadeLevel: 3,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(4);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(4);
    expect(result.state.persuadeLevel).toBe(3);
  });

  it('persuadeLevel = 1 (default) contributes 0; with no other buffs → fizzle', () => {
    const card = makePersuadeBladeCard('lv3');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 0,
      persuadeLevel: 1,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.slotTempAttack?.equipmentSlot2 ?? 0).toBe(0);
  });

  it('all four contributors stack: amulet=4, discount.rateBonus=6, perm=8, level=2 → ceil(23/3)=8 per slot', () => {
    const card = makePersuadeBladeCard('lv4');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 4,
      permanentPersuadeBonus: 8,
      persuadeDiscount: { costReduction: 0, rateBonus: 6 },
      persuadeLevel: 2,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // X = 4 + 8 + 6 + (2-1)*5 = 23 → ceil(23/3) = 8
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(8);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(8);
    // Temp parts cleared; perm parts (perm + level) preserved.
    expect(result.state.persuadeAmuletBonus).toBe(0);
    expect(result.state.persuadeDiscount?.rateBonus).toBe(0);
    expect(result.state.permanentPersuadeBonus).toBe(8);
    expect(result.state.persuadeLevel).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Spell Echo — Category C: runs N times; perm bonus may carry into pass 2
// ---------------------------------------------------------------------------

describe('辞剑相易 法术回响 (Spell Echo, Category C)', () => {
  it('temp = 30, perm = 0, doubleNextMagic → pass 1 = ceil(30/3) = 10; pass 2 X = 0 → no extra', () => {
    const card = makePersuadeBladeCard('e1');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 30,
      permanentPersuadeBonus: 0,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Only pass 1 contributes; total per slot = 10.
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(10);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(10);
    expect(result.state.persuadeAmuletBonus).toBe(0);
  });

  it('temp = 30, perm = 15, doubleNextMagic → pass1 ceil(45/3)=15; pass2 ceil(15/3)=5; total = 20 per slot', () => {
    const card = makePersuadeBladeCard('e2');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 30,
      permanentPersuadeBonus: 15,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(20);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(20);
    expect(result.state.persuadeAmuletBonus).toBe(0);
    expect(result.state.permanentPersuadeBonus).toBe(15);
  });

  it('temp = 0, perm = 9, doubleNextMagic → both passes use perm; per slot = ceil(9/3)*2 = 6', () => {
    const card = makePersuadeBladeCard('e3');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 9,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(6);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(6);
    expect(result.state.permanentPersuadeBonus).toBe(9);
  });

  it('temp = 0, perm = 0, doubleNextMagic → both passes fizzle; no temp atk added', () => {
    const card = makePersuadeBladeCard('e4');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 0,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.slotTempAttack?.equipmentSlot2 ?? 0).toBe(0);
  });

  it('discount.rateBonus only carries pass 1; pass 2 X = perm only (echo)', () => {
    const card = makePersuadeBladeCard('e6');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 6,
      persuadeDiscount: { costReduction: 0, rateBonus: 24 },
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Pass 1: X = 0 + 24 + 6 = 30 → ceil(30/3) = 10 per slot
    // Pass 2: X = 0 + 0 + 6  =  6 → ceil(6/3)  =  2 per slot
    // Total per slot: 12
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(12);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(12);
    expect(result.state.persuadeDiscount?.rateBonus).toBe(0);
    expect(result.state.permanentPersuadeBonus).toBe(6);
  });

  it('persuadeLevel = 2 only, doubleNextMagic → both passes use level bonus; per slot = ceil(5/3) * 2 = 4', () => {
    const card = makePersuadeBladeCard('e7');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 0,
      permanentPersuadeBonus: 0,
      persuadeLevel: 2,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Pass 1: X = 0 + 0 + 0 + (2-1)*5 = 5 → ceil(5/3) = 2 per slot
    // Pass 2: temp parts already 0; level still 2 → X = 5 → ceil(5/3) = 2 per slot
    // Total per slot: 4
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(4);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(4);
    expect(result.state.persuadeLevel).toBe(2);
  });

  it('echo banner mentions 回响×2 when doubleNextMagic active', () => {
    const card = makePersuadeBladeCard('e5');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 12,
      permanentPersuadeBonus: 0,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const log = JSON.stringify(result.sideEffects);
    expect(log).toMatch(/回响×2/);
  });
});

// ---------------------------------------------------------------------------
// Side-effect smoke: card consumed; magic log entry emitted
// ---------------------------------------------------------------------------

describe('辞剑相易 PLAY_CARD — meta', () => {
  it('emits a magic log entry mentioning 辞剑相易', () => {
    const card = makePersuadeBladeCard('m1');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 6,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const hasLog = result.sideEffects.some(
      (e: any) => e?.event === 'log:entry' && /辞剑相易/.test(e?.payload?.message ?? ''),
    );
    expect(hasLog).toBe(true);
  });

  it('does not set pendingMagicAction (non-interactive resolver)', () => {
    const card = makePersuadeBladeCard('m2');
    const state = makeState({
      handCards: [card] as any,
      persuadeAmuletBonus: 6,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingMagicAction).toBeFalsy();
    expect(result.state.handCards.find((c: any) => c.id === card.id)).toBeUndefined();
  });
});
