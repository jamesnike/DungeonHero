/**
 * Boss 「召唤」(bossEnrageGraveyardSummon) regression test.
 *
 * 设计契约 (per CARD_POOL_REFERENCE.md / CardDetailsModal description):
 *   被激怒时，从坟场取 4 张牌：
 *     - 2 张怪物各占 1 个非 boss 格子（成为顶层，进场时当前血层为 1）
 *     - **2 张非怪物堆叠在另 1 个非 boss 格子上** （注意：非怪物共享 1 格）
 *
 * 历史 bug:
 *   `reduceBeginCombat` 里把 `nonMonsterTarget` 算成
 *     `min(2, slotsAvailable - monsterTarget)`
 *   这把"非怪物每张占 1 格"算了进去。地城 4 列、boss 占 1 列 → otherSlots.length = 3
 *     slotsAvailable = min(summonCount=4, 3) = 3
 *     monsterTarget  = min(2, 3) = 2
 *     nonMonsterTarget = min(2, 3 - 2) = **1** ← 少召唤了 1 张非怪物
 *   实际只召唤 1 张非怪物，违反"2 张堆叠"契约。
 *
 * 修复后：非怪物只需要 1 个格子（堆叠），所以只要 monsters 占完后还剩 ≥1 格，
 *        就召唤 2 张非怪物（受坟场供给上限约束）。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeBoss(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'boss-1',
    type: 'monster',
    name: '终末巫王',
    value: 0,
    image: '',
    hp: 30,
    maxHp: 30,
    attack: 10,
    fury: 1,
    currentLayer: 1,
    bossPhase: true,
    bossEnrageGraveyardSummon: 4,
    ...(over ?? {}),
  } as GameCardData;
}

function makeMonster(id: string, name: string, over?: Partial<GameCardData>): GameCardData {
  return {
    id,
    type: 'monster',
    name,
    value: 3,
    image: '',
    hp: 5,
    maxHp: 5,
    attack: 3,
    fury: 1,
    currentLayer: 1,
    ...(over ?? {}),
  } as GameCardData;
}

function makeNonMonster(id: string, name: string, type: 'potion' | 'magic' = 'potion'): GameCardData {
  return {
    id,
    type,
    name,
    value: 0,
    image: '',
  } as GameCardData;
}

describe('Boss 召唤 — 非怪物堆叠 contract', () => {
  it('从坟场召唤 2 怪物 + 2 非怪物（非怪物堆叠在 1 个格子上），共 4 张', () => {
    const boss = makeBoss();
    const m1 = makeMonster('grave-m1', '骷髅兵');
    const m2 = makeMonster('grave-m2', '哥布林');
    const m3 = makeMonster('grave-m3', '巨魔'); // 多余的：只该取 2
    const p1 = makeNonMonster('grave-p1', '治疗药水', 'potion');
    const p2 = makeNonMonster('grave-p2', '魔法卷轴', 'magic');
    const p3 = makeNonMonster('grave-p3', '解毒剂', 'potion'); // 多余的：只该取 2

    // 标准 4 列地城：boss 在第 0 列，其它 3 列为空
    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [m1, m2, m3, p1, p2, p3],
      combatState: { ...initialCombatState, engagedMonsterIds: [] }, // 还没和 boss 接战
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;

    // 召唤后：4 张牌从坟场移除
    expect(next.discardedCards.length).toBe(2);
    const remainingIds = next.discardedCards.map(c => c.id).sort();
    // 多出的 m3 / p3 至少有 1 张还在坟场（取决于 RNG 选了哪两张）
    // 但保证：至少 1 张 monster 和 1 张 non-monster 没被取走
    const monstersLeft = next.discardedCards.filter(c => c.type === 'monster').length;
    const nonMonstersLeft = next.discardedCards.filter(c => c.type !== 'monster').length;
    expect(monstersLeft).toBe(1); // 3 张 monster - 取 2 = 1 张留在坟场
    expect(nonMonstersLeft).toBe(1); // 3 张 non-monster - 取 2 = 1 张留在坟场
    void remainingIds;

    // 激活行：boss 还在第 0 列；3 张顶层共占 3 格中的 2 格（怪物各占一格 + 非怪物共占一格）
    // 因为 placeOnTop 把现有 top 推入 stack，但其它 3 格本来就是空的，所以无 stack 入栈。
    const activeMonsters = next.activeCards.filter(c => c?.type === 'monster');
    // boss + 2 召唤怪物 = 3 monster top
    expect(activeMonsters.length).toBe(3);
    expect(activeMonsters.find(c => c?.id === 'boss-1')).toBeDefined();
    expect(activeMonsters.filter(c => c?.id !== 'boss-1').length).toBe(2);

    // 关键断言：非怪物堆叠后，**top 1 张 + 栈底 1 张 = 2 张**，共占 1 个格子。
    const stackEntries = Object.entries(next.activeCardStacks);
    // 应该有且仅有 1 个 stack（非怪物堆叠的那一格）
    expect(stackEntries.length).toBe(1);
    const [stackedSlotIdx, stackedCards] = stackEntries[0];
    expect(stackedCards.length).toBe(1); // 栈底 1 张（top 是 activeCards[idx]）
    expect(stackedCards[0].type).not.toBe('monster');

    const topOfStackSlot = next.activeCards[Number(stackedSlotIdx)];
    expect(topOfStackSlot).not.toBeNull();
    expect(topOfStackSlot!.type).not.toBe('monster');

    // 总召唤的非怪物 = top + 栈底 = 2 张
    const allSummonedNonMonsters = [stackedCards[0], topOfStackSlot!];
    expect(allSummonedNonMonsters.length).toBe(2);
    expect(allSummonedNonMonsters.every(c => c.type !== 'monster')).toBe(true);
  });

  it('坟场只有 1 张非怪物时，只召唤 1 张非怪物（坟场上限封顶）', () => {
    const boss = makeBoss();
    const m1 = makeMonster('m1', '骷髅');
    const m2 = makeMonster('m2', '哥布林');
    const p1 = makeNonMonster('p1', '药水');

    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [m1, m2, p1],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;
    // 全部 3 张被召唤
    expect(next.discardedCards.length).toBe(0);
    // 没有需要堆叠（只有 1 张非怪物）
    const stackEntries = Object.entries(next.activeCardStacks);
    expect(stackEntries.length).toBe(0);
    const nonMonsterTops = next.activeCards.filter(c => c && c.type !== 'monster');
    expect(nonMonsterTops.length).toBe(1);
  });

  it('坟场无非怪物时，只召唤 2 张怪物', () => {
    const boss = makeBoss();
    const m1 = makeMonster('m1', '骷髅');
    const m2 = makeMonster('m2', '哥布林');

    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [m1, m2],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;
    expect(next.discardedCards.length).toBe(0);
    expect(Object.keys(next.activeCardStacks).length).toBe(0);
    // boss + 2 召唤怪物 = 3 monster
    expect(next.activeCards.filter(c => c?.type === 'monster').length).toBe(3);
  });
});

describe('Boss 召唤 — 召唤的怪物恢复 1 血层', () => {
  it('多血层怪物：进场时 currentLayer = 2（而不是 1），受 fury 上限封顶', () => {
    const boss = makeBoss();
    // 4-fury monster：进场后 currentLayer 应该是 min(2, 4) = 2
    const m1 = makeMonster('grave-m1', '巨龙', { fury: 4, hpLayers: 4 });
    const m2 = makeMonster('grave-m2', '泰坦', { fury: 3, hpLayers: 3 });

    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [m1, m2],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;
    const summoned = next.activeCards.filter(c => c?.type === 'monster' && c.id !== boss.id);
    expect(summoned.length).toBe(2);
    // 两只都该是 currentLayer = 2（min(2, 4) = 2，min(2, 3) = 2）
    for (const m of summoned) {
      expect(m!.currentLayer).toBe(2);
    }
  });

  it('1-fury 怪物：clamp 到 1（恢复后还是 1 层，不会越过上限）', () => {
    const boss = makeBoss();
    // 1-fury monster：进场时 currentLayer = min(2, 1) = 1（不变）
    const m1 = makeMonster('grave-m1', '骷髅', { fury: 1, hpLayers: 1 });
    const m2 = makeMonster('grave-m2', '哥布林', { fury: 1, hpLayers: 1 });

    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [m1, m2],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;
    const summoned = next.activeCards.filter(c => c?.type === 'monster' && c.id !== boss.id);
    expect(summoned.length).toBe(2);
    for (const m of summoned) {
      expect(m!.currentLayer).toBe(1);
    }
  });

  it('混合 fury：每只独立 clamp 到自己的 maxLayers', () => {
    const boss = makeBoss();
    const m1 = makeMonster('grave-m1', '骷髅', { fury: 1, hpLayers: 1 }); // -> 1
    const m2 = makeMonster('grave-m2', '巨魔', { fury: 5, hpLayers: 5 }); // -> 2

    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [m1, m2],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;
    const summoned = next.activeCards.filter(c => c?.type === 'monster' && c.id !== boss.id);
    expect(summoned.length).toBe(2);
    const byId = Object.fromEntries(summoned.map(m => [m!.id, m]));
    expect(byId['grave-m1']!.currentLayer).toBe(1);
    expect(byId['grave-m2']!.currentLayer).toBe(2);
  });
});

describe('Boss 召唤 — 优先选择非小虫子的 monster', () => {
  it('坟场有 2 非小虫子 + 多只小虫子时，召唤的 2 张 monster 都不是小虫子', () => {
    const boss = makeBoss();
    const dragon = makeMonster('grave-dragon', '巨龙', { fury: 3, hpLayers: 3 });
    const skeleton = makeMonster('grave-skeleton', '骷髅', { fury: 1, hpLayers: 1 });
    const buglet1 = makeMonster('grave-buglet-1', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });
    const buglet2 = makeMonster('grave-buglet-2', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });
    const buglet3 = makeMonster('grave-buglet-3', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });
    const buglet4 = makeMonster('grave-buglet-4', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });

    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [buglet1, dragon, buglet2, skeleton, buglet3, buglet4],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;
    const summonedMonsters = next.activeCards.filter(c => c?.type === 'monster' && c.id !== boss.id);
    expect(summonedMonsters.length).toBe(2);
    // 关键断言：召唤的两只 monster 都是非小虫子（巨龙 + 骷髅），不应该是 buglet。
    for (const m of summonedMonsters) {
      expect(m!.isBuglet).not.toBe(true);
    }
    const summonedIds = summonedMonsters.map(m => m!.id).sort();
    expect(summonedIds).toEqual(['grave-dragon', 'grave-skeleton']);
  });

  it('坟场只有 1 张非小虫子时，第 2 张 monster 才能从小虫子里抽（兜底）', () => {
    const boss = makeBoss();
    const dragon = makeMonster('grave-dragon', '巨龙', { fury: 3, hpLayers: 3 });
    const buglet1 = makeMonster('grave-buglet-1', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });
    const buglet2 = makeMonster('grave-buglet-2', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });

    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [buglet1, dragon, buglet2],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;
    const summonedMonsters = next.activeCards.filter(c => c?.type === 'monster' && c.id !== boss.id);
    expect(summonedMonsters.length).toBe(2);
    // 巨龙必被选中（唯一的非小虫子，优先抽）；另一只是从两只小虫子里随机抽 1 只。
    const dragonSummoned = summonedMonsters.find(m => m!.id === 'grave-dragon');
    expect(dragonSummoned).toBeDefined();
    const otherSummoned = summonedMonsters.find(m => m!.id !== 'grave-dragon');
    expect(otherSummoned).toBeDefined();
    expect(otherSummoned!.isBuglet).toBe(true);
  });

  it('坟场全是小虫子时，仍然召唤 2 只小虫子（保底，不会少召唤）', () => {
    const boss = makeBoss();
    const buglet1 = makeMonster('grave-buglet-1', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });
    const buglet2 = makeMonster('grave-buglet-2', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });
    const buglet3 = makeMonster('grave-buglet-3', '小虫子', { fury: 1, hpLayers: 1, isBuglet: true });

    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      activeCardStacks: {},
      discardedCards: [buglet1, buglet2, buglet3],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: boss,
      initiator: 'player',
    } as any);

    const next = r.state;
    const summonedMonsters = next.activeCards.filter(c => c?.type === 'monster' && c.id !== boss.id);
    // 没有非小虫子可选，不能少召唤——仍然要召唤 2 只小虫子。
    expect(summonedMonsters.length).toBe(2);
    for (const m of summonedMonsters) {
      expect(m!.isBuglet).toBe(true);
    }
  });
});
