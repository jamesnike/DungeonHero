/**
 * 战痕之符 / 咒纹刻印 / 眩学之符 等"side-effect → hook → 再 dispatch"型
 * BEGIN_DISCOVER 不应该挤掉正在显示的高优先级 modal。
 *
 * 历史 bug（user-reported）：
 *   击杀怪物的同一次 DEAL_DAMAGE_TO_MONSTER 让 classDamageDiscoverStreak 撞到
 *   阈值，reducer 发出 `combat:classDamageDiscoverTriggered`，hook
 *   `useCombatActions` 收到后 dispatch `BEGIN_DISCOVER`。但因为引擎此时还在
 *   外层 `_processAction` 里，这条 BEGIN_DISCOVER 落进 `_dispatchQueue`，
 *   等外层 drain 结束后才执行。那时 `activeMonsterReward` 已经由
 *   MONSTER_DEFEATED 设好 — BEGIN_DISCOVER 直接把 `discoverModalOpen=true`，
 *   discover 模态把"怪物战利品" modal 视觉上挤掉。
 *
 * Fix：`reduceBeginDiscover` 检测到任一阻塞 modal（`activeMonsterReward` /
 * `ghostBladeExileCards` / 已经在显示的 `discoverModalOpen`）时把请求落进
 * `pendingClassDiscoverQueue`，等阻塞 modal 被解开后由 `DEQUEUE_MONSTER_REWARD`
 * / `SET_DISCOVER_MODAL close` / `RESOLVE_DISCOVER_SELECTION` / 任一现成的
 * queue drain site 推动。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import type { GameState, MonsterRewardDrop } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  // 按 `pipeline-input-continuation.mdc`：默认 phase: 'playerInput'，否则
  // INPUT_PHASES gating 不生效，drain 看到的是"完美的同步链"，跟真实游戏
  // 行为脱节。
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeClassCard(id: string, name: string): GameCardData {
  return { id, type: 'magic', name, value: 0 } as GameCardData;
}

function makeMonster(id: string): GameCardData {
  return {
    id,
    type: 'monster',
    name: 'Goblin',
    value: 5,
    hp: 5,
    maxHp: 5,
    attack: 3,
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
    ],
  } as MonsterRewardDrop;
}

// ---------------------------------------------------------------------------
// Defer path：阻塞 modal 时 BEGIN_DISCOVER 必须排队而非立刻开
// ---------------------------------------------------------------------------

describe('BEGIN_DISCOVER 在阻塞 modal 时排队', () => {
  it('activeMonsterReward 非空时不开 discover 模态、改而进 pendingClassDiscoverQueue', () => {
    const monster = makeMonster('m1');
    const classPool: GameCardData[] = [
      makeClassCard('c1', '专属甲'),
      makeClassCard('c2', '专属乙'),
      makeClassCard('c3', '专属丙'),
    ];
    const state = makeState({
      rng: createRng(11),
      classDeck: classPool,
      activeMonsterReward: makeRewardDrop(monster),
    });

    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'damage-class-discover',
      pool: classPool,
      sourceLabel: '战痕之符',
    } as GameAction);

    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.discoverOptions).toEqual([]);
    expect(result.state.pendingClassDiscoverQueue.length).toBe(1);
    expect(result.state.pendingClassDiscoverQueue[0]).toMatchObject({
      source: 'damage-class-discover',
      sourceLabel: '战痕之符',
    });
    // active monster reward 没被改动
    expect(result.state.activeMonsterReward?.monsterInstanceId).toBe('m1');
  });

  it('ghostBladeExileCards 非空时同样排队', () => {
    const classPool: GameCardData[] = [makeClassCard('c1', '专属甲')];
    const state = makeState({
      rng: createRng(12),
      classDeck: classPool,
      ghostBladeExileCards: [],
    });

    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'damage-class-discover',
      pool: classPool,
    } as GameAction);

    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.pendingClassDiscoverQueue.length).toBe(1);
  });

  it('discoverModalOpen 已经为 true（已有 discover 链在进行）时排队，不覆盖当前候选', () => {
    const existingOptions = [makeClassCard('existing1', '前一轮甲'), makeClassCard('existing2', '前一轮乙')];
    const newPool = [makeClassCard('new1', '新池甲'), makeClassCard('new2', '新池乙')];
    const state = makeState({
      rng: createRng(13),
      classDeck: [...existingOptions, ...newPool],
      discoverModalOpen: true,
      discoverOptions: existingOptions,
      discoverSourceLabel: 'first-discover',
    });

    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'damage-class-discover',
      pool: newPool,
    } as GameAction);

    // 当前 modal 的候选不变
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.discoverOptions.map(c => c.id)).toEqual(['existing1', 'existing2']);
    expect(result.state.discoverSourceLabel).toBe('first-discover');
    // 新请求被排队
    expect(result.state.pendingClassDiscoverQueue.length).toBe(1);
    expect(result.state.pendingClassDiscoverQueue[0].source).toBe('damage-class-discover');
  });

  it('postInjectTopOnRecycleRestore 在排队中保留（右翼回响 option 2 在阻塞期间被触发）', () => {
    const monster = makeMonster('m1');
    const classPool: GameCardData[] = [makeClassCard('c1', '专属甲')];
    const state = makeState({
      rng: createRng(14),
      classDeck: classPool,
      activeMonsterReward: makeRewardDrop(monster),
    });

    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'right-wing-echo-class-top',
      pool: classPool,
      delivery: 'hand-first',
      postInjectTopOnRecycleRestore: true,
    } as GameAction);

    expect(result.state.pendingClassDiscoverQueue.length).toBe(1);
    expect(result.state.pendingClassDiscoverQueue[0]).toMatchObject({
      source: 'right-wing-echo-class-top',
      delivery: 'hand-first',
      postInjectTopOnRecycleRestore: true,
    });
  });

  it('祭坛秘术 source → 自动推断 magicOnly: true', () => {
    const monster = makeMonster('m1');
    const classPool: GameCardData[] = [makeClassCard('c1', '专属魔法甲')];
    const state = makeState({
      rng: createRng(15),
      classDeck: classPool,
      activeMonsterReward: makeRewardDrop(monster),
    });

    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'altar-discover-class-magic',
      pool: classPool,
    } as GameAction);

    expect(result.state.pendingClassDiscoverQueue.length).toBe(1);
    expect(result.state.pendingClassDiscoverQueue[0].magicOnly).toBe(true);
  });

  it('damage-class-discover source → magicOnly: false（用全池）', () => {
    const monster = makeMonster('m1');
    const classPool: GameCardData[] = [makeClassCard('c1', '专属甲')];
    const state = makeState({
      rng: createRng(16),
      classDeck: classPool,
      activeMonsterReward: makeRewardDrop(monster),
    });

    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'damage-class-discover',
      pool: classPool,
    } as GameAction);

    expect(result.state.pendingClassDiscoverQueue.length).toBe(1);
    expect(result.state.pendingClassDiscoverQueue[0].magicOnly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Drain path：阻塞 modal 解除后 discover 自动开
// ---------------------------------------------------------------------------

describe('阻塞 modal 解除后 pendingClassDiscoverQueue 自动 drain', () => {
  it('APPLY_MONSTER_REWARD（队列里只有 1 个 reward + 1 个 pending discover）→ drain 后 discover 模态打开', () => {
    const monster = makeMonster('m1');
    const classPool: GameCardData[] = [
      makeClassCard('c1', '专属甲'),
      makeClassCard('c2', '专属乙'),
      makeClassCard('c3', '专属丙'),
    ];
    const reward = makeRewardDrop(monster);
    const state = makeState({
      rng: createRng(21),
      classDeck: classPool,
      activeMonsterReward: reward,
      monsterRewardQueue: [],
      pendingClassDiscoverQueue: [
        {
          source: 'damage-class-discover',
          sourceLabel: '战痕之符',
          delivery: 'backpack',
          magicOnly: false,
        },
      ],
      gold: 0,
    });

    const after = drain(state, [
      { type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 2 } as GameAction,
    ]);

    // 怪物奖励生效
    expect(after.state.gold).toBe(2);
    expect(after.state.activeMonsterReward).toBeNull();
    // pending discover 已经被 drain，discover 模态打开
    expect(after.state.pendingClassDiscoverQueue.length).toBe(0);
    expect(after.state.discoverModalOpen).toBe(true);
    expect(after.state.discoverSourceLabel).toBe('战痕之符');
    expect(after.state.discoverOptions.length).toBeGreaterThan(0);
  });

  it('多怪同死 + 战痕之符触发：所有 reward 先依次结算，才开 discover', () => {
    const monsterA = makeMonster('m-A');
    const monsterB = makeMonster('m-B');
    const classPool: GameCardData[] = [
      makeClassCard('c1', '专属甲'),
      makeClassCard('c2', '专属乙'),
      makeClassCard('c3', '专属丙'),
    ];
    const dropA = makeRewardDrop(monsterA);
    const dropB = makeRewardDrop(monsterB);
    const state = makeState({
      rng: createRng(22),
      classDeck: classPool,
      activeMonsterReward: dropA,
      monsterRewardQueue: [dropB],
      pendingClassDiscoverQueue: [
        { source: 'damage-class-discover', sourceLabel: '战痕之符', delivery: 'backpack', magicOnly: false },
      ],
      gold: 0,
    });

    // 第 1 次 APPLY_MONSTER_REWARD —— 不应该开 discover，应该让 dropB 晋升
    const afterFirst = drain(state, [
      { type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 2 } as GameAction,
    ]);
    expect(afterFirst.state.activeMonsterReward?.monsterInstanceId).toBe('m-B');
    expect(afterFirst.state.discoverModalOpen).toBe(false);
    expect(afterFirst.state.pendingClassDiscoverQueue.length).toBe(1);

    // 第 2 次 APPLY_MONSTER_REWARD —— 现在 monsterRewardQueue 空了，
    // DEQUEUE_MONSTER_REWARD 应该 drain pendingClassDiscoverQueue。
    const afterSecond = drain(afterFirst.state, [
      { type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 2 } as GameAction,
    ]);
    expect(afterSecond.state.activeMonsterReward).toBeNull();
    expect(afterSecond.state.pendingClassDiscoverQueue.length).toBe(0);
    expect(afterSecond.state.discoverModalOpen).toBe(true);
  });

  it('SET_GHOST_BLADE_EXILE_CARDS payload=null + pendingClassDiscoverQueue 非空 → drain', () => {
    const classPool: GameCardData[] = [
      makeClassCard('c1', '专属甲'),
      makeClassCard('c2', '专属乙'),
    ];
    const state = makeState({
      rng: createRng(23),
      classDeck: classPool,
      ghostBladeExileCards: [],
      pendingClassDiscoverQueue: [
        { source: 'damage-class-discover', sourceLabel: '战痕之符', delivery: 'backpack', magicOnly: false },
      ],
    });

    // SET_GHOST_BLADE_EXILE_CARDS 在真实游戏里是 hook top-level dispatch
    // （走 `engine._processAction` 直接 reduce，不过 pipeline gate）。本测试
    // 也用 `reduce` + `drain(enqueuedActions)` 来模拟，避免 INPUT_PHASES
    // gating 把这条 action stranded。
    const first = reduce(state, {
      type: 'SET_GHOST_BLADE_EXILE_CARDS',
      payload: null,
    } as GameAction);
    expect(first.state.ghostBladeExileCards).toBeNull();
    expect(first.enqueuedActions?.some(a => a.type === 'DEQUEUE_MONSTER_REWARD')).toBe(true);

    const after = drain(first.state, first.enqueuedActions ?? []);

    expect(after.state.ghostBladeExileCards).toBeNull();
    expect(after.state.pendingClassDiscoverQueue.length).toBe(0);
    expect(after.state.discoverModalOpen).toBe(true);
  });

  it('postInjectTopOnRecycleRestore 在排队 → drain 后 discover 状态正确继承', () => {
    const monster = makeMonster('m1');
    const classPool: GameCardData[] = [makeClassCard('c1', '专属甲')];
    const state = makeState({
      rng: createRng(24),
      classDeck: classPool,
      activeMonsterReward: makeRewardDrop(monster),
      pendingClassDiscoverQueue: [
        {
          source: 'right-wing-echo-class-top',
          sourceLabel: '右翼回响',
          delivery: 'hand-first',
          magicOnly: false,
          postInjectTopOnRecycleRestore: true,
        },
      ],
      gold: 0,
    });

    const after = drain(state, [
      { type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 2 } as GameAction,
    ]);

    expect(after.state.discoverModalOpen).toBe(true);
    expect(after.state.discoverDelivery).toBe('hand-first');
    expect(after.state.discoverPostInjectTopOnRecycleRestore).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 历史症状回归：原 bug 的视觉重现 + 修复后断言
// ---------------------------------------------------------------------------

describe('regression: 战痕之符 击杀同帧触发不再挤掉怪物战利品 modal', () => {
  it('同时 set activeMonsterReward + dispatch BEGIN_DISCOVER（模拟 hook 再入）→ monster reward 仍可见、discover 被排队', () => {
    const monster = makeMonster('m1');
    const classPool: GameCardData[] = [
      makeClassCard('c1', '专属甲'),
      makeClassCard('c2', '专属乙'),
      makeClassCard('c3', '专属丙'),
    ];
    // 模拟：MONSTER_DEFEATED 已经把 reward set 到了 state 上，hook 收到
    // `combat:classDamageDiscoverTriggered` 后再 dispatch BEGIN_DISCOVER。
    const stateAfterDefeat = makeState({
      rng: createRng(31),
      classDeck: classPool,
      activeMonsterReward: makeRewardDrop(monster),
    });

    const after = drain(stateAfterDefeat, [
      {
        type: 'BEGIN_DISCOVER',
        source: 'damage-class-discover',
        pool: classPool,
        sourceLabel: '战痕之符',
      } as GameAction,
    ]);

    // 关键断言：怪物战利品 modal 没被挤掉
    expect(after.state.activeMonsterReward?.monsterInstanceId).toBe('m1');
    expect(after.state.discoverModalOpen).toBe(false);
    // discover 已经排队等 reward 结算后再开
    expect(after.state.pendingClassDiscoverQueue.length).toBe(1);
    expect(after.state.pendingClassDiscoverQueue[0].source).toBe('damage-class-discover');
  });
});
