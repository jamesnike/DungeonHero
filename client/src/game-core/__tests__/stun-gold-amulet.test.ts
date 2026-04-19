import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

const STUN_GOLD_AMULET: GameCardData = {
  id: 'amu-stun-gold',
  type: 'amulet',
  name: '雷金护符',
  value: 1,
  image: '',
  amuletEffect: 'stun-gold',
} as any;

describe('雷金护符 (amulet: stun-gold)', () => {
  it('grants +10 gold on a successful weapon stun', () => {
    const weapon = {
      id: 'w1',
      type: 'weapon' as const,
      name: 'Stunhammer',
      value: 5,
      image: '',
      durability: 3,
      maxDurability: 3,
      weaponStunChance: 100,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1',
      type: 'monster' as const,
      name: 'Goblin',
      value: 5,
      image: '',
      hp: 20,
      maxHp: 20,
      attack: 3,
    };
    const state = makeState({
      gold: 0,
      stunCap: 100,
      amuletSlots: [STUN_GOLD_AMULET, null, null] as any,
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
    });

    const result = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);

    const stunnedMonster = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(stunnedMonster?.isStunned).toBe(true);
    expect(result.state.gold).toBe(10);
  });

  it('does NOT grant gold without the amulet equipped', () => {
    const weapon = {
      id: 'w1',
      type: 'weapon' as const,
      name: 'Stunhammer',
      value: 5,
      image: '',
      durability: 3,
      maxDurability: 3,
      weaponStunChance: 100,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1',
      type: 'monster' as const,
      name: 'Goblin',
      value: 5,
      image: '',
      hp: 20,
      maxHp: 20,
      attack: 3,
    };
    const state = makeState({
      gold: 0,
      stunCap: 100,
      amuletSlots: [null, null, null] as any,
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
    });

    const result = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);

    const stunnedMonster = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(stunnedMonster?.isStunned).toBe(true);
    expect(result.state.gold).toBe(0);
  });

  it('does NOT grant gold when stun roll fails (weaponStunChance 0)', () => {
    const weapon = {
      id: 'w1',
      type: 'weapon' as const,
      name: 'Plain Sword',
      value: 5,
      image: '',
      durability: 3,
      maxDurability: 3,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1',
      type: 'monster' as const,
      name: 'Goblin',
      value: 5,
      image: '',
      hp: 20,
      maxHp: 20,
      attack: 3,
    };
    const state = makeState({
      gold: 0,
      stunCap: 100,
      amuletSlots: [STUN_GOLD_AMULET, null, null] as any,
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
    });

    const result = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);

    const stunnedMonster = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(stunnedMonster?.isStunned).toBeFalsy();
    expect(result.state.gold).toBe(0);
  });

  it('reducer side effect emits an "amulet" log entry on successful stun', () => {
    const weapon = {
      id: 'w1',
      type: 'weapon' as const,
      name: 'Stunhammer',
      value: 5,
      image: '',
      durability: 3,
      maxDurability: 3,
      weaponStunChance: 100,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1',
      type: 'monster' as const,
      name: 'Goblin',
      value: 5,
      image: '',
      hp: 20,
      maxHp: 20,
      attack: 3,
    };
    const state = makeState({
      gold: 0,
      stunCap: 100,
      amuletSlots: [STUN_GOLD_AMULET, null, null] as any,
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    } as any);

    const amuletLog = result.sideEffects.find(
      e =>
        e.event === 'log:entry' &&
        (e.payload as any)?.type === 'amulet' &&
        String((e.payload as any)?.message ?? '').includes('雷金护符'),
    );
    expect(amuletLog).toBeDefined();

    const goldAction = result.enqueuedActions.find(
      (a: any) => a.type === 'MODIFY_GOLD' && a.source === 'amulet-stun-gold',
    );
    expect(goldAction).toBeDefined();
    expect((goldAction as any)?.delta).toBe(10);
  });
});
