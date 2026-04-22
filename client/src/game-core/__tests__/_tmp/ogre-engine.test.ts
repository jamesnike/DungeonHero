import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../index';
import { createInitialGameState } from '../../state';
import { createRng } from '../../rng';
import type { GameState } from '../../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('Ogre auto-waterfall via engine + simulated React listener', () => {
  it('dispatches BEGIN_COMBAT for each combat:autoEngage event', () => {
    const carryOver: GameCardData = {
      id: 'm-carry', type: 'monster', name: 'Goblin', monsterType: 'Goblin',
      value: 3, attack: 3, hp: 4, maxHp: 4, fury: 1, hpLayers: 1, currentLayer: 1,
    };
    const ogre: GameCardData = {
      id: 'm-ogre', type: 'monster', name: 'Ogre', monsterType: 'Ogre',
      value: 4, attack: 4, hp: 5, maxHp: 5, fury: 2, hpLayers: 2, currentLayer: 2,
      enterEffect: 'auto-engage',
    };
    const previewCard1: GameCardData = {
      id: 'p1', type: 'potion', name: 'Health Potion', value: 2,
    };
    const state = makeState({
      activeCards: [carryOver, null, null, null, null],
      previewCards: [null, ogre, previewCard1, null, null],
      pendingWaterfallPlan: {
        dropAssignments: [
          { previewIndex: 1, card: ogre, slotIndex: 1 },
          { previewIndex: 2, card: previewCard1, slotIndex: 2 },
        ],
        resolvedDropCards: [ogre, previewCard1],
        dropPreviewIndices: [1, 2],
        dropTargetSlots: [1, 2],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const engine = new GameEngine(state);

    // Simulate the React listener from useCombatActions.ts:
    engine.on('combat:autoEngage', ({ monsterId }) => {
      const st = engine.getState();
      const monster = st.activeCards.find(c => c?.id === monsterId);
      if (monster && !st.combatState.engagedMonsterIds.includes(monsterId)) {
        engine.dispatch({ type: 'BEGIN_COMBAT', monster: monster as GameCardData, initiator: 'hero' });
      }
    });

    // Simulate the React `useMonsterSkillFloats` hook: every time a float is
    // pushed, immediately release it so the engine's HARD_PAUSE on
    // `awaitingSkillFloat` doesn't strand subsequent dispatches (e.g. the
    // BEGIN_COMBAT for the ogre after its `enter:auto-engage` float).
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    console.log('engagedMonsterIds after:', engine.getState().combatState.engagedMonsterIds);
    expect(engine.getState().combatState.engagedMonsterIds).toContain('m-carry');
    expect(engine.getState().combatState.engagedMonsterIds).toContain('m-ogre');
  });
});
