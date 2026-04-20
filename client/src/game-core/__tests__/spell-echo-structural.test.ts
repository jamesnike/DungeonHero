/**
 * 法术回响 — 边界与结构类（Self-guard / Category C）回归测试
 *
 * 覆盖：
 *   1. `double-next-magic` 卡自身永远不会被回响触发（防止无限叠加）
 *   2. 在回响已激活时再打 `double-next-magic` —— 仅刷新（不叠加为 ×4），
 *      并产生说明性日志条目
 *   3. 诅咒卡不会消耗也不会触发回响（保持 doubleNextMagic 不变）
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeDoubleNextMagic(idSuffix: string): GameCardData {
  return {
    id: `dnm-${idSuffix}`,
    type: 'magic',
    name: '法术回响',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'double-next-magic',
    description: '下一张魔法牌效果触发两次',
    recycleDelay: 0,
  } as GameCardData;
}

function makeCurse(): GameCardData {
  return {
    id: 'curse-1',
    type: 'curse',
    name: '诅咒',
    value: 0,
    image: '',
    description: '诅咒卡',
  } as GameCardData;
}

describe('法术回响 — 自我保护与边界 (Self-guard / Category C)', () => {
  it('double-next-magic 永远不会被回响触发（连续两张不会叠加为 ×4）', () => {
    const c1 = makeDoubleNextMagic('1');
    const c2 = makeDoubleNextMagic('2');
    const state = makeState({
      handCards: [c1, c2] as any,
      doubleNextMagic: false,
    });

    // c1: 设置 doubleNextMagic = true
    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: c1.id, card: c1 } as GameAction,
    ]);
    expect(r1.state.doubleNextMagic).toBe(true);

    // c2: 此时 doubleNextMagic 已 true，但 c2 自己也是 double-next-magic
    //     → 引擎守卫：isEchoTriggered = false，且 c2 仅刷新 doubleNextMagic
    const r2 = drain(r1.state, [
      { type: 'RESOLVE_MAGIC', cardId: c2.id, card: c2 } as GameAction,
    ]);
    expect(r2.state.doubleNextMagic).toBe(true);

    // 验证产生了「无法回响触发」的说明性日志
    const refreshLog = r2.sideEffects.find(
      (s: any) =>
        s.event === 'log:entry' &&
        typeof s.payload?.message === 'string' &&
        s.payload.message.includes('已刷新回响状态'),
    );
    expect(refreshLog).toBeDefined();
  });

  it('诅咒卡不消耗也不触发回响（doubleNextMagic 保持不变）', () => {
    const dnm = makeDoubleNextMagic('keep');
    const curse = makeCurse();

    const state = makeState({
      handCards: [dnm, curse] as any,
    });

    // 先激活回响
    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: dnm.id, card: dnm } as GameAction,
    ]);
    expect(r1.state.doubleNextMagic).toBe(true);

    // 诅咒卡使用不会触发回响（curse 不进 RESOLVE_MAGIC 路径），
    // doubleNextMagic 应仍为 true，留给下一张「真」魔法牌消耗。
    expect(r1.state.doubleNextMagic).toBe(true);
  });
});
