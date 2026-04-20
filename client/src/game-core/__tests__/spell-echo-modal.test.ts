/**
 * 法术回响 — 模态类（Modal / 类别 B）回归测试
 *
 * 覆盖：当回响触发时，模态卡（让玩家选择目标的卡）应在第一次结算后再次弹窗，
 * 让玩家做第二次选择。
 *
 * 选择「魔弹 / missile-bolt」作为代表（场上多个怪物时弹窗）。
 *
 * 验证：
 *   - 第一次弹窗时 pendingMagicAction.echoRemaining === 2
 *   - 玩家选完第一个怪物后：第一个怪物中弹，pendingMagicAction 仍存在且 echoRemaining === 1
 *   - 玩家选第二个怪物后：第二个怪物中弹，pendingMagicAction 清空
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

function makeMissileBolt(): GameCardData {
  return {
    id: 'magic-missile-bolt',
    type: 'magic',
    name: '魔弹',
    value: 0,
    image: '',
    magicType: 'instant',
    knightEffect: 'missile-bolt',
    description: '对一个怪物造成法术伤害',
    recycleDelay: 0,
  } as GameCardData;
}

function makeMonster(id: string, name: string, hp: number): GameCardData {
  return {
    id,
    type: 'monster',
    name,
    value: hp,
    image: '',
    hp,
    maxHp: hp,
    attack: 1,
  } as GameCardData;
}

describe('法术回响 — 模态类 re-prompt (Category B)', () => {
  it('魔弹（多个怪物）：回响触发后玩家须做两次目标选择', () => {
    const card = makeMissileBolt();
    const m1 = makeMonster('mon-1', '哥布林甲', 10);
    const m2 = makeMonster('mon-2', '哥布林乙', 10);

    const state = makeState({
      handCards: [card] as any,
      doubleNextMagic: true,
      activeCards: [m1, null, m2, null, null] as any,
      hp: 20,
      maxHp: 20,
    });

    // Step 1: 打出魔弹 → 触发回响 → 弹窗 monster-select，echoRemaining=2
    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    expect(r1.state.pendingMagicAction).toBeTruthy();
    expect((r1.state.pendingMagicAction as any).effect).toBe('missile-bolt');
    expect((r1.state.pendingMagicAction as any).echoRemaining).toBe(2);
    expect(r1.state.doubleNextMagic).toBe(false);

    // Step 2: 玩家选择第一个怪物 → 受伤；echoRemaining 应该剩 1，弹窗仍开
    // Reset phase to 'idle' so the pipeline doesn't pause before processing the
    // player's response (drain pauses if phase is in INPUT_PHASES and the next
    // action is not a known input-continuation).
    const r2 = drain({ ...r1.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: card.id, monsterId: 'mon-1' } as GameAction,
    ]);
    const m1AfterHit = (r2.state.activeCards as any[]).find((c: any) => c?.id === 'mon-1');
    expect(m1AfterHit?.hp).toBeLessThan(10);
    expect(r2.state.pendingMagicAction).toBeTruthy();
    expect((r2.state.pendingMagicAction as any).echoRemaining).toBe(1);

    // Step 3: 玩家选择第二个怪物 → 第二次结算后弹窗清空
    const r3 = drain({ ...r2.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: card.id, monsterId: 'mon-2' } as GameAction,
    ]);
    const m2AfterHit = (r3.state.activeCards as any[]).find((c: any) => c?.id === 'mon-2');
    expect(m2AfterHit?.hp).toBeLessThan(10);
    expect(r3.state.pendingMagicAction).toBeNull();
  });

  it('魔弹（场上仅一个怪物）：回响通过 echoMultiplier 直接折成 ×2 伤害（无第二个目标可选）', () => {
    const card = makeMissileBolt();
    const m1 = makeMonster('mon-1', '哥布林甲', 20);

    const state = makeState({
      handCards: [card] as any,
      doubleNextMagic: true,
      activeCards: [m1, null, null, null, null] as any,
      hp: 20,
      maxHp: 20,
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);

    // 单怪路径不开弹窗，直接结算两次伤害（1×2 = 2 点法术伤害）
    expect(drained.state.pendingMagicAction).toBeNull();
    expect(drained.state.doubleNextMagic).toBe(false);
    const m1After = (drained.state.activeCards as any[]).find((c: any) => c?.id === 'mon-1');
    expect(m1After?.hp).toBe(20 - 2);
  });
});
