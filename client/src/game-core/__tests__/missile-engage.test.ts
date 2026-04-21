import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import { initialCombatState } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeBoltCard(id = 'card-bolt') {
  return {
    id,
    type: 'magic' as const,
    name: '魔弹',
    value: 0,
    classCard: true,
    magicType: 'instant' as const,
    knightEffect: 'missile-bolt',
  };
}

function makeStormCard(id = 'card-storm') {
  return {
    id,
    type: 'magic' as const,
    name: '魔弹风暴',
    value: 0,
    classCard: true,
    magicType: 'instant' as const,
    knightEffect: 'missile-storm',
  };
}

function makeBoltGraveyardCard(idSuffix: string) {
  return {
    id: `gy-bolt-${idSuffix}`,
    type: 'magic' as const,
    name: '魔弹',
    value: 0,
    knightEffect: 'missile-bolt',
    magicType: 'instant',
  };
}

function makeMonster(id: string, name = 'Goblin', hp = 10, layers = 3) {
  return {
    id,
    type: 'monster' as const,
    name,
    value: hp,
    hp,
    maxHp: hp,
    attack: 5,
    currentLayer: layers,
    hpLayers: layers,
    fury: layers,
  };
}

describe('魔弹 — 命中后激怒怪物 (engage on hit)', () => {
  // 注意：单目标伤害 magic 现在统一走 picker（即使只有 1 只怪物也不再自动命中），
  // 这是为了把 Hero Cell 也作为合法目标（自伤路径，触发血怒战符等）。
  // 详见 magic-self-target.test.ts。这里测的是"被点中后激怒"的逻辑没有退化。
  it('单怪物：玩家点选后被激怒', () => {
    const bolt = makeBoltCard();
    const monster = makeMonster('m1', 'Goblin', 10);
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [bolt] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: bolt.id }] as any);
    expect(afterPlay.state.pendingMagicAction).toBeTruthy();
    const drained = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm1' }] as any,
    );

    expect(drained.state.combatState.engagedMonsterIds).toContain('m1');
    const damageFx = drained.sideEffects.filter(s => s.event === 'combat:monsterDamaged');
    expect(damageFx.length).toBeGreaterThanOrEqual(1);
  });

  it('单怪物：已交战的怪物在被点中后不会被重复加入', () => {
    const bolt = makeBoltCard();
    const monster = makeMonster('m1', 'Goblin', 10);
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [bolt] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: bolt.id }] as any);
    const drained = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm1' }] as any,
    );

    const occurrences = drained.state.combatState.engagedMonsterIds.filter(id => id === 'm1').length;
    expect(occurrences).toBe(1);
  });

  it('多怪物时玩家点选目标：被点中的怪物会被激怒', () => {
    const bolt = makeBoltCard();
    const m1 = makeMonster('m1', 'Goblin A', 10);
    const m2 = makeMonster('m2', 'Goblin B', 10);
    const state = makeState({
      activeCards: [m1, m2, null, null, null] as any,
      handCards: [bolt] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: bolt.id }] as any);
    expect(afterPlay.state.pendingMagicAction).toBeTruthy();
    expect(afterPlay.state.combatState.engagedMonsterIds).toEqual([]);

    const afterSelect = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm2' }] as any,
    );
    expect(afterSelect.state.combatState.engagedMonsterIds).toContain('m2');
    expect(afterSelect.state.combatState.engagedMonsterIds).not.toContain('m1');
  });

  it('魔弹风暴：每发命中的怪物都会被激怒', () => {
    const storm = makeStormCard();
    const m1 = makeMonster('m1', 'Goblin A', 100);
    const m2 = makeMonster('m2', 'Goblin B', 100);
    const bolts = [
      makeBoltGraveyardCard('a'),
      makeBoltGraveyardCard('b'),
      makeBoltGraveyardCard('c'),
      makeBoltGraveyardCard('d'),
      makeBoltGraveyardCard('e'),
      makeBoltGraveyardCard('f'),
    ];
    const state = makeState({
      activeCards: [m1, m2, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);

    const boltFx = drained.sideEffects
      .filter(s => s.event === 'combat:missileStormBolt')
      .map(s => (s.payload as any).targetId as string);
    expect(boltFx.length).toBe(6);

    const uniqueTargets = new Set(boltFx);
    uniqueTargets.forEach(id => {
      expect(drained.state.combatState.engagedMonsterIds).toContain(id);
    });
  });
});
