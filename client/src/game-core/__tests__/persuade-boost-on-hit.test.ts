import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import { initialCombatState } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

const blade = {
  id: 'pb-1',
  type: 'weapon' as const,
  name: '劝降之刃',
  value: 1,
  image: '',
  durability: 2,
  maxDurability: 2,
  persuadeBoostOnHit: 15,
};

const hammer = {
  id: 'ph-1',
  type: 'weapon' as const,
  name: '感化之锤',
  value: 2,
  image: '',
  durability: 3,
  maxDurability: 3,
  persuadeBoostOnHit: 20,
};

function freshCombat() {
  return {
    ...initialCombatState,
    currentTurn: 'hero' as const,
    heroAttacksRemaining: 1,
    heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false } as any,
  };
}

describe('persuadeBoostOnHit (劝降之刃 / 感化之锤)', () => {
  it('劝降之刃 hits a non-elite monster (survives) → +15%', () => {
    const monster = {
      id: 'm-1', type: 'monster' as const, name: 'Goblin', value: 0, image: '',
      hp: 10, maxHp: 10, attack: 3, currentLayer: 1, hpLayers: 1, fury: 1,
    };
    const state = makeState({
      equipmentSlot1: blade as any,
      activeCards: [monster as any, null, null, null, null],
      persuadeAmuletBonus: 0,
      combatState: freshCombat(),
    });
    const result = drain(state, [
      { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm-1' },
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(15);
  });

  it('劝降之刃 one-shot-kills a low-hp monster → still +15% (no longer gated on !monsterDefeated)', () => {
    const monster = {
      id: 'm-1', type: 'monster' as const, name: 'Slime', value: 0, image: '',
      hp: 1, maxHp: 1, attack: 0, currentLayer: 1, hpLayers: 1, fury: 1,
    };
    const state = makeState({
      equipmentSlot1: blade as any,
      activeCards: [monster as any, null, null, null, null],
      persuadeAmuletBonus: 0,
      combatState: freshCombat(),
    });
    const result = drain(state, [
      { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm-1' },
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(15);
  });

  it('劝降之刃 hits an elite monster → still +15% (no elite halving anymore)', () => {
    const monster = {
      id: 'm-1', type: 'monster' as const, name: 'Elite Orc', value: 0, image: '',
      hp: 20, maxHp: 20, attack: 5, currentLayer: 1, hpLayers: 1, fury: 1,
      monsterSpecial: 'auto-engage',
    };
    const state = makeState({
      equipmentSlot1: blade as any,
      activeCards: [monster as any, null, null, null, null],
      persuadeAmuletBonus: 0,
      combatState: freshCombat(),
    });
    const result = drain(state, [
      { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm-1' },
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(15);
  });

  it('感化之锤 hits a non-elite monster (survives) → +20%', () => {
    const monster = {
      id: 'm-1', type: 'monster' as const, name: 'Goblin', value: 0, image: '',
      hp: 10, maxHp: 10, attack: 3, currentLayer: 1, hpLayers: 1, fury: 1,
    };
    const state = makeState({
      equipmentSlot1: hammer as any,
      activeCards: [monster as any, null, null, null, null],
      persuadeAmuletBonus: 0,
      combatState: freshCombat(),
    });
    const result = drain(state, [
      { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm-1' },
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(20);
  });

  it('感化之锤 hits an elite monster → still +20% (no elite halving anymore)', () => {
    const monster = {
      id: 'm-1', type: 'monster' as const, name: 'Elite Orc', value: 0, image: '',
      hp: 20, maxHp: 20, attack: 5, currentLayer: 1, hpLayers: 1, fury: 1,
      monsterSpecial: 'auto-engage',
    };
    const state = makeState({
      equipmentSlot1: hammer as any,
      activeCards: [monster as any, null, null, null, null],
      persuadeAmuletBonus: 0,
      combatState: freshCombat(),
    });
    const result = drain(state, [
      { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm-1' },
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(20);
  });

  it('感化之锤 one-shot-kills a low-hp elite → still +20%', () => {
    const monster = {
      id: 'm-1', type: 'monster' as const, name: 'Frail Elite', value: 0, image: '',
      hp: 1, maxHp: 1, attack: 0, currentLayer: 1, hpLayers: 1, fury: 1,
      monsterSpecial: 'auto-engage',
    };
    const state = makeState({
      equipmentSlot1: hammer as any,
      activeCards: [monster as any, null, null, null, null],
      persuadeAmuletBonus: 0,
      combatState: freshCombat(),
    });
    const result = drain(state, [
      { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm-1' },
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(20);
  });

  it('starts from existing persuadeAmuletBonus and accumulates: 30 + 15 = 45', () => {
    const monster = {
      id: 'm-1', type: 'monster' as const, name: 'Beefy Goblin', value: 0, image: '',
      hp: 100, maxHp: 100, attack: 0, currentLayer: 1, hpLayers: 1, fury: 1,
    };
    const state = makeState({
      equipmentSlot1: blade as any,
      activeCards: [monster as any, null, null, null, null],
      persuadeAmuletBonus: 30,
      combatState: freshCombat(),
    });
    const result = drain(state, [
      { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm-1' },
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(45);
  });
});
