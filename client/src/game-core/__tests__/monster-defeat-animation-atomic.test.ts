/**
 * 怪物死亡 → 奖励队列同步标记动画 ID（消除 mobile 端弹窗闪烁的引擎不变量）
 *
 * 历史 bug：
 *   `MonsterRewardModal` 的 `open` 一度同时门控两件事：
 *     1) `state.activeMonsterReward != null`（来自 `useSyncExternalStore`）
 *     2) `monsterDefeatStates[id]`（React `useState`，由
 *        `useGameEvent('combat:monsterDefeated')` 监听器写入）
 *   两个写入虽然都发生在同一次 `engine.dispatch(...)` 内（reducer 写 (1)，
 *   side-effect 触发 (2)），但 React 18 的批处理在 mobile 上偶尔不重合：
 *   一帧里 (1) 已 truthy 而 (2) 还没翻 false → Radix Dialog 一闪而过。
 *
 * 修复（"Engine Atomic"）：在 reducer 内 push `combat:monsterDefeated` 的
 * 同时把怪物 id 写进 `state.monsterDefeatAnimationIds`。这个字段会和
 * `activeMonsterReward` 一起出现在同一份 `useSyncExternalStore` 快照里 —
 * RewardContainer 改用它做门控，物理上没有"reward 已 set 但门控还没 set"的
 * 中间帧。
 *
 * 这个测试覆盖的是引擎层不变量（不依赖 React 渲染）：
 *   只要某次 reduce 让 `activeMonsterReward` 从 null 变非 null，那同一份
 *   `state.monsterDefeatAnimationIds` 就必须包含对应怪物的 id。
 *
 * 相关规则 / 提示：
 *   - 这是 mobile 端 RewardContainer 闪烁的根因修复
 *   - 多怪同时死（坟火新星）下：每只怪都被独立 push 进 ids
 *   - END_MONSTER_DEFEAT_ANIMATION 由 React 端的 setTimeout 在
 *     DEFEAT_ANIMATION_DURATION 之后 dispatch
 */

import { describe, expect, it } from 'vitest';
import type { GameCardData } from '@/components/GameCard';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(suffix: string, hp = 1): GameCardData {
  return {
    id: `monster-${suffix}`,
    type: 'monster',
    name: `怪物-${suffix}`,
    monsterType: 'Skeleton',
    value: 2,
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

describe('怪物死亡动画原子标记', () => {
  it('初始 state 的 monsterDefeatAnimationIds 是空数组', () => {
    const s = makeState();
    expect(s.monsterDefeatAnimationIds).toEqual([]);
  });

  it('MONSTER_DEFEATED 在 patch 同步设置 activeMonsterReward 和 monsterDefeatAnimationIds', () => {
    const m = makeMonster('a', 0);
    const state = makeState({
      activeCards: [m, null, null, null] as GameState['activeCards'],
      combatState: { ...initialCombatState, engagedMonsterIds: [m.id] },
    });

    const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: m.id });

    expect(result.state.activeMonsterReward).not.toBeNull();
    expect(result.state.activeMonsterReward!.monsterInstanceId).toBe(m.id);
    expect(result.state.monsterDefeatAnimationIds).toContain(m.id);
    expect(
      result.sideEffects.some(e => e.event === 'combat:monsterDefeated' && (e.payload as any).monsterId === m.id),
    ).toBe(true);
  });

  it('多个怪物同步死亡（drain 全程）后，每个 id 都进 monsterDefeatAnimationIds', () => {
    const a = makeMonster('a', 0);
    const b = makeMonster('b', 0);
    const c = makeMonster('c', 0);
    const state = makeState({
      activeCards: [a, b, c, null] as GameState['activeCards'],
      combatState: { ...initialCombatState, engagedMonsterIds: [a.id, b.id, c.id] },
    });

    const actions: GameAction[] = [
      { type: 'MONSTER_DEFEATED', monsterId: a.id },
      { type: 'MONSTER_DEFEATED', monsterId: b.id },
      { type: 'MONSTER_DEFEATED', monsterId: c.id },
    ];
    const drained = drain(state, actions);

    expect(drained.state.monsterDefeatAnimationIds).toContain(a.id);
    expect(drained.state.monsterDefeatAnimationIds).toContain(b.id);
    expect(drained.state.monsterDefeatAnimationIds).toContain(c.id);
    expect(drained.state.activeMonsterReward!.monsterInstanceId).toBe(a.id);
    expect(drained.state.monsterRewardQueue.length).toBe(2);
  });

  it('END_MONSTER_DEFEAT_ANIMATION 仅移除指定 id，其它 id 保留', () => {
    const a = makeMonster('a', 0);
    const b = makeMonster('b', 0);
    const state = makeState({
      monsterDefeatAnimationIds: [a.id, b.id],
    });

    const result = reduce(state, { type: 'END_MONSTER_DEFEAT_ANIMATION', monsterId: a.id });
    expect(result.state.monsterDefeatAnimationIds).toEqual([b.id]);
  });

  it('END_MONSTER_DEFEAT_ANIMATION 对不存在的 id 是 no-op（幂等）', () => {
    const a = makeMonster('a', 0);
    const state = makeState({ monsterDefeatAnimationIds: [a.id] });
    const result = reduce(state, { type: 'END_MONSTER_DEFEAT_ANIMATION', monsterId: 'nope' });
    expect(result.state.monsterDefeatAnimationIds).toBe(state.monsterDefeatAnimationIds);
  });

  it('原子不变量：reducer 完成后，只要 activeMonsterReward 非空，对应 id 就必在 monsterDefeatAnimationIds 中', () => {
    // 这是 RewardContainer 门控规则的关键不变量。如果哪天有人在某条
    // 路径上设了 activeMonsterReward 却忘了 push id，这里会失败 —
    // 跟着 grep `activeMonsterReward =` 找到漏 markMonsterDefeatAnimation
    // 的位置补上。
    const m = makeMonster('a', 0);
    const state = makeState({
      activeCards: [m, null, null, null] as GameState['activeCards'],
      combatState: { ...initialCombatState, engagedMonsterIds: [m.id] },
    });
    const drained = drain(state, [{ type: 'MONSTER_DEFEATED', monsterId: m.id }]);
    if (drained.state.activeMonsterReward) {
      expect(drained.state.monsterDefeatAnimationIds).toContain(
        drained.state.activeMonsterReward.monsterInstanceId,
      );
    }
  });
});
