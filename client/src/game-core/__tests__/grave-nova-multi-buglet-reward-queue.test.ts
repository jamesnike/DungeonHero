/**
 * 坟火新星 → 多怪同时死亡 → 奖励队列必须依次推进。
 *
 * 历史 bug：
 *   坟火新星（grave-nova）对当前行所有怪物造成伤害，可能瞬间击杀多只小虫子。
 *   每只虫子的 MONSTER_DEFEATED 都会调 `queueMonsterRewardPure`：第一只成为
 *   `activeMonsterReward`，后续的进 `monsterRewardQueue`。
 *
 *   `handleMonsterRewardSelection`（useShopHandlers.ts）旧实现在玩家选完
 *   第一只虫子的奖励后**无条件** dispatch `CLEAR_ACTIVE_MONSTER_REWARD`。
 *   而 `APPLY_MONSTER_REWARD` reducer 已经在同一同步 dispatch 内 enqueue 了
 *   `DEQUEUE_MONSTER_REWARD` —— 等 `applyMonsterReward(...)` 调用返回时，第二
 *   只虫子的奖励已经被晋升为新的 `activeMonsterReward`。这条多余的 CLEAR
 *   立刻把它擦掉，导致后续虫子的奖励/卡牌**永远卡在队列里**，对应的怪物
 *   也卡在 active row（被标 `defeatProcessed: true` 但没移走）。
 *
 *   修复：CLEAR 仅在 `repair` 这个特殊路径下才需要 —— repair 不走 reducer，
 *   不会自动 clear+dequeue。其它所有奖励类型走 reducer 自治流程。
 *
 * 这个测试覆盖 reducer 自治流程，确保连续的 `APPLY_MONSTER_REWARD`（不带
 * 多余 CLEAR）能让队列依次推进，所有怪物最终落到坟场。
 */

import { describe, expect, it } from 'vitest';
import type { GameCardData } from '@/components/GameCard';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { MonsterRewardDrop } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeBuglet(suffix: string, hp = 1): GameCardData {
  return {
    id: `buglet-${suffix}`,
    type: 'monster',
    name: '小虫子',
    monsterType: 'Buglet',
    value: 2,
    attack: 2,
    hp,
    maxHp: 1,
    baseAttack: 2,
    baseHp: 1,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    isBuglet: true,
  } as GameCardData;
}

function makeRewardDrop(monster: GameCardData): MonsterRewardDrop {
  return {
    monsterInstanceId: monster.id,
    monsterName: monster.name ?? '怪物',
    monsterCard: monster,
    options: [
      {
        id: `${monster.id}-opt-gold`,
        title: '获得 2 金币',
        description: '',
        detail: '即时奖励',
        effect: { type: 'gold', amount: 2 },
      },
      {
        id: `${monster.id}-opt-hp`,
        title: '最大生命 +1',
        description: '',
        detail: '永久增益',
        effect: { type: 'maxHp', amount: 1 },
      },
    ],
  } as MonsterRewardDrop;
}

describe('坟火新星 多怪同死 → 奖励队列推进', () => {
  it('APPLY_MONSTER_REWARD 单步会 clear active 并 enqueue DEQUEUE → 下一条自动晋升', () => {
    const bugletA = makeBuglet('A');
    const bugletB = makeBuglet('B');
    const dropA = makeRewardDrop(bugletA);
    const dropB = makeRewardDrop(bugletB);

    const state = makeState({
      activeMonsterReward: dropA,
      monsterRewardQueue: [dropB],
      ghostBladeExileCards: null,
      gold: 0,
    });

    // 直接 reduce 一次：should set active = null, enqueue DEQUEUE。
    const single = reduce(state, {
      type: 'APPLY_MONSTER_REWARD',
      rewardType: 'gold',
      amount: 2,
    } as GameAction);
    expect(single.state.activeMonsterReward).toBeNull();
    expect(single.enqueuedActions.some(a => a.type === 'DEQUEUE_MONSTER_REWARD')).toBe(true);
  });

  it('drain APPLY_MONSTER_REWARD → 下一条 reward 已经成为 active，无需手动 CLEAR', () => {
    const bugletA = makeBuglet('A');
    const bugletB = makeBuglet('B');
    const dropA = makeRewardDrop(bugletA);
    const dropB = makeRewardDrop(bugletB);

    const state = makeState({
      activeMonsterReward: dropA,
      monsterRewardQueue: [dropB],
      ghostBladeExileCards: null,
      gold: 0,
    });

    // 模拟 hook 修复后的行为：只 dispatch APPLY_MONSTER_REWARD，
    // drain 内部会同步处理 enqueue 的 DEQUEUE_MONSTER_REWARD。
    const after = drain(state, [{
      type: 'APPLY_MONSTER_REWARD',
      rewardType: 'gold',
      amount: 2,
    } as GameAction]);

    expect(after.state.gold).toBe(2);
    expect(after.state.activeMonsterReward).not.toBeNull();
    expect(after.state.activeMonsterReward?.monsterInstanceId).toBe(bugletB.id);
    expect(after.state.monsterRewardQueue).toEqual([]);
    // bugletA 的卡牌应该已经进了坟场。
    expect(after.state.discardedCards.some(c => c.id === bugletA.id)).toBe(true);
  });

  it('回归：旧 bug —— APPLY_MONSTER_REWARD 后再多 dispatch 一次 CLEAR_ACTIVE_MONSTER_REWARD 会擦掉刚晋升的下一条', () => {
    const bugletA = makeBuglet('A');
    const bugletB = makeBuglet('B');
    const dropA = makeRewardDrop(bugletA);
    const dropB = makeRewardDrop(bugletB);

    const state = makeState({
      activeMonsterReward: dropA,
      monsterRewardQueue: [dropB],
      ghostBladeExileCards: null,
      gold: 0,
    });

    const after = drain(state, [
      { type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 2 } as GameAction,
      // 这是修复前的 bug：handleMonsterRewardSelection 在 applyMonsterReward 后
      // 无条件 dispatch CLEAR_ACTIVE_MONSTER_REWARD。
      { type: 'CLEAR_ACTIVE_MONSTER_REWARD' } as GameAction,
    ]);

    // 旧 bug 的症状：bugletB 的奖励被擦掉，但还残留在队列状态里？不 ——
    // CLEAR 只清 activeMonsterReward；DEQUEUE 已经把 dropB 从队列里弹出了。
    // 所以 dropB 彻底丢失，bugletB 的卡也不会进坟场。
    expect(after.state.activeMonsterReward).toBeNull();
    expect(after.state.monsterRewardQueue).toEqual([]);
    expect(after.state.discardedCards.some(c => c.id === bugletA.id)).toBe(true);
    // bugletB 没有进坟场 —— 这正是 user 报的"卡住了"症状。
    expect(after.state.discardedCards.some(c => c.id === bugletB.id)).toBe(false);
  });

  it('三只虫子连环：依次 dispatch APPLY_MONSTER_REWARD（不带 CLEAR）三次 → 队列完全清空、三只都进坟场', () => {
    const a = makeBuglet('A');
    const b = makeBuglet('B');
    const c = makeBuglet('C');
    const dropA = makeRewardDrop(a);
    const dropB = makeRewardDrop(b);
    const dropC = makeRewardDrop(c);

    let state: GameState = makeState({
      activeMonsterReward: dropA,
      monsterRewardQueue: [dropB, dropC],
      ghostBladeExileCards: null,
      gold: 0,
    });

    // Pick #1 —— A 的奖励
    state = drain(state, [{
      type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 2,
    } as GameAction]).state;
    expect(state.activeMonsterReward?.monsterInstanceId).toBe(b.id);
    expect(state.monsterRewardQueue.map(d => d.monsterInstanceId)).toEqual([c.id]);

    // Pick #2 —— B 的奖励
    state = drain(state, [{
      type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 2,
    } as GameAction]).state;
    expect(state.activeMonsterReward?.monsterInstanceId).toBe(c.id);
    expect(state.monsterRewardQueue).toEqual([]);

    // Pick #3 —— C 的奖励
    state = drain(state, [{
      type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 2,
    } as GameAction]).state;
    expect(state.activeMonsterReward).toBeNull();
    expect(state.monsterRewardQueue).toEqual([]);

    // 三只都进了坟场（reducer 内部已经把 monsterCard 移过去了）。
    expect(state.discardedCards.some(card => card.id === a.id)).toBe(true);
    expect(state.discardedCards.some(card => card.id === b.id)).toBe(true);
    expect(state.discardedCards.some(card => card.id === c.id)).toBe(true);
    expect(state.gold).toBe(6);
  });
});

describe('坟火新星 整链：grave-nova → 多 buglet 死 → 奖励排队', () => {
  it('grave-nova 同时 KO 三只虫子 → 一只成为 active reward，其余两只入队', () => {
    const a = makeBuglet('A');
    const b = makeBuglet('B');
    const c = makeBuglet('C');

    // 模拟一个有三只虫子在场上的瀑流行：grave-nova 走的 reduceTriggerGraveNova
    // 会对所有 active 怪物 enqueue DEAL_DAMAGE_TO_MONSTER。直接走完整 chain。
    const slots: (GameCardData | null)[] = [a, b, c, null, null];
    const state = makeState({
      activeCards: slots,
      combatState: { ...initialCombatState, engagedMonsterIds: [a.id, b.id, c.id] },
      activeMonsterReward: null,
      monsterRewardQueue: [],
      ghostBladeExileCards: null,
    });

    // 三只虫子都 hp=1，dmg=3 必杀 → MONSTER_DEFEATED → 奖励排队
    const after = drain(state, [
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: a.id, damage: 3, source: 'grave-nova', isSpellDamage: true } as GameAction,
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: b.id, damage: 3, source: 'grave-nova', isSpellDamage: true } as GameAction,
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: c.id, damage: 3, source: 'grave-nova', isSpellDamage: true } as GameAction,
    ]);

    // 一只成为 active，另外两只在队列里 —— 三只总共三条 reward。
    const queuedTotal = (after.state.activeMonsterReward ? 1 : 0) + after.state.monsterRewardQueue.length;
    expect(queuedTotal).toBe(3);

    const allInstanceIds = new Set<string>();
    if (after.state.activeMonsterReward) allInstanceIds.add(after.state.activeMonsterReward.monsterInstanceId!);
    after.state.monsterRewardQueue.forEach(d => allInstanceIds.add(d.monsterInstanceId!));
    expect(allInstanceIds).toEqual(new Set([a.id, b.id, c.id]));
  });
});
