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

describe('绝响之符 (lastwords-monster-debuff amulet)', () => {
  describe('computeEquipmentBreakEffects', () => {
    it('debuffs all active row monsters by 1 when an equipment with last words breaks', () => {
      const m1 = makeMonster('m1', 5);
      const m2 = makeMonster('m2', 3);
      const activeCards: ActiveRowSlots = [m1, null, m2, null, null];
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'TestBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyPermanentDamage: 1,
      } as GameCardData;
      const state = makeState({ activeCards, equipmentSlot1: weapon as any });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        hasLastWordsMonsterDebuff: true,
      };

      const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);

      const updatedActive = (result.patch.activeCards ?? activeCards) as ActiveRowSlots;
      expect(updatedActive[0]?.attack).toBe(4);
      expect(updatedActive[2]?.attack).toBe(2);
      expect(result.sideEffects.some(
        e => e.event === 'log:entry' && /绝响之符/.test((e.payload as { message?: string })?.message ?? ''),
      )).toBe(true);
    });

    it('does not debuff when amulet is not equipped', () => {
      const m1 = makeMonster('m1', 5);
      const activeCards: ActiveRowSlots = [m1, null, null, null, null];
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'TestBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyPermanentDamage: 1,
      } as GameCardData;
      const state = makeState({ activeCards, equipmentSlot1: weapon as any });

      const result = computeEquipmentBreakEffects(
        state,
        'equipmentSlot1',
        weapon,
        createEmptyAmuletEffects(),
      );

      expect(result.patch.activeCards).toBeUndefined();
    });

    it('does not debuff when the broken equipment has no last words', () => {
      const m1 = makeMonster('m1', 5);
      const activeCards: ActiveRowSlots = [m1, null, null, null, null];
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'PlainBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
      } as GameCardData;
      const state = makeState({ activeCards, equipmentSlot1: weapon as any });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        hasLastWordsMonsterDebuff: true,
      };

      const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);

      expect(result.patch.activeCards).toBeUndefined();
    });

    it('clamps monster attack at 0 (does not go negative)', () => {
      const zeroAtkMonster = makeMonster('m1', 0);
      const activeCards: ActiveRowSlots = [zeroAtkMonster, null, null, null, null];
      const weapon: GameCardData = {
        id: 'w1',
        type: 'weapon',
        name: 'TestBlade',
        value: 2,
        durability: 0,
        maxDurability: 1,
        onDestroyPermanentDamage: 1,
      } as GameCardData;
      const state = makeState({ activeCards, equipmentSlot1: weapon as any });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        hasLastWordsMonsterDebuff: true,
      };

      const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', weapon, amuletEffects);
      const updatedActive = (result.patch.activeCards ?? activeCards) as ActiveRowSlots;
      expect(updatedActive[0]?.attack).toBe(0);
    });
  });

  describe('computeEquipmentDisplacementLastWords', () => {
    it('debuffs all active row monsters when displaced equipment fires last words', () => {
      const m1 = makeMonster('m1', 7);
      const m2 = makeMonster('m2', 4);
      const activeCards: ActiveRowSlots = [m1, m2, null, null, null];
      const displacedShield: GameCardData = {
        id: 's1',
        type: 'shield',
        name: 'TestShield',
        value: 0,
        onDestroyPermanentShield: 1,
      } as GameCardData;
      const state = makeState({ activeCards });
      const amuletEffects = {
        ...createEmptyAmuletEffects(),
        hasLastWordsMonsterDebuff: true,
      };

      const result = computeEquipmentDisplacementLastWords(
        state,
        'equipmentSlot2',
        displacedShield,
        amuletEffects,
      );

      const updatedActive = (result.patch.activeCards ?? activeCards) as ActiveRowSlots;
      expect(updatedActive[0]?.attack).toBe(6);
      expect(updatedActive[1]?.attack).toBe(3);
    });
  });

  describe('computeAmuletEffects integration', () => {
    it('sets hasLastWordsMonsterDebuff when a `lastwords-monster-debuff` amulet is equipped', () => {
      const amulet: GameCardData = {
        id: 'a1',
        type: 'amulet',
        name: '绝响之符',
        value: 1,
        amuletEffect: 'lastwords-monster-debuff',
      };
      const effects = computeAmuletEffects([amulet]);
      expect(effects.hasLastWordsMonsterDebuff).toBe(true);
    });

    it('hasLastWordsMonsterDebuff is false by default', () => {
      const effects = computeAmuletEffects([]);
      expect(effects.hasLastWordsMonsterDebuff).toBe(false);
    });
  });
});
