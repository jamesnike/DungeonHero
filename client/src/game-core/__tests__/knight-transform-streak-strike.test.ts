/**
 * 连环转律 (knightEffect: transform-streak-strike, unique)
 *
 * 该卡之前在 起始背包，现已迁移到 专属卡池：
 *   - 路由从 starter-id (`starter:starter-perm-transform-streak-strike`)
 *     改为 knightEffect (`knight:transform-streak-strike`)
 *   - 标记 `unique: true`，每局至多 1 张
 *
 * 通过 PLAY_CARD → drain 走完整反应器/分发管线，验证 pendingMagicAction、
 * 转型链伤害计算、断链、回响等行为。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
// Importing this barrel registers all card definitions including
// `knight:transform-streak-strike`.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    ...overrides,
  };
}

let __idCounter = 0;
function makeTransformStreakCard(): GameCardData {
  return {
    id: `knight-transform-streak-${__idCounter++}`,
    type: 'magic',
    name: '连环转律',
    value: 0,
    image: '',
    classCard: true,
    unique: true,
    magicType: 'permanent',
    description: 'test',
    knightEffect: 'transform-streak-strike',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  } as unknown as GameCardData;
}

function makeMonster(id: string, hp = 5, attack = 1): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: 1,
    image: '',
    hp,
    maxHp: hp,
    attack,
  } as GameCardData;
}

describe('连环转律 (knight:transform-streak-strike)', () => {
  it('先前没有出过牌（链空）→ X=1（含本牌） → 1 点伤害', () => {
    const card = makeTransformStreakCard();
    const monster = makeMonster('m1', 10);
    const state = makeState({
      handCards: [card],
      activeCards: [monster, null, null, null, null] as any,
      lastPlayedCardCategory: null,
      transformChainPrevCategory: null,
      consecutiveTransformStreak: 0,
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(r1.state.pendingMagicAction).toBeTruthy();
    const result = drain({ ...r1.state, phase: 'idle' } as any, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'transform-streak-strike', monsterId: 'm1' } as GameAction,
    ]);
    const targetAfter = (result.state.activeCards as any[]).find(c => c?.id === 'm1');
    expect(targetAfter?.hp).toBe(9);
  });

  it('上张牌为 potion（streak=1），本张为 perm-magic → X=2 → 2 点伤害', () => {
    const card = makeTransformStreakCard();
    const monster = makeMonster('m1', 10);
    const state = makeState({
      handCards: [card],
      activeCards: [monster, null, null, null, null] as any,
      lastPlayedCardCategory: 'potion',
      transformChainPrevCategory: 'potion',
      consecutiveTransformStreak: 1,
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(r1.state.pendingMagicAction).toBeTruthy();
    const result = drain({ ...r1.state, phase: 'idle' } as any, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'transform-streak-strike', monsterId: 'm1' } as GameAction,
    ]);
    const targetAfter = (result.state.activeCards as any[]).find(c => c?.id === 'm1');
    expect(targetAfter?.hp).toBe(8);
  });

  it('连续转型 streak=3 → X=4 → 4 点伤害', () => {
    const card = makeTransformStreakCard();
    const monster = makeMonster('m1', 20);
    const state = makeState({
      handCards: [card],
      activeCards: [monster, null, null, null, null] as any,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
      consecutiveTransformStreak: 3,
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(r1.state.pendingMagicAction).toBeTruthy();
    const result = drain({ ...r1.state, phase: 'idle' } as any, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'transform-streak-strike', monsterId: 'm1' } as GameAction,
    ]);
    const targetAfter = (result.state.activeCards as any[]).find(c => c?.id === 'm1');
    expect(targetAfter?.hp).toBe(16);
  });

  it('多怪存在时打开 monster-select 弹窗（pendingMagicAction）', () => {
    const card = makeTransformStreakCard();
    const m1 = makeMonster('m1', 10);
    const m2 = makeMonster('m2', 10);
    const state = makeState({
      handCards: [card],
      activeCards: [m1, m2, null, null, null] as any,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
      consecutiveTransformStreak: 2,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('transform-streak-strike');
    expect((result.state.pendingMagicAction as any).step).toBe('monster-select');
    expect((result.state.pendingMagicAction as any).data?.streak).toBe(3);
  });

  it('上一张同为 perm-magic（连环转律自身）→ 同类型断链 → 0 伤害', () => {
    const card = makeTransformStreakCard();
    const monster = makeMonster('m1', 10);
    const state = makeState({
      handCards: [card],
      activeCards: [monster, null, null, null, null] as any,
      lastPlayedCardCategory: 'perm-magic',
      transformChainPrevCategory: 'perm-magic',
      consecutiveTransformStreak: 5,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const targetAfter = (result.state.activeCards as any[]).find(c => c?.id === 'm1');
    expect(targetAfter?.hp).toBe(10);
  });

  it('卡定义带 unique: true 标记', () => {
    const card = makeTransformStreakCard();
    expect((card as any).unique).toBe(true);
    expect((card as any).knightEffect).toBe('transform-streak-strike');
    expect((card as any).classCard).toBe(true);
  });
});
