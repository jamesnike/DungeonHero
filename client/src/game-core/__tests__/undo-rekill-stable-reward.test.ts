/**
 * Repro: kill monster, pick a reward, undo (single click), then re-kill —
 * the reward options should be the SAME on the re-kill.
 *
 * User-reported flow:
 *   1. attack monster (handleWeaponToMonster pushes S_attack)
 *   2. monster dies, reward modal shows options A
 *   3. user picks an option (handleMonsterRewardSelection pushes S_reward,
 *      then APPLY_MONSTER_REWARD applies the reward)
 *   4. user clicks undo → pop S_reward
 *   5. (somehow) attacks the monster again
 *   6. Expect: same reward options A. Bug: different options B.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../index';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { GameState } from '../types';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { reduce } from '../reducer';

function makeMonster(id: string, hp = 3): GameCardData {
  return {
    id,
    type: 'monster',
    name: 'Test Monster',
    monsterType: 'Slime',
    value: 5,
    attack: 2,
    hp,
    maxHp: hp,
    baseAttack: 2,
    baseHp: hp,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
  } as GameCardData;
}

function makeWeapon(): GameCardData {
  return {
    id: 'test-sword',
    type: 'weapon',
    name: 'Sword',
    value: 0,
    attack: 99,
    durability: 5,
    maxDurability: 5,
  } as GameCardData;
}

describe('Undo + re-kill: full flow with reward-selection snapshot', () => {
  it('after picking reward + undo + re-kill, reward options are unchanged', async () => {
    const engine = new GameEngine();
    const monster = makeMonster('mon-A');

    const initial = createInitialGameState();
    let state: GameState = {
      ...initial,
      activeCards: [monster, null, null, null] as (GameCardData | null)[],
      equipmentSlot1: makeWeapon() as any,
      equipmentSlot2: null,
      combatState: { ...initialCombatState, currentTurn: 'hero', engagedMonsterIds: [monster.id] },
      phase: 'playerInput',
    };
    state = reduce(state, { type: 'CACHE_MONSTER_REWARD_PREVIEW', monster }).state;
    const cachedOptions = state.monsterRewardPreviewCache[monster.id];
    expect(cachedOptions).toBeDefined();

    (engine as any)._state = state;

    // Step 1: handleWeaponToMonster pushUndoSnapshot
    engine.pushUndoCheckpoint();

    // Step 2: monster dies via DEAL_DAMAGE_TO_MONSTER → MONSTER_DEFEATED
    engine.dispatch({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: 99, source: 'weapon' } as GameAction);
    const firstReward = engine.getState().activeMonsterReward;
    expect(firstReward).toBeTruthy();
    const firstOptions = firstReward!.options;
    expect(firstOptions.map(o => o.title)).toEqual(cachedOptions!.map(o => o.title));

    // Step 3: user picks an option — handleMonsterRewardSelection pushes S_reward
    await Promise.resolve();
    engine.pushUndoCheckpoint();
    const pickedOption = firstReward!.options[0];
    const eff = pickedOption.effect as any;
    engine.dispatch({ type: 'APPLY_MONSTER_REWARD', rewardType: eff.type, amount: eff.amount } as GameAction);

    // Sanity: monster removed from activeCards, reward cleared
    const stateAfterApply = engine.getState();
    expect(stateAfterApply.activeMonsterReward).toBeNull();

    // Step 4: user clicks undo → pop S_reward (modal showing A, monster
    // defeatProcessed=true on row, cache empty)
    const popped = engine.popUndoCheckpoint();
    expect(popped).toBeTruthy();
    const stateAfterUndo = engine.getState();
    expect(stateAfterUndo.activeMonsterReward).toBeTruthy();
    expect(stateAfterUndo.activeMonsterReward!.options.map(o => o.title)).toEqual(firstOptions.map(o => o.title));

    // Cache for this monster: gone? Or restored?
    const cacheAfterUndo = stateAfterUndo.monsterRewardPreviewCache[monster.id];
    console.log('cache after single undo:', cacheAfterUndo);

    // Now imagine the user undoes AGAIN to get back to alive monster
    await Promise.resolve();
    const popped2 = engine.popUndoCheckpoint();
    expect(popped2).toBeTruthy();
    const stateAfterDoubleUndo = engine.getState();
    expect(stateAfterDoubleUndo.activeMonsterReward).toBeNull();
    expect(stateAfterDoubleUndo.activeCards[0]?.id).toBe(monster.id);
    expect(stateAfterDoubleUndo.activeCards[0]?.defeatProcessed).toBeFalsy();
    // Cache should be restored
    const cacheAfterDoubleUndo = stateAfterDoubleUndo.monsterRewardPreviewCache[monster.id];
    expect(cacheAfterDoubleUndo).toBeDefined();
    expect(cacheAfterDoubleUndo!.map(o => o.title)).toEqual(cachedOptions!.map(o => o.title));

    // Re-kill
    await Promise.resolve();
    engine.pushUndoCheckpoint();
    engine.dispatch({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: 99, source: 'weapon' } as GameAction);
    const secondReward = engine.getState().activeMonsterReward;
    expect(secondReward).toBeTruthy();
    expect(secondReward!.options.map(o => o.title)).toEqual(firstOptions.map(o => o.title));
  });
});
