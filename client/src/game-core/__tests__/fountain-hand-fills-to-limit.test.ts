/**
 * 涌泉满手 (fountain-hand) 抽牌补到上限的回归测试
 *
 * 历史 bug：`resolveFountainHand` 调 `drawMultipleFromBackpack(state, drawCount)` 时，
 * `state.handCards` 仍包含涌泉满手自身（FINALIZE 在末尾才剥），但 helper 内部的
 * `currentHand.length >= limit` 守门把自身也算进了，提前 break，少抽 1 张。
 * 修复：传 `ignoreLimit: true`，依赖外层已经按 baseDeficit（排除自身）算好的 drawCount。
 *
 * 这条测试验证："涌泉满手离手 + 抽牌补充" 后，玩家手牌恰好等于 hand limit。
 *
 * 用 PLAY_CARD 走完整 dispatch 链（PLAY_CARD 本体把卡从手牌移除，再 enqueue
 * RESOLVE_MAGIC → resolver → FINALIZE_MAGIC_CARD → ADD_TO_GRAVEYARD）。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import { HAND_LIMIT } from '../constants';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeFountainHand(): GameCardData {
  return {
    id: 'magic-fountain-hand',
    type: 'magic',
    name: '涌泉满手',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'fountain-hand',
    description: '回血并抽牌',
    recycleDelay: 0,
  } as GameCardData;
}

function makeFiller(id: string, name = id): GameCardData {
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'no-op',
    description: '',
    recycleDelay: 0,
  } as GameCardData;
}

describe('涌泉满手 — 手牌补充到上限', () => {
  it('手牌满（含自身 7/7）打出涌泉满手后，手牌应回到 7（上限）', () => {
    const spell = makeFountainHand();
    const handFillers = Array.from({ length: HAND_LIMIT - 1 }, (_, i) => makeFiller(`h-${i}`));
    const backpack = Array.from({ length: 5 }, (_, i) => makeFiller(`bp-${i}`));

    const state = makeState({
      hp: 10,
      maxHp: 30,
      handCards: [...handFillers, spell] as any,
      backpackItems: backpack as any,
    });

    expect(state.handCards.length).toBe(HAND_LIMIT);

    const drained = drain(state, [
      { type: 'PLAY_CARD', cardId: spell.id } as GameAction,
    ]);

    expect(drained.state.handCards.length).toBe(HAND_LIMIT);
    expect(drained.state.handCards.find(c => c.id === spell.id)).toBeUndefined();
    expect(drained.state.hp).toBe(18);
  });

  it('手牌不满（含自身 5/7）打出涌泉满手后，手牌应填到 7', () => {
    const spell = makeFountainHand();
    const handFillers = Array.from({ length: 4 }, (_, i) => makeFiller(`h-${i}`));
    const backpack = Array.from({ length: 5 }, (_, i) => makeFiller(`bp-${i}`));

    const state = makeState({
      hp: 10,
      maxHp: 30,
      handCards: [...handFillers, spell] as any,
      backpackItems: backpack as any,
    });

    expect(state.handCards.length).toBe(5);

    const drained = drain(state, [
      { type: 'PLAY_CARD', cardId: spell.id } as GameAction,
    ]);

    expect(drained.state.handCards.length).toBe(HAND_LIMIT);
    expect(drained.state.handCards.find(c => c.id === spell.id)).toBeUndefined();
  });

  it('背包不足时，手牌应吸纳所有可抽的背包卡（不再被 limit 短路截断）', () => {
    const spell = makeFountainHand();
    const handFillers = Array.from({ length: 4 }, (_, i) => makeFiller(`h-${i}`));
    // baseDeficit 应为 3，但背包只有 2 张
    const backpack = [makeFiller('bp-0'), makeFiller('bp-1')];

    const state = makeState({
      hp: 10,
      maxHp: 30,
      handCards: [...handFillers, spell] as any,
      backpackItems: backpack as any,
    });

    const drained = drain(state, [
      { type: 'PLAY_CARD', cardId: spell.id } as GameAction,
    ]);

    expect(drained.state.handCards.length).toBe(6);
    expect(drained.state.backpackItems.length).toBe(0);
  });
});
