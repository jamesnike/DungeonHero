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

const STUN_GOLD_AMULET_2: GameCardData = {
  ...STUN_GOLD_AMULET,
  id: 'amu-stun-gold-2',
} as any;

describe('雷金护符 (amulet: stun-gold) — new design: gold + remove stun', () => {
  it('grants +10 gold AND immediately removes the stun on a successful weapon stun', () => {
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
      handCards: [] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
    });

    const result = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);

    const monsterAfter = result.state.activeCards.find(c => c?.id === 'm1') as any;
    // Stun was applied then immediately removed by 雷金护符.
    expect(monsterAfter?.isStunned).toBeFalsy();
    expect(result.state.gold).toBe(10);
    // No backpack draw any more.
    expect((result.state.handCards as any[]).length).toBe(0);
  });

  it('does NOT grant gold without the amulet equipped (stun stays)', () => {
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

    const monsterAfter = result.state.activeCards.find(c => c?.id === 'm1') as any;
    // Without the amulet, stun stays.
    expect(monsterAfter?.isStunned).toBe(true);
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

    const monsterAfter = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(monsterAfter?.isStunned).toBeFalsy();
    expect(result.state.gold).toBe(0);
  });

  it('reducer side effect emits an "amulet" log entry, +10 MODIFY_GOLD, and UPDATE_MONSTER_CARD un-stun (no DRAW_CARDS)', () => {
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

    const unstunAction = result.enqueuedActions.find(
      (a: any) =>
        a.type === 'UPDATE_MONSTER_CARD' &&
        a.monsterId === 'm1' &&
        (a.patch as any)?.isStunned === false,
    );
    expect(unstunAction).toBeDefined();

    // No more DRAW_CARDS from 雷金护符.
    const drawAction = result.enqueuedActions.find(
      (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
    );
    expect(drawAction).toBeUndefined();

    // Non-blocking UI animation: emits combat:stunReleasedByGoldAmulet so
    // useStunReleasedGoldFx can play the gold-burst float on the monster cell.
    const fxEvent = result.sideEffects.find(
      e => e.event === 'combat:stunReleasedByGoldAmulet',
    );
    expect(fxEvent).toBeDefined();
    expect((fxEvent as any)?.payload?.monsterId).toBe('m1');
    expect((fxEvent as any)?.payload?.goldDelta).toBe(10);
  });

  it('emits one stunReleasedByGoldAmulet event per stunned monster (multi-monster fx fan-out)', () => {
    const m1 = {
      id: 'm1', type: 'monster' as const, name: 'GoblinA',
      value: 1, image: '', hp: 5, maxHp: 5, attack: 1,
    };
    const m2 = {
      id: 'm2', type: 'monster' as const, name: 'GoblinB',
      value: 1, image: '', hp: 5, maxHp: 5, attack: 1,
    };
    const baseState = makeState({
      gold: 0,
      amuletSlots: [STUN_GOLD_AMULET, null, null] as any,
      activeCards: [m1, m2, null, null, null] as any,
      handCards: [] as any,
    });

    const ctxBase = {
      flowId: 'stun-domain',
      monsters: [{ id: 'm1', name: 'GoblinA' }, { id: 'm2', name: 'GoblinB' }],
      stunPct: 100,
      threshold: 20,
      stunResults: [],
    };

    const r1 = reduce(baseState, {
      type: 'RESOLVE_DICE',
      outcomeId: 'stun',
      context: { ...ctxBase, monsterIndex: 0 },
    } as any);
    const fx1 = r1.sideEffects.filter(e => e.event === 'combat:stunReleasedByGoldAmulet');
    expect(fx1.length).toBe(1);
    expect((fx1[0] as any).payload.monsterId).toBe('m1');
    expect((fx1[0] as any).payload.goldDelta).toBe(10);

    const r2 = reduce(r1.state, {
      type: 'RESOLVE_DICE',
      outcomeId: 'stun',
      context: { ...ctxBase, monsterIndex: 1 },
    } as any);
    const fx2 = r2.sideEffects.filter(e => e.event === 'combat:stunReleasedByGoldAmulet');
    expect(fx2.length).toBe(1);
    expect((fx2[0] as any).payload.monsterId).toBe('m2');
    expect((fx2[0] as any).payload.goldDelta).toBe(10);
  });

  it('stacked amulets: 2 amulets → single fx event with goldDelta=20', () => {
    const weapon = {
      id: 'w1', type: 'weapon' as const, name: 'Stunhammer',
      value: 5, image: '', durability: 3, maxDurability: 3,
      weaponStunChance: 100, fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin',
      value: 5, image: '', hp: 20, maxHp: 20, attack: 3,
    };
    const state = makeState({
      gold: 0,
      stunCap: 100,
      amuletSlots: [STUN_GOLD_AMULET, STUN_GOLD_AMULET_2, null] as any,
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

    const fx = result.sideEffects.filter(e => e.event === 'combat:stunReleasedByGoldAmulet');
    expect(fx.length).toBe(1);
    expect((fx[0] as any).payload.goldDelta).toBe(20);
    expect((fx[0] as any).payload.monsterId).toBe('m1');
  });

  it('stacks linearly: 2 amulets → +20 gold per stun (still removes stun once)', () => {
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
      amuletSlots: [STUN_GOLD_AMULET, STUN_GOLD_AMULET_2, null] as any,
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      handCards: [] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
    });

    const result = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);

    expect(result.state.gold).toBe(20);
    const monsterAfter = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(monsterAfter?.isStunned).toBeFalsy();
  });

  it('multi-monster stun (震慑领域 simulation): each stun triggers the amulet independently', () => {
    // Simulate the per-monster RESOLVE_DICE flow used by 震慑领域.
    // Each monster's 'stun' outcome dispatches RESOLVE_DICE with flowId='stun-domain'.
    // We verify two stuns -> +10 gold each (2 amulets each? no — 1 amulet * 2 stuns = +20).
    const m1 = {
      id: 'm1', type: 'monster' as const, name: 'GoblinA',
      value: 1, image: '', hp: 5, maxHp: 5, attack: 1,
    };
    const m2 = {
      id: 'm2', type: 'monster' as const, name: 'GoblinB',
      value: 1, image: '', hp: 5, maxHp: 5, attack: 1,
    };

    const baseState = makeState({
      gold: 0,
      amuletSlots: [STUN_GOLD_AMULET, null, null] as any,
      activeCards: [m1, m2, null, null, null] as any,
      handCards: [] as any,
    });

    // Manually simulate two stun outcomes (one per monster) by directly enqueuing
    // the un-stun-after-gold pattern — driven through RESOLVE_DICE 'stun-domain'.
    const ctxBase = {
      flowId: 'stun-domain',
      monsters: [{ id: 'm1', name: 'GoblinA' }, { id: 'm2', name: 'GoblinB' }],
      stunPct: 100,
      threshold: 20,
      stunResults: [],
    };

    // Stun m1
    const r1 = reduce(baseState, {
      type: 'RESOLVE_DICE',
      outcomeId: 'stun',
      context: { ...ctxBase, monsterIndex: 0 },
    } as any);

    const goldM1 = r1.enqueuedActions.filter(
      (a: any) => a.type === 'MODIFY_GOLD' && a.source === 'amulet-stun-gold',
    );
    const unstunM1 = r1.enqueuedActions.filter(
      (a: any) => a.type === 'UPDATE_MONSTER_CARD' && a.monsterId === 'm1'
        && (a.patch as any)?.isStunned === false,
    );
    expect(goldM1.length).toBe(1);
    expect((goldM1[0] as any).delta).toBe(10);
    expect(unstunM1.length).toBe(1);

    // Stun m2 from r1.state (so gold accumulates)
    const r2 = reduce(r1.state, {
      type: 'RESOLVE_DICE',
      outcomeId: 'stun',
      context: { ...ctxBase, monsterIndex: 1 },
    } as any);

    const goldM2 = r2.enqueuedActions.filter(
      (a: any) => a.type === 'MODIFY_GOLD' && a.source === 'amulet-stun-gold',
    );
    const unstunM2 = r2.enqueuedActions.filter(
      (a: any) => a.type === 'UPDATE_MONSTER_CARD' && a.monsterId === 'm2'
        && (a.patch as any)?.isStunned === false,
    );
    expect(goldM2.length).toBe(1);
    expect((goldM2[0] as any).delta).toBe(10);
    expect(unstunM2.length).toBe(1);
  });
});
