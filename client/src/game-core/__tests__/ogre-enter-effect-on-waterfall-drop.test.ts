/**
 * Ogre `enterEffect: 'auto-engage'` regression test.
 *
 * Bug history: when an Ogre dropped onto the active row via
 * APPLY_WATERFALL_DROP under phase='playerInput' (the normal in-game state
 * after the waterfall animation completes), the enqueued MONSTER_ENTERED_ROW
 * action got stranded in the queue because `MONSTER_ENTERED_ROW` was not
 * listed in `isInputContinuation`. The pipeline paused, the auto-engage
 * float and the BEGIN_COMBAT side effects never fired, and the player
 * perceived "Ogre's enter effect didn't trigger". Then on the next user
 * action (e.g. attacking the ogre) the drain finally processed the stale
 * MONSTER_ENTERED_ROW — making it look like the enter effect fired right
 * before the ogre died.
 *
 * The pre-existing `_tmp/ogre-engine.test.ts` did NOT catch this because it
 * used `createInitialGameState()` which sets `phase: 'idle'` — not in
 * INPUT_PHASES — so MONSTER_ENTERED_ROW drained without gating.
 *
 * Fix: add `MONSTER_ENTERED_ROW` to `isInputContinuation` in `pipeline.ts`.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../index';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('Ogre auto-engage fires on waterfall drop in playerInput phase', () => {
  it('emits combat:autoEngage for every row monster when Ogre drops via APPLY_WATERFALL_DROP under phase=playerInput', () => {
    const carryOver: GameCardData = {
      id: 'm-carry',
      type: 'monster',
      name: 'Goblin',
      monsterType: 'Goblin',
      value: 3,
      attack: 3,
      hp: 4,
      maxHp: 4,
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
    };
    const ogre: GameCardData = {
      id: 'm-ogre',
      type: 'monster',
      name: 'Ogre',
      monsterType: 'Ogre',
      value: 4,
      attack: 4,
      hp: 5,
      maxHp: 5,
      fury: 2,
      hpLayers: 2,
      currentLayer: 2,
      enterEffect: 'auto-engage',
    };
    const previewCard1: GameCardData = {
      id: 'p1',
      type: 'potion',
      name: 'Health Potion',
      value: 2,
    };

    const state = makeState({
      // Real in-game phase when waterfall animation finishes — this is what
      // the previous _tmp/ogre-engine.test.ts missed by using 'idle'.
      phase: 'playerInput',
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

    const autoEngageMonsterIds: string[] = [];
    engine.on('combat:autoEngage', ({ monsterId }) => {
      autoEngageMonsterIds.push(monsterId);
      const st = engine.getState();
      const monster = st.activeCards.find(c => c?.id === monsterId);
      if (monster && !st.combatState.engagedMonsterIds.includes(monsterId)) {
        engine.dispatch({
          type: 'BEGIN_COMBAT',
          monster: monster as GameCardData,
          initiator: 'hero',
        });
      }
    });

    // Simulate `useMonsterSkillFloats`: release floats immediately so the
    // HARD_PAUSE doesn't strand follow-ups.
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    // Both monsters in the row should have received an autoEngage event
    // synchronously — NOT deferred to "the next user action".
    expect(autoEngageMonsterIds).toContain('m-carry');
    expect(autoEngageMonsterIds).toContain('m-ogre');

    // And both should be engaged in combat (BEGIN_COMBAT processed).
    expect(engine.getState().combatState.engagedMonsterIds).toContain('m-carry');
    expect(engine.getState().combatState.engagedMonsterIds).toContain('m-ogre');

    // Sanity: the queue must NOT have a leftover MONSTER_ENTERED_ROW.
    expect(
      engine.getState().actionQueue.some(a => a.type === 'MONSTER_ENTERED_ROW'),
    ).toBe(false);
  });
});
