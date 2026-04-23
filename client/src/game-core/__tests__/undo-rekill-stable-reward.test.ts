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

  /**
   * 跨刷新点的撤销 + 重打：
   *
   * 复现路径（这是用户最可能踩到的 bug）：
   * 1. 玩家有怪物 M 在 active row（cache 已生成 options A）。
   * 2. 玩家关掉网页 / 刷新（save 当前 state + 当前 undo stack）。
   * 3. 重新打开网页：
   *    - 旧 bug：hydrateGameState 用 createInitialGameState() 给 RNG 重新种子，
   *      并且不恢复 monsterRewardPreviewCache → live state cache 空、RNG 全新；
   *      但 undo stack 里的 snapshot **保留**了旧 RNG + 旧 cache。
   *    - 旧 bug 行为：玩家重新攻击 M → cache 空 → 用全新 RNG 现场生成 options B。
   *      撤销回去 → 旧 snapshot 的 options A 还在。重打 → 又拿到 A。
   *      "撤销前后奖励变了"。
   *
   * 修复后：
   *    - hydrateGameState 恢复 snapshot.rng 和 snapshot.monsterRewardPreviewCache
   *      → 刷新前后 cache 一致，RNG 一致 → 重打永远拿到 A。
   *
   * 这条测试模拟「序列化 → 反序列化 hydrate」一遍 GameState（走 PersistedGameState）
   * 看 cache 和 RNG 是不是真的活下来了。
   */
  it('cache + rng 必须经 PersistedGameState 持久化往返保留', async () => {
    const { serializeGameState } = await import('../persistence');
    const initial = createInitialGameState();
    const monster = makeMonster('mon-B');
    const live: GameState = {
      ...initial,
      activeCards: [monster, null, null, null] as (GameCardData | null)[],
      phase: 'playerInput',
    };
    const stateWithCache = reduce(live, { type: 'CACHE_MONSTER_REWARD_PREVIEW', monster }).state;
    const cachedTitles = stateWithCache.monsterRewardPreviewCache[monster.id]!.map(o => o.title);
    const rngBefore = { seed: stateWithCache.rng.seed, state: stateWithCache.rng.state };

    const persisted = serializeGameState(stateWithCache);
    expect(persisted.monsterRewardPreviewCache).toBeDefined();
    expect(persisted.monsterRewardPreviewCache![monster.id]).toBeDefined();
    expect(persisted.rng).toBeDefined();
    expect(persisted.rng).toEqual(rngBefore);

    const json = JSON.stringify(persisted);
    const parsed = JSON.parse(json) as typeof persisted;
    expect(parsed.monsterRewardPreviewCache?.[monster.id]).toBeDefined();
    expect((parsed.monsterRewardPreviewCache![monster.id] as any[]).map((o: any) => o.title)).toEqual(cachedTitles);
    expect(parsed.rng).toEqual(rngBefore);
  });
});
