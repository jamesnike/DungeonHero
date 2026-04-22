/**
 * Equipment → Graveyard reset behaviour.
 *
 * Bug: equipment (weapons / shields) sent to the graveyard kept their stale
 * combat state — `durability < maxDurability`, `armor < armorMax`,
 * `reviveUsed: true`, etc. When a future graveyard-fetch effect (e.g. Iron
 * Shield's `graveyard-to-hand` last words, magic effects that pull from the
 * graveyard) recovers them, they came back broken / half-armored / unable
 * to revive.
 *
 * Fix: route weapon / shield through `resetEquipmentForGraveyard` (durability
 * → max, strip transient combat state) wherever they enter `discardedCards`.
 *
 * This file covers the two entry points:
 *   1. `ADD_TO_GRAVEYARD` reducer (covers the vast majority of paths).
 *   2. The direct `patch.discardedCards` mutation in `equipment-effects.ts`'s
 *      `graveyard-to-hand` branch (Iron Shield self-deposit after break).
 */

import { describe, expect, it } from 'vitest';
import type { GameCardData } from '@/components/GameCard';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { resetCardForGraveyard, resetEquipmentForGraveyard } from '../cards';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import { createEmptyAmuletEffects } from '../constants';
import type { GameState } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('Equipment graveyard reset', () => {
  describe('resetEquipmentForGraveyard helper', () => {
    it('refills weapon durability and strips transient flags', () => {
      const weapon: GameCardData = {
        id: 'w1', type: 'weapon', name: 'Sword', value: 0,
        durability: 1,
        maxDurability: 5,
        equipmentReviveUsed: true,
        fromSlot: 'equipmentSlot1',
      };

      const reset = resetEquipmentForGraveyard(weapon);

      expect(reset.durability).toBe(5);
      expect(reset.maxDurability).toBe(5);
      expect((reset as any).equipmentReviveUsed).toBeUndefined();
      expect((reset as any).fromSlot).toBeUndefined();
    });

    it('refills shield durability and clears armor + armorBonusDamaged', () => {
      const shield: GameCardData = {
        id: 's1', type: 'shield', name: 'Iron Shield', value: 0,
        durability: 0,
        maxDurability: 3,
        armor: 0,
        armorMax: 4,
        armorBonusDamaged: 2,
        reviveUsed: true,
        wraithRebirthUsed: true,
      };

      const reset = resetEquipmentForGraveyard(shield);

      expect(reset.durability).toBe(3);
      expect(reset.maxDurability).toBe(3);
      expect(reset.armorMax).toBe(4);
      expect(reset.armor).toBeUndefined();
      expect(reset.armorBonusDamaged).toBeUndefined();
      expect((reset as any).reviveUsed).toBeUndefined();
      expect((reset as any).wraithRebirthUsed).toBeUndefined();
    });

    it('passes non-equipment cards through unchanged', () => {
      const potion: GameCardData = {
        id: 'p1', type: 'potion', name: 'Heal', value: 5,
      };
      expect(resetEquipmentForGraveyard(potion)).toBe(potion);
    });

    it('does not touch monster equipment (handled by resetMonsterForGraveyard)', () => {
      const monsterEquip: GameCardData = {
        id: 'm1', type: 'monster', name: 'Wraith', value: 0,
        durability: 1, maxDurability: 3, hp: 3, attack: 5,
      };
      // Monster equipment passes through unchanged here; the monster-specific
      // reset (which strips durability entirely to revert to monster-card form)
      // runs in `resetMonsterForGraveyard` instead.
      expect(resetEquipmentForGraveyard(monsterEquip)).toBe(monsterEquip);
    });
  });

  describe('resetCardForGraveyard combined dispatcher', () => {
    it('routes weapons through equipment reset', () => {
      const weapon: GameCardData = {
        id: 'w1', type: 'weapon', name: 'Axe', value: 0,
        durability: 0, maxDurability: 4,
      };
      const reset = resetCardForGraveyard(weapon);
      expect(reset.durability).toBe(4);
    });

    it('routes monsters through monster reset (strips durability)', () => {
      const monster: GameCardData = {
        id: 'm1', type: 'monster', name: 'Goblin', value: 5,
        attack: 15, tempAttackBoost: 10, durability: 1, maxDurability: 3,
      };
      const reset = resetCardForGraveyard(monster);
      expect(reset.durability).toBeUndefined();
      expect(reset.maxDurability).toBeUndefined();
      expect(reset.tempAttackBoost).toBe(0);
    });
  });

  describe('ADD_TO_GRAVEYARD reducer', () => {
    it('refills broken weapon durability when sent to graveyard', () => {
      const brokenSword: GameCardData = {
        id: 'sword-1', type: 'weapon', name: 'Sword', value: 0,
        durability: 0, maxDurability: 4,
        equipmentReviveUsed: true,
      };
      const state = makeState({ discardedCards: [] });

      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: brokenSword });

      expect(result.state.discardedCards).toHaveLength(1);
      const inGrave = result.state.discardedCards[0];
      expect(inGrave.durability).toBe(4);
      expect(inGrave.maxDurability).toBe(4);
      expect((inGrave as any).equipmentReviveUsed).toBeUndefined();
    });

    it('refills shield durability and clears armor when sent to graveyard', () => {
      const damagedShield: GameCardData = {
        id: 'shield-1', type: 'shield', name: 'Iron Shield', value: 0,
        durability: 1, maxDurability: 3,
        armor: 1, armorMax: 4, armorBonusDamaged: 2,
        reviveUsed: true,
      };
      const state = makeState({ discardedCards: [] });

      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: damagedShield });

      const inGrave = result.state.discardedCards[0];
      expect(inGrave.durability).toBe(3);
      expect(inGrave.armor).toBeUndefined();
      expect(inGrave.armorBonusDamaged).toBeUndefined();
      expect((inGrave as any).reviveUsed).toBeUndefined();
      // Static template fields preserved.
      expect(inGrave.armorMax).toBe(4);
      expect(inGrave.maxDurability).toBe(3);
    });

    it('still resets monster combat stats (regression for monster path)', () => {
      const monster: GameCardData = {
        id: 'm1', type: 'monster', name: 'Goblin', value: 5,
        attack: 15, tempAttackBoost: 10,
      };
      const state = makeState({ discardedCards: [] });

      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: monster });

      expect((result.state.discardedCards[0] as any).tempAttackBoost).toBe(0);
    });

    it('passes non-equipment, non-monster cards through unchanged', () => {
      const magic: GameCardData = {
        id: 'mg1', type: 'magic', name: 'Bolt', value: 0,
      };
      const state = makeState({ discardedCards: [] });

      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: magic });

      expect(result.state.discardedCards[0]).toMatchObject({
        id: 'mg1', type: 'magic', name: 'Bolt',
      });
    });
  });

  describe('Equipment break → graveyard-to-hand last words', () => {
    it('Iron-Shield-style break refills the shield before depositing in graveyard', () => {
      // Iron Shield: when destroyed, pulls a card from the graveyard to hand
      // and the broken shield itself enters the graveyard.
      const ironShield: GameCardData = {
        id: 'iron-1', type: 'shield', name: 'Iron Shield', value: 0,
        durability: 0, maxDurability: 3,
        armorMax: 2,
        // Combat state that should be wiped before landing in graveyard:
        armor: 0,
        armorBonusDamaged: 1,
        equipmentReviveUsed: true,
        onDestroyEffect: 'graveyard-to-hand',
      };

      // Seed graveyard with another card so the pick succeeds.
      const otherGrave: GameCardData = {
        id: 'other-1', type: 'magic', name: 'Some Spell', value: 0,
      };

      const state = makeState({
        equipmentSlot1: ironShield,
        discardedCards: [otherGrave],
        handCards: [],
      });

      const result = computeEquipmentBreakEffects(
        state,
        'equipmentSlot1',
        ironShield,
        createEmptyAmuletEffects(),
      );

      expect(result.destroyed).toBe(true);

      // After break: graveyard should contain the (refreshed) Iron Shield —
      // the picked-out card was removed and is now in hand.
      const graveAfter = result.patch.discardedCards as GameCardData[];
      const ironInGrave = graveAfter.find(c => c.id === 'iron-1');
      expect(ironInGrave).toBeDefined();
      expect(ironInGrave!.durability).toBe(3);
      expect(ironInGrave!.maxDurability).toBe(3);
      expect((ironInGrave as any).armor).toBeUndefined();
      expect((ironInGrave as any).armorBonusDamaged).toBeUndefined();
      expect((ironInGrave as any).equipmentReviveUsed).toBeUndefined();

      // Picked card landed in hand.
      const handAfter = result.patch.handCards as GameCardData[];
      expect(handAfter.find(c => c.id === 'other-1')).toBeDefined();
    });
  });
});
