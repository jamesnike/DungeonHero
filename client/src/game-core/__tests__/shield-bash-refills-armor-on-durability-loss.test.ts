/**
 * Regression: 猛击之盾 should refill `armor` when bash consumes a durability layer.
 *
 * Bug reported by user: "拖动 猛击 消耗 耐久度 之后，应该和其他护盾一样，
 * 护甲值回满"。
 *
 * Background: `reduceResolveBlock` already implements the "refill on layer
 * break" semantics — when a durability layer is consumed (shieldArmorDepleted),
 * it strips `slotItem.armor` so the next read defaults back to the current
 * cap (base + perm + temp). This is the standard shield invariant.
 *
 * `reducePerformShieldBash` was missing this strip: bash decremented durability
 * but kept the (possibly damaged) `armor` value on the item, so a previously
 * hit shield (armor=1 after taking damage) would carry that depleted armor
 * forward into the next durability layer instead of refilling.
 *
 * Fix: in the non-break branch of bash durability loss, strip `armor` exactly
 * like `reduceResolveBlock` does on layer break.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { getSlotCurrentArmor, getSlotArmorCap } from '../equipment';
import type { GameState } from '../types';

import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

const monster = {
  id: 'm-bash',
  type: 'monster' as const,
  name: 'Goblin',
  value: 5,
  hp: 5,
  maxHp: 5,
  attack: 1,
  currentLayer: 5,
  fury: 5,
};

function bashShield(over: Record<string, unknown> = {}) {
  return {
    id: 's-bash',
    type: 'shield' as const,
    name: '猛击之盾',
    value: 2,
    durability: 4,
    maxDurability: 4,
    armorMax: 2,
    shieldBashStunRate: 5,
    shieldBashUnlimited: true,
    knightEffect: 'shield-bash' as const,
    fromSlot: 'equipmentSlot1' as const,
    ...over,
  };
}

describe('猛击之盾: bash consumes durability, armor refills to cap', () => {
  it('previously damaged armor (armor=1, cap=2) refills on bash durability loss', () => {
    // Shield has been hit before: armor is at 1 of cap 2.
    const shield = bashShield({ armor: 1 });
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: [monster, null, null, null, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m-bash'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });

    expect(getSlotCurrentArmor(state, 'equipmentSlot1')).toBe(1);

    const result = reduce(state, {
      type: 'PERFORM_SHIELD_BASH',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-bash',
      diceRoll: 20,
    });

    const after = result.state.equipmentSlot1!;
    expect(after.durability).toBe(3);
    expect(after.maxDurability).toBe(4);
    // Critical: `armor` field was stripped, so next read = cap = 2 (refilled).
    expect((after as any).armor).toBeUndefined();
    expect(getSlotCurrentArmor(result.state, 'equipmentSlot1')).toBe(
      getSlotArmorCap(result.state, 'equipmentSlot1'),
    );
    expect(getSlotCurrentArmor(result.state, 'equipmentSlot1')).toBe(2);
  });

  it('fresh shield (armor undefined) bashing keeps armor at cap', () => {
    // Shield never hit: armor is undefined, reads as cap.
    const shield = bashShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: [monster, null, null, null, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m-bash'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });

    const result = reduce(state, {
      type: 'PERFORM_SHIELD_BASH',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-bash',
      diceRoll: 20,
    });

    const after = result.state.equipmentSlot1!;
    expect(after.durability).toBe(3);
    expect((after as any).armor).toBeUndefined();
    expect(getSlotCurrentArmor(result.state, 'equipmentSlot1')).toBe(2);
  });

  it('refill respects perm shield bonus on slot (cap = base + perm)', () => {
    const shield = bashShield({ armor: 0 });
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: [monster, null, null, null, null] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 3 },
        equipmentSlot2: { damage: 0, shield: 0 },
      } as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m-bash'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });

    expect(getSlotArmorCap(state, 'equipmentSlot1')).toBe(5);

    const result = reduce(state, {
      type: 'PERFORM_SHIELD_BASH',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-bash',
      diceRoll: 20,
    });

    const after = result.state.equipmentSlot1!;
    expect(after.durability).toBe(3);
    expect((after as any).armor).toBeUndefined();
    // Cap = base 2 + perm 3 = 5; armor refills to 5.
    expect(getSlotCurrentArmor(result.state, 'equipmentSlot1')).toBe(5);
  });

  it('refill respects temp armor bonus (cap = base + perm + temp)', () => {
    const shield = bashShield({ armor: 1 });
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: [monster, null, null, null, null] as any,
      slotTempArmor: { equipmentSlot1: 2, equipmentSlot2: 0 } as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m-bash'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });

    const result = reduce(state, {
      type: 'PERFORM_SHIELD_BASH',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-bash',
      diceRoll: 20,
    });

    const after = result.state.equipmentSlot1!;
    expect(after.durability).toBe(3);
    expect((after as any).armor).toBeUndefined();
    // Cap = base 2 + temp 2 = 4; armor refills to 4.
    expect(getSlotCurrentArmor(result.state, 'equipmentSlot1')).toBe(4);
  });

  it('break path (durability 1 → 0) routes to graveyard, not the refill branch', () => {
    // When durability hits 0 the equipment-break pipeline takes over; this
    // test just sanity-checks we did not regress the break path while fixing
    // the non-break path.
    const shield = bashShield({ durability: 1, maxDurability: 4, armor: 0 });
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: [monster, null, null, null, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m-bash'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });

    const result = reduce(state, {
      type: 'PERFORM_SHIELD_BASH',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-bash',
      diceRoll: 20,
    });

    expect(result.state.equipmentSlot1).toBeNull();
  });
});
