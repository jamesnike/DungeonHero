/**
 * Ghost-blade exile (虚灵刀 / 灵魂吞噬) — queueing multiple triggers.
 *
 * 历史 bug：BEGIN_GHOST_BLADE_EXILE 之前直接覆盖 `ghostBladeExileCards`，
 * 同一帧里若多次触发（同一伤害链多次 APPLY_DAMAGE / 多张卡攻击 / 等等）
 * 第二次以后的触发会把第一次的 modal options 完全覆盖，玩家看到合成
 * 一个 modal 而非依次多个 modal。
 *
 * 修复：`reduceBeginGhostBladeExile` 在 `ghostBladeExileCards != null` 时
 * 把触发压入 `state.ghostBladeExileQueue`；`SET_GHOST_BLADE_EXILE_CARDS
 * payload=null` 在 ui-state.ts 里检测到队列非空时 enqueue 一条新的
 * `BEGIN_GHOST_BLADE_EXILE`，自动开下一个 modal。`BEGIN_GHOST_BLADE_EXILE`
 * 必须在 pipeline `isInputContinuation` 白名单里，否则 `phase: 'playerInput'`
 * 下 follow-up 会被 strand → 队列死锁。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import type { GameState, GameCardData } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    rng: createRng(42),
    // INPUT_PHASES 下 isInputContinuation 才生效；测真实游戏行为请显式设
    // 'playerInput'（参考 pipeline-input-continuation.mdc）。
    phase: 'playerInput' as GameState['phase'],
    ...overrides,
  };
}

const makeCard = (id: string, name: string): GameCardData => ({
  id,
  type: 'magic',
  name,
  value: 0,
  image: '',
} as any);

describe('Ghost-blade exile — queueing multiple triggers', () => {
  it('单次 BEGIN_GHOST_BLADE_EXILE → 直接开 modal + sourceLabel 写入 state', () => {
    const grave = [makeCard('g1', '腐肉残肢'), makeCard('g2', '断剑')];
    const state = makeState({ discardedCards: grave });

    const r = reduce(state, {
      type: 'BEGIN_GHOST_BLADE_EXILE',
      sourceLabel: '灵魂吞噬',
    });

    expect(r.state.ghostBladeExileCards).not.toBeNull();
    expect(r.state.ghostBladeExileCards?.length).toBeGreaterThan(0);
    expect(r.state.ghostBladeExileSourceLabel).toBe('灵魂吞噬');
    expect(r.state.ghostBladeExileQueue).toEqual([]);
  });

  it('已经开 modal 时第二次 BEGIN_GHOST_BLADE_EXILE → 入队，不覆盖当前候选', () => {
    const grave = [makeCard('g1', '腐肉残肢'), makeCard('g2', '断剑'), makeCard('g3', '碎甲')];
    const state = makeState({ discardedCards: grave });

    const r1 = reduce(state, {
      type: 'BEGIN_GHOST_BLADE_EXILE',
      sourceLabel: '虚灵刀',
    });
    const firstOptions = r1.state.ghostBladeExileCards;
    expect(r1.state.ghostBladeExileSourceLabel).toBe('虚灵刀');

    const r2 = reduce(r1.state, {
      type: 'BEGIN_GHOST_BLADE_EXILE',
      sourceLabel: '灵魂吞噬',
    });

    // 当前 modal 的候选 / sourceLabel 没变
    expect(r2.state.ghostBladeExileCards).toEqual(firstOptions);
    expect(r2.state.ghostBladeExileSourceLabel).toBe('虚灵刀');
    // 第二次触发被排队
    expect(r2.state.ghostBladeExileQueue.length).toBe(1);
    expect(r2.state.ghostBladeExileQueue[0]).toEqual({ sourceLabel: '灵魂吞噬' });
  });

  it('多次 BEGIN_GHOST_BLADE_EXILE → 队列保持入队顺序', () => {
    const grave = [makeCard('g1', 'A'), makeCard('g2', 'B'), makeCard('g3', 'C'), makeCard('g4', 'D')];
    let state = makeState({ discardedCards: grave });

    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L1' }).state;
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L2' }).state;
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L3' }).state;
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L4' }).state;

    expect(state.ghostBladeExileSourceLabel).toBe('L1');
    expect(state.ghostBladeExileQueue.map(e => e.sourceLabel)).toEqual(['L2', 'L3', 'L4']);
  });

  it('SET_GHOST_BLADE_EXILE_CARDS payload=null + 队列空 → 清掉 sourceLabel + 不再开新 modal', () => {
    const grave = [makeCard('g1', '腐肉残肢')];
    let state = makeState({ discardedCards: grave });
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: '虚灵刀' }).state;
    expect(state.ghostBladeExileSourceLabel).toBe('虚灵刀');

    // SET_GHOST_BLADE_EXILE_CARDS 不在 isInputContinuation 白名单（真实游戏里
    // 它是 hook top-level dispatch 走 _processAction 直接 reduce），所以用 reduce
    // 调用本身 + drain(enqueuedActions) 模拟，避免 phase='playerInput' 下 strand。
    const first = reduce(state, { type: 'SET_GHOST_BLADE_EXILE_CARDS', payload: null });
    expect(first.state.ghostBladeExileCards).toBeNull();
    expect(first.state.ghostBladeExileSourceLabel).toBeNull();
    // 队列空 → 不应该 enqueue follow-up BEGIN_GHOST_BLADE_EXILE
    expect(first.enqueuedActions?.some(a => a.type === 'BEGIN_GHOST_BLADE_EXILE')).toBeFalsy();

    const after = drain(first.state, first.enqueuedActions ?? []);
    expect(after.state.ghostBladeExileCards).toBeNull();
    expect(after.state.ghostBladeExileSourceLabel).toBeNull();
    expect(after.state.ghostBladeExileQueue).toEqual([]);
  });

  it('SET_GHOST_BLADE_EXILE_CARDS payload=null + 队列非空 → drain 后下一个 modal 自动开', () => {
    const grave = [makeCard('g1', 'A'), makeCard('g2', 'B'), makeCard('g3', 'C')];
    let state = makeState({ discardedCards: grave });
    // 触发 3 次，第 1 次开 modal，后 2 次进队列
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L1' }).state;
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L2' }).state;
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L3' }).state;

    expect(state.ghostBladeExileSourceLabel).toBe('L1');
    expect(state.ghostBladeExileQueue.length).toBe(2);

    // 玩家关闭第 1 个 modal（payload=null）→ reduce 直接出 patch + enqueue
    // BEGIN_GHOST_BLADE_EXILE follow-up，drain 跑 follow-up 去开下一个 modal
    const closeFirst = reduce(state, { type: 'SET_GHOST_BLADE_EXILE_CARDS', payload: null });
    expect(closeFirst.enqueuedActions?.some(a => a.type === 'BEGIN_GHOST_BLADE_EXILE')).toBe(true);

    const after = drain(closeFirst.state, closeFirst.enqueuedActions ?? []);

    // L2 自动晋升为新的 active modal
    expect(after.state.ghostBladeExileCards).not.toBeNull();
    expect(after.state.ghostBladeExileCards?.length).toBeGreaterThan(0);
    expect(after.state.ghostBladeExileSourceLabel).toBe('L2');
    expect(after.state.ghostBladeExileQueue.length).toBe(1);
    expect(after.state.ghostBladeExileQueue[0]).toEqual({ sourceLabel: 'L3' });

    // 玩家继续关 → L3 晋升
    const closeSecond = reduce(after.state, { type: 'SET_GHOST_BLADE_EXILE_CARDS', payload: null });
    const after2 = drain(closeSecond.state, closeSecond.enqueuedActions ?? []);
    expect(after2.state.ghostBladeExileSourceLabel).toBe('L3');
    expect(after2.state.ghostBladeExileQueue.length).toBe(0);

    // 关 L3 → 队列空，结束
    const closeThird = reduce(after2.state, { type: 'SET_GHOST_BLADE_EXILE_CARDS', payload: null });
    const after3 = drain(closeThird.state, closeThird.enqueuedActions ?? []);
    expect(after3.state.ghostBladeExileCards).toBeNull();
    expect(after3.state.ghostBladeExileSourceLabel).toBeNull();
    expect(after3.state.ghostBladeExileQueue.length).toBe(0);
  });

  it('入队场景下：当前 modal 的 RNG 不被后续触发提前消耗', () => {
    // BEGIN_GHOST_BLADE_EXILE 走 noChange-style 入队时不应该 shuffle 候选 /
    // 消耗 rng；候选只在真正开 modal 时（队列 dequeue + 新 BEGIN）才 shuffle。
    // 这避免「同帧多次触发提前消耗 RNG → 后续无关效果非确定性」的副作用。
    const grave = [makeCard('g1', 'A'), makeCard('g2', 'B'), makeCard('g3', 'C')];
    let state = makeState({ discardedCards: grave, rng: createRng(7) });
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L1' }).state;
    const rngAfterFirst = state.rng;

    // 第二次入队（不开 modal）→ rng 不应该变
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L2' }).state;
    expect(state.rng.seed).toBe(rngAfterFirst.seed);
    expect(state.rng.state).toBe(rngAfterFirst.state);

    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: 'L3' }).state;
    expect(state.rng.state).toBe(rngAfterFirst.state);
  });

  it('regression: 同帧两次「灵魂吞噬」连续触发不再合并成一个 modal', () => {
    // 模拟 user 报告的现场：玩家在同一伤害链里被打两次（两只怪连击 / 多攻击
    // 来源），灵魂吞噬触发两次，旧实现两个 modal 合并成一个 → 玩家少选一次。
    const grave = [makeCard('g1', '骨片'), makeCard('g2', '残骸'), makeCard('g3', '碎甲'), makeCard('g4', '断剑')];
    let state = makeState({ discardedCards: grave });

    // 第一次伤害 → 触发
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: '灵魂吞噬' }).state;
    const firstOptions = state.ghostBladeExileCards?.map(c => c.id);
    expect(firstOptions?.length).toBeGreaterThan(0);

    // 第二次伤害 → 旧 bug：覆盖 firstOptions；现在：入队
    state = reduce(state, { type: 'BEGIN_GHOST_BLADE_EXILE', sourceLabel: '灵魂吞噬' }).state;
    const optionsAfterSecondTrigger = state.ghostBladeExileCards?.map(c => c.id);

    // 关键断言：第一次的候选没被覆盖
    expect(optionsAfterSecondTrigger).toEqual(firstOptions);
    expect(state.ghostBladeExileQueue.length).toBe(1);

    // 玩家选 1 张关掉第一个 modal → 第二个 modal 自动开
    const after = drain(state, [
      { type: 'SET_GHOST_BLADE_EXILE_CARDS', payload: null },
    ]);
    expect(after.state.ghostBladeExileCards).not.toBeNull();
    expect(after.state.ghostBladeExileCards?.length).toBeGreaterThan(0);
    expect(after.state.ghostBladeExileSourceLabel).toBe('灵魂吞噬');
  });

  it('坟场被「专属召唤」/ 之前的 ghost-blade 选择掏空时，BEGIN 走 noChange + 不入队', () => {
    // 边界：reduceBeginGhostBladeExile 在 eligible.length === 0 时早返
    // (noChange)；不应该入队（队列里塞一个永远开不出的 trigger 没意义）。
    const state = makeState({ discardedCards: [] });

    const r = reduce(state, {
      type: 'BEGIN_GHOST_BLADE_EXILE',
      sourceLabel: '虚灵刀',
    });

    expect(r.state.ghostBladeExileCards).toBeNull();
    expect(r.state.ghostBladeExileSourceLabel).toBeNull();
    expect(r.state.ghostBladeExileQueue).toEqual([]);
  });
});
