import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import { initialCombatState } from '../constants';
import { getEternalRelic } from '@/lib/eternalRelics';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeBoltGraveyardCard(idSuffix: string, amplifyBonus = 0) {
  return {
    id: `gy-bolt-${idSuffix}`,
    type: 'magic' as const,
    name: '魔弹',
    value: 0,
    knightEffect: 'missile-bolt',
    magicType: 'instant',
    amplifyBonus,
  };
}

function makeStormCard(id = 'card-storm') {
  return {
    id,
    type: 'magic' as const,
    name: '魔弹风暴',
    value: 0,
    classCard: true,
    magicType: 'instant',
    knightEffect: 'missile-storm',
  };
}

function makeMonster(id: string, name = 'Goblin', hp = 10) {
  return {
    id,
    type: 'monster' as const,
    name,
    value: hp,
    hp,
    maxHp: hp,
    attack: 5,
  };
}

describe('魔弹风暴 — knightMissileStorm resolver', () => {
  it('fizzles when active row has no monsters', () => {
    const storm = makeStormCard();
    const state = makeState({
      activeCards: [null, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [makeBoltGraveyardCard('1'), makeBoltGraveyardCard('2')] as any,
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const sequenceFx = drained.sideEffects.find(s => s.event === 'combat:missileStormSequence');
    expect(sequenceFx).toBeUndefined();
    const noMonsterLog = drained.sideEffects.find(
      s => s.event === 'log:entry' && (s.payload as any).message?.includes('激活行没有怪物'),
    );
    expect(noMonsterLog).toBeDefined();
    const damageFx = drained.sideEffects.filter(s => s.event === 'combat:monsterDamaged');
    expect(damageFx).toHaveLength(0);
  });

  it('fizzles when graveyard has no 魔弹', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1');
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const sequenceFx = drained.sideEffects.find(s => s.event === 'combat:missileStormSequence');
    expect(sequenceFx).toBeUndefined();
    const noBoltLog = drained.sideEffects.find(
      s => s.event === 'log:entry' && (s.payload as any).message?.includes('坟场中没有'),
    );
    expect(noBoltLog).toBeDefined();
    const damageFx = drained.sideEffects.filter(s => s.event === 'combat:monsterDamaged');
    expect(damageFx).toHaveLength(0);
  });

  it('fires one bolt per 魔弹 in the graveyard with staggered delays', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1', 'Goblin', 100);
    const bolts = [
      makeBoltGraveyardCard('a'),
      makeBoltGraveyardCard('b'),
      makeBoltGraveyardCard('c'),
    ];
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const sequenceFx = drained.sideEffects.find(s => s.event === 'combat:missileStormSequence');
    expect(sequenceFx).toBeDefined();
    const shots = (sequenceFx?.payload as any).shots as Array<{ targetId: string; damage: number; delayMs: number }>;
    expect(shots).toHaveLength(3);
    expect(shots[0].delayMs).toBe(0);
    expect(shots[1].delayMs).toBe(180);
    expect(shots[2].delayMs).toBe(360);
    for (const shot of shots) {
      expect(shot.targetId).toBe('m1');
      expect(shot.damage).toBeGreaterThanOrEqual(1);
    }

    const damageFx = drained.sideEffects.filter(s => s.event === 'combat:monsterDamaged');
    expect(damageFx.length).toBeGreaterThanOrEqual(3);
  });

  it('does not consume the 魔弹 cards from the graveyard', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1', 'Goblin', 100);
    const bolts = [makeBoltGraveyardCard('a'), makeBoltGraveyardCard('b')];
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [...bolts, { id: 'other', type: 'magic', name: '其他卡', value: 0 } as any] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const remainingBolts = drained.state.discardedCards.filter(c => c.name === '魔弹');
    expect(remainingBolts).toHaveLength(2);
  });

  it('respects each bolt amplifyBonus when computing damage', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1', 'Goblin', 100);
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [
        makeBoltGraveyardCard('a', 0),
        makeBoltGraveyardCard('b', 2),
      ] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const sequenceFx = drained.sideEffects.find(s => s.event === 'combat:missileStormSequence');
    const shots = (sequenceFx?.payload as any).shots as Array<{ damage: number }>;
    // First bolt: 1 + 0 = 1; second bolt: 1 + 2 = 3 (assuming no spell-damage modifiers).
    expect(shots[0].damage).toBeGreaterThanOrEqual(1);
    expect(shots[1].damage).toBeGreaterThan(shots[0].damage);
  });

  it('applies missile-draw-1 relic per bolt fired', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1', 'Goblin', 100);
    const bolts = [makeBoltGraveyardCard('a'), makeBoltGraveyardCard('b')];
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      eternalRelics: [getEternalRelic('missile-draw-1')],
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const drawLogs = drained.sideEffects.filter(
      s => s.event === 'log:entry' && (s.payload as any).message?.includes('汲取弹幕'),
    );
    expect(drawLogs.length).toBe(2);
  });

  it('distributes shots across multiple monsters (random per bolt)', () => {
    const storm = makeStormCard();
    const m1 = makeMonster('m1', 'Goblin A', 100);
    const m2 = makeMonster('m2', 'Goblin B', 100);
    const m3 = makeMonster('m3', 'Goblin C', 100);
    const bolts = Array.from({ length: 12 }, (_, i) => makeBoltGraveyardCard(`b${i}`));
    const state = makeState({
      activeCards: [m1, m2, m3, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1', 'm2', 'm3'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const sequenceFx = drained.sideEffects.find(s => s.event === 'combat:missileStormSequence');
    const shots = (sequenceFx?.payload as any).shots as Array<{ targetId: string }>;
    expect(shots).toHaveLength(12);
    const uniqueTargets = new Set(shots.map(s => s.targetId));
    // With 12 random rolls across 3 targets, near-certainly hit ≥2 distinct monsters.
    expect(uniqueTargets.size).toBeGreaterThanOrEqual(2);
    for (const shot of shots) {
      expect(['m1', 'm2', 'm3']).toContain(shot.targetId);
    }
  });
});
