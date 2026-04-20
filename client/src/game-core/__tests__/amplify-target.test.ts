/**
 * Regression: 「增幅：XX」永久魔法卡（magicEffect: 'amplify-target'）的目标校验
 *
 * 旧逻辑：要求被增幅的"原始那张卡"按 _amplifyTargetCardId 仍在装备栏或手牌中，
 * 否则直接拒绝（"无法增幅"）且不调用 AMPLIFY_CARDS_BY_NAME。
 *
 * 用户场景：玩家用「增幅」magic 选中手牌中的「魔弹」生成 Perm 2 卡，
 * 期间把那张原始「魔弹」打掉了 → 后续打出「增幅：魔弹」时旧校验失败 → 全场所有「魔弹」
 * 仍然显示 1 点法术伤害。
 *
 * 修复：移除 ID 校验，按 _amplifyTargetName 走 AMPLIFY_CARDS_BY_NAME。
 * 即使全场已无同名卡，也会记入 amplifiedCardBonus map，未来生成的同名卡会自动应用累计加成。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction, GameCardData } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeAmplifyPermCard(targetName: string, opts: { id?: string; targetCardId?: string } = {}): GameCardData {
  return {
    id: opts.id ?? 'amp-perm-1',
    type: 'magic',
    name: `增幅：${targetName}`,
    value: 0,
    magicType: 'permanent',
    magicEffect: 'amplify-target',
    description: `永久魔法（Perm 2）：对「${targetName}」进行增幅。`,
    recycleDelay: 2,
    _amplifyTargetCardId: opts.targetCardId,
    _amplifyTargetName: targetName,
  } as GameCardData;
}

function makeBolt(id: string, amplifyBonus = 0): GameCardData {
  return {
    id,
    type: 'magic',
    name: '魔弹',
    value: 0,
    magicType: 'instant',
    knightEffect: 'missile-bolt',
    amplifyBonus,
  } as GameCardData;
}

describe('「增幅：XX」(amplify-target) — 目标校验放宽到按 NAME', () => {
  it('REGRESSION: 原始 _amplifyTargetCardId 不在装备/手牌时仍能 +2（坟场内同名卡也获得增幅）', () => {
    const ampPerm = makeAmplifyPermCard('魔弹', { targetCardId: 'h-bolt-original' });
    const graveBolt = makeBolt('gy-bolt-1');
    const state = makeState({
      handCards: [],
      discardedCards: [graveBolt] as any,
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
    ]);

    expect(drained.state.amplifiedCardBonus['魔弹']).toBe(2);
    const updatedGraveBolt = drained.state.discardedCards.find(c => c.id === 'gy-bolt-1');
    expect(updatedGraveBolt?.amplifyBonus).toBe(2);

    const rejectionLog = drained.sideEffects.find(
      s => s.event === 'banner:show' && (s.payload as any)?.message?.includes('无法增幅'),
    );
    expect(rejectionLog).toBeUndefined();
  });

  it('原始目标在手牌：手牌中的同名卡获得 +2', () => {
    const handBolt = makeBolt('h-bolt-1');
    const ampPerm = makeAmplifyPermCard('魔弹', { targetCardId: 'h-bolt-1' });
    const state = makeState({
      handCards: [handBolt] as any,
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
    ]);

    expect(drained.state.amplifiedCardBonus['魔弹']).toBe(2);
    const updatedHandBolt = drained.state.handCards.find(c => c.id === 'h-bolt-1');
    expect(updatedHandBolt?.amplifyBonus).toBe(2);
  });

  it('全场无同名卡：仍然写入 amplifiedCardBonus map（累计），未来生成的同名卡可自动获得加成', () => {
    const ampPerm = makeAmplifyPermCard('魔弹', { targetCardId: 'gone-bolt' });
    const state = makeState({
      handCards: [],
      backpackItems: [],
      discardedCards: [],
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
    ]);

    expect(drained.state.amplifiedCardBonus['魔弹']).toBe(2);
  });

  it('已有 amplifiedCardBonus 累计：再次打出「增幅：魔弹」累加（map 4，且现存同名卡 +2 = +4 总）', () => {
    const handBolt = makeBolt('h-bolt-1', 2);
    const ampPerm = makeAmplifyPermCard('魔弹');
    const state = makeState({
      handCards: [handBolt] as any,
      amplifiedCardBonus: { 魔弹: 2 },
    });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
    ]);

    expect(drained.state.amplifiedCardBonus['魔弹']).toBe(4);
    const updatedHandBolt = drained.state.handCards.find(c => c.id === 'h-bolt-1');
    expect(updatedHandBolt?.amplifyBonus).toBe(4);
  });

  it('卡牌结构异常：缺少 _amplifyTargetName 时拒绝且不入队 AMPLIFY_CARDS_BY_NAME', () => {
    const malformed: GameCardData = {
      id: 'amp-bad',
      type: 'magic',
      name: '增幅：未知',
      value: 0,
      magicType: 'permanent',
      magicEffect: 'amplify-target',
    } as GameCardData;
    const state = makeState({ amplifiedCardBonus: {} });

    const result = reduce(state, { type: 'RESOLVE_MAGIC', cardId: malformed.id, card: malformed } as GameAction);

    const ampAction = result.enqueuedActions.find(a => a.type === 'AMPLIFY_CARDS_BY_NAME');
    expect(ampAction).toBeUndefined();
    expect(result.state.amplifiedCardBonus['魔弹'] ?? 0).toBe(0);
  });
});
