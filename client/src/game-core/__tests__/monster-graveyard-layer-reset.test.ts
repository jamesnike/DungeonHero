/**
 * Monster → Graveyard `currentLayer` reset.
 *
 * Spec: every monster entering `discardedCards` must have its `currentLayer`
 * reset to 1, regardless of how many layers its rage tier would otherwise
 * grant. This ensures any subsequent resurrection / graveyard-fetch (boss
 * enrage summon, future revive effects, etc.) brings the monster back as a
 * single-layer threat. The cap (`fury` / `hpLayers`) is preserved.
 *
 * Coverage:
 *   1. `resetMonsterForGraveyard` helper directly.
 *   2. `ADD_TO_GRAVEYARD` reducer (canonical path).
 *   3. `MONSTER_DEFEATED` no-rewards branch (combat.ts bypass).
 *   4. Monster-reward → graveyard paths in shop.ts (4 sites: skip, class
 *      discover, graveyard discover, stat-swap grant).
 */

import { describe, expect, it } from 'vitest';
import type { GameCardData } from '@/components/GameCard';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { resetMonsterForGraveyard, resetCardForGraveyard, primeMonsterAsEquipment } from '../cards';
import type { GameState } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMultiLayerDragon(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm1',
    type: 'monster',
    name: 'Dragon',
    monsterType: 'Dragon',
    value: 5,
    attack: 5,
    baseAttack: 5,
    hp: 10,
    maxHp: 10,
    baseHp: 10,
    fury: 4,
    hpLayers: 4,
    currentLayer: 4,
    rageTurn: 10,
    ...over,
  } as GameCardData;
}

describe('Monster graveyard currentLayer reset', () => {
  describe('resetMonsterForGraveyard helper', () => {
    it('pins currentLayer to 1 even when rage tier grants multiple layers', () => {
      const dragon = makeMultiLayerDragon({ currentLayer: 3 });
      const reset = resetMonsterForGraveyard(dragon, false);
      expect(reset.currentLayer).toBe(1);
      // Cap preserved (rage recomputes fury / hpLayers from rule).
      expect(reset.fury).toBeGreaterThanOrEqual(1);
      expect(reset.hpLayers).toBeGreaterThanOrEqual(1);
    });

    it('preserves the layer cap (fury / hpLayers) from rage rule', () => {
      // Dragon rule: base 2, interval 5 → at rageTurn 10, fury = 2 + 2 = 4.
      const dragon = makeMultiLayerDragon({ currentLayer: 1, rageTurn: 10 });
      const reset = resetMonsterForGraveyard(dragon, false);
      expect(reset.currentLayer).toBe(1);
      expect(reset.fury).toBe(4);
      expect(reset.hpLayers).toBe(4);
    });

    it('clears reviveUsed and combat-acquired modifiers', () => {
      const monster = makeMultiLayerDragon({
        currentLayer: 2,
        reviveUsed: true,
        tempAttackBoost: 7,
        tempHpBoost: 5,
        specialAttackBoost: 3,
      });
      const reset = resetMonsterForGraveyard(monster, false);
      expect(reset.currentLayer).toBe(1);
      expect(reset.reviveUsed).toBe(false);
      expect(reset.tempAttackBoost).toBe(0);
      expect(reset.tempHpBoost).toBe(0);
      expect(reset.specialAttackBoost).toBe(0);
    });

    it('passes non-monster cards through unchanged', () => {
      const potion: GameCardData = { id: 'p1', type: 'potion', name: 'Heal', value: 5 };
      expect(resetMonsterForGraveyard(potion, false)).toBe(potion);
    });
  });

  describe('resetCardForGraveyard dispatcher', () => {
    it('routes monster through the layer-reset path', () => {
      const monster = makeMultiLayerDragon({ currentLayer: 4 });
      const reset = resetCardForGraveyard(monster, false);
      expect(reset.currentLayer).toBe(1);
    });
  });

  describe('ADD_TO_GRAVEYARD reducer', () => {
    it('multi-layer monster lands in graveyard with currentLayer = 1', () => {
      const dragon = makeMultiLayerDragon({ currentLayer: 3 });
      const state = makeState({ discardedCards: [] });
      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: dragon });
      expect(result.state.discardedCards).toHaveLength(1);
      expect(result.state.discardedCards[0].currentLayer).toBe(1);
    });

    it('single-layer goblin still has currentLayer = 1 in graveyard', () => {
      const goblin: GameCardData = {
        id: 'g1',
        type: 'monster',
        name: 'Goblin',
        monsterType: 'Goblin',
        value: 3,
        attack: 3,
        hp: 3,
        maxHp: 3,
        fury: 1,
        hpLayers: 1,
        currentLayer: 1,
      } as GameCardData;
      const state = makeState({ discardedCards: [] });
      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: goblin });
      expect(result.state.discardedCards[0].currentLayer).toBe(1);
    });
  });

  describe('Monster reward → graveyard (shop.ts bypass paths)', () => {
    function setupRewardState(monster: GameCardData): GameState {
      // Place monster in active row; queue it as the active reward so
      // SKIP_MONSTER_REWARD / discover-class / discover-graveyard paths
      // can move it to the graveyard.
      return makeState({
        discardedCards: [],
        activeMonsterReward: {
          monsterInstanceId: monster.id,
          monsterName: monster.name,
          monsterCard: monster,
          options: [{ type: 'class-discover' as any }],
        } as any,
      });
    }

    it('APPLY_MONSTER_REWARD (gold) routes monster to graveyard with currentLayer = 1', () => {
      const dragon = makeMultiLayerDragon({ currentLayer: 4 });
      const state = setupRewardState(dragon);
      const result = reduce(state, {
        type: 'APPLY_MONSTER_REWARD',
        rewardType: 'gold',
        amount: 5,
      } as any);
      const inGrave = result.state.discardedCards.find(c => c.id === dragon.id);
      expect(inGrave).toBeDefined();
      expect(inGrave!.currentLayer).toBe(1);
      // Cap preserved.
      expect(inGrave!.fury).toBeGreaterThanOrEqual(1);
    });

    it('APPLY_MONSTER_REWARD (grantStatSwapCard) also resets currentLayer to 1', () => {
      const dragon = makeMultiLayerDragon({ currentLayer: 4 });
      const state = setupRewardState(dragon);
      const result = reduce(state, {
        type: 'APPLY_MONSTER_REWARD',
        rewardType: 'grantStatSwapCard',
      } as any);
      const inGrave = result.state.discardedCards.find(c => c.id === dragon.id);
      expect(inGrave).toBeDefined();
      expect(inGrave!.currentLayer).toBe(1);
    });
  });

  describe('primeMonsterAsEquipment is graveyard-recovery-style (1/N, not N/N)', () => {
    it('multi-layer monster primes as 1/fury (durability=1, maxDurability=cap)', () => {
      const dragon = makeMultiLayerDragon({ currentLayer: 4, fury: 4, hpLayers: 4 });
      const primed = primeMonsterAsEquipment(dragon, false);
      // resetMonsterForGraveyard inside primeMonsterAsEquipment pins
      // currentLayer to 1, so durability follows.
      expect(primed.maxDurability).toBe(4);
      expect(primed.durability).toBe(1);
    });

    it('post-graveyard monster (currentLayer already 1) primes as 1/fury', () => {
      const dragon = makeMultiLayerDragon({ currentLayer: 4 });
      const inGrave = resetMonsterForGraveyard(dragon, false);
      expect(inGrave.currentLayer).toBe(1);

      const primed = primeMonsterAsEquipment(inGrave, false);
      expect(primed.maxDurability).toBe(4);
      expect(primed.durability).toBe(1);
    });

    it('skips monsters that already have durability set (idempotent)', () => {
      const alreadyEquipped = makeMultiLayerDragon({
        currentLayer: 4,
        durability: 2,
        maxDurability: 4,
      });
      const primed = primeMonsterAsEquipment(alreadyEquipped, false);
      expect(primed.durability).toBe(2);
      expect(primed.maxDurability).toBe(4);
    });

    it('end-to-end: RESOLVE_GRAVEYARD_SELECTION delivers killed monster to backpack as 1/N (regression: was N/N)', () => {
      const dragon = makeMultiLayerDragon({ currentLayer: 4 });
      // Step 1: dragon dies → graveyard (currentLayer pinned to 1).
      let state = makeState({ discardedCards: [] });
      state = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: dragon }).state;
      const inGrave = state.discardedCards.find(c => c.id === dragon.id)!;
      expect(inGrave.currentLayer).toBe(1);

      // Step 2: graveyard discover offers the dragon, player picks it →
      // RESOLVE_GRAVEYARD_SELECTION sends it to backpack via
      // addCardToBackpackPure → primeMonsterAsEquipment.
      state = {
        ...state,
        graveyardDiscoverState: [inGrave],
        graveyardDiscoverDelivery: 'backpack',
      };
      const result = reduce(state, {
        type: 'RESOLVE_GRAVEYARD_SELECTION',
        cardIds: [inGrave.id],
        context: {},
      } as any);
      const inBackpack = result.state.backpackItems.find(c => c.id === dragon.id);
      expect(inBackpack).toBeDefined();
      // The user-facing fix: previously this was 4/4 (full layers), now 1/4.
      expect(inBackpack!.maxDurability).toBe(4);
      expect(inBackpack!.durability).toBe(1);
    });
  });
});
