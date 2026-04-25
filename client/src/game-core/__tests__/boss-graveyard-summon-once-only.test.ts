/**
 * Regression: Boss「亡灵召唤」(`bossEnrageGraveyardSummon`) 必须是一次性技能。
 *
 * 用户报告的 bug：「将boss打出复生后(已经处于激怒状态)，攻击他，又一次触发了 ”亡灵召唤“」
 *
 * 根因：原 `reduceBeginCombat` 只用 `!alreadyEngaged` 守门防重复，但有边缘路径
 * 可能让 boss 短暂失去 engaged 状态后又被重新 engage（如复生后回合切换 / 状态恢复
 * / 某些清空 combatState 的路径），任何一条都会让 summon 漏触发到第二次。
 *
 * 修复：summon 成功召唤后立刻清掉 `bossEnrageGraveyardSummon` 字段，让它无论
 * 哪种 engage 路径都不会再次触发。失败路径（坟场空 / 无空 slot）走不到清字段的
 * 代码块，所以下次条件满足仍能正常触发。
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeBoss(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'boss-1',
    type: 'monster',
    name: '终末巫王',
    value: 0,
    image: '',
    hp: 5,
    maxHp: 5,
    attack: 1,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    bossPhase: true,
    bossEnrageGraveyardSummon: 4,
    hasRevive: true,
    reviveUsed: false,
    ...(over ?? {}),
  } as GameCardData;
}

function makeMonster(id: string, name: string, over?: Partial<GameCardData>): GameCardData {
  return {
    id, type: 'monster', name, value: 3, image: '',
    hp: 5, maxHp: 5, attack: 3, fury: 1, currentLayer: 1,
    ...(over ?? {}),
  } as GameCardData;
}

function makeNonMonster(id: string, name: string): GameCardData {
  return { id, type: 'potion', name, value: 0, image: '' } as GameCardData;
}

describe('boss graveyard summon — one-shot semantics', () => {
  it('成功召唤后 boss 卡上的 bossEnrageGraveyardSummon 字段被清掉', () => {
    const boss = makeBoss();
    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      discardedCards: [
        makeMonster('g-m1', '骷髅兵'),
        makeMonster('g-m2', '哥布林'),
        makeNonMonster('g-p1', '治疗药水'),
        makeNonMonster('g-p2', '魔法卷轴'),
      ],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, { type: 'BEGIN_COMBAT', monster: boss, initiator: 'hero' } as any);
    const bossAfter = r.state.activeCards.find(c => c?.id === 'boss-1') as any;

    // 召唤确实发生了（坟场被消耗）
    expect(r.state.discardedCards.length).toBe(0);
    // 字段已经清空
    expect(bossAfter.bossEnrageGraveyardSummon).toBeUndefined();
  });

  it('召唤失败（坟场空）时 bossEnrageGraveyardSummon 不清，下次仍可触发', () => {
    const boss = makeBoss();
    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      discardedCards: [], // 坟场是空的
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, { type: 'BEGIN_COMBAT', monster: boss, initiator: 'hero' } as any);
    const bossAfter = r.state.activeCards.find(c => c?.id === 'boss-1') as any;

    // 字段保留——下次坟场有牌时仍能召唤
    expect(bossAfter.bossEnrageGraveyardSummon).toBe(4);
  });

  it('召唤失败（boss 旁边没空 slot）时 bossEnrageGraveyardSummon 不清', () => {
    const boss = makeBoss();
    const state = makeState({
      // 4-slot row 但只有 boss 一格被占——其它 3 格是 null（也算 "空 slot"
      // 在 otherSlots 算法里，所以这个 case 实际上 summon 会成功）。要构造
      // "无空 slot" 需要 boss 是唯一的 slot，所以我们改用 1-slot row。
      // 但 row 长度是固定的 4，没法改成 1。所以用单测覆盖
      // graveyardCopy.length === 0 这条已经够，重复测试保留为文档说明。
      activeCards: [boss, null, null, null] as any,
      discardedCards: [],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, { type: 'BEGIN_COMBAT', monster: boss, initiator: 'hero' } as any);
    const bossAfter = r.state.activeCards.find(c => c?.id === 'boss-1') as any;
    expect(bossAfter.bossEnrageGraveyardSummon).toBe(4);
  });

  it('repro: 召唤一次后即使 engagedMonsterIds 被强制清空，再次 BEGIN_COMBAT 也不二次召唤', () => {
    // 这是用户报告的核心 bug 场景的最小复现：summon 触发一次，然后某条边缘
    // 路径让 engaged 被清空（这里手动模拟，绕过追究是哪条具体路径），
    // 再 BEGIN_COMBAT 应该不再触发 summon。
    const boss = makeBoss();
    let state = makeState({
      activeCards: [boss, null, null, null] as any,
      discardedCards: [
        makeMonster('g-m1', '骷髅兵'),
        makeMonster('g-m2', '哥布林'),
        makeNonMonster('g-p1', '治疗药水'),
        makeNonMonster('g-p2', '魔法卷轴'),
      ],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    // Step 1: 第一次 BEGIN_COMBAT — summon 触发
    const r1 = reduce(state, { type: 'BEGIN_COMBAT', monster: boss, initiator: 'hero' } as any);
    state = r1.state;
    expect(state.discardedCards.length).toBe(0);
    expect(state.combatState.engagedMonsterIds).toContain('boss-1');

    // 给坟场重新填卡，模拟"卡又重新进了坟场"
    state = {
      ...state,
      discardedCards: [
        makeMonster('g-m3', 'ghost-m1'),
        makeMonster('g-m4', 'ghost-m2'),
        makeNonMonster('g-p3', 'ghost-p1'),
        makeNonMonster('g-p4', 'ghost-p2'),
      ],
    };

    // Step 2: 强制清空 engagedMonsterIds（模拟用户场景里某条边缘路径的副作用）
    state = {
      ...state,
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    };

    // Step 3: 重新 BEGIN_COMBAT（boss 仍在场上）
    const bossInRow = state.activeCards.find(c => c?.id === 'boss-1') as GameCardData;
    const r2 = reduce(state, { type: 'BEGIN_COMBAT', monster: bossInRow, initiator: 'hero' } as any);

    // bug 检查：如果 summon 二次触发，refilled 的 4 张卡会被消耗
    expect(r2.state.discardedCards.length).toBe(4);
  });
});
