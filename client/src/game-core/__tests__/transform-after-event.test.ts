/**
 * Regression test for the bug where 「转型 +3 金币」 (transformBonus 'gold:3') granted
 * by 附魔祭坛 (Enchantment Altar) to a magic card did not trigger after the player
 * first played an Event in the active row.
 *
 * Root cause: magic-effects.ts resolvers write `lastPlayedCardCategory` to the
 * current card's category BEFORE `APPLY_TRANSFORM_CATEGORY` runs. The transform
 * check used `state.lastPlayedCardCategory`, so prevCat appeared equal to curCat
 * and the transform never fired. Fix: use `state.transformChainPrevCategory`,
 * which is only updated by `APPLY_TRANSFORM_CATEGORY` itself.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('转型触发：使用 Event 后再使用带 transform 的 magic 卡', () => {
  it('附魔祭坛赋予查阅动作「转型 +3 金币」后，先用 Event 再用查阅动作时应触发转型', () => {
    const surveyCard: GameCardData = {
      id: 'survey-1',
      type: 'magic',
      name: '查阅动作',
      value: 0,
      image: '',
      magicType: 'permanent',
      magicEffect: '永久魔法：从背包抽 1 张牌。',
      transformBonus: '+3 金币',
      transformEffect: 'gold:3',
    } as GameCardData;

    // Simulate: an event was just resolved (drag-from-dungeon flow already
    // dispatched APPLY_TRANSFORM_CATEGORY for the event card), so both
    // lastPlayedCardCategory and transformChainPrevCategory are 'event'.
    const eventCard = { id: 'evt', type: 'event' as const, name: 'Test Event', value: 0 } as GameCardData;
    const baseState = makeState({ gold: 10 });
    const afterEvent = reduce(baseState, {
      type: 'APPLY_TRANSFORM_CATEGORY',
      card: eventCard,
    } as GameAction).state;

    expect(afterEvent.lastPlayedCardCategory).toBe('event');
    expect(afterEvent.transformChainPrevCategory).toBe('event');

    // Simulate the magic resolver step: it writes lastPlayedCardCategory to
    // 'perm-magic' BEFORE APPLY_TRANSFORM_CATEGORY runs. We mimic that by
    // calling SET_LAST_PLAYED_CATEGORY (combat.ts handler).
    const afterMagicResolver = reduce(afterEvent, {
      type: 'SET_LAST_PLAYED_CATEGORY',
      category: 'perm-magic',
    } as GameAction).state;

    expect(afterMagicResolver.lastPlayedCardCategory).toBe('perm-magic');
    // transformChainPrevCategory is unaffected by SET_LAST_PLAYED_CATEGORY.
    expect(afterMagicResolver.transformChainPrevCategory).toBe('event');

    // Now APPLY_TRANSFORM_CATEGORY for the magic card. Before the fix this
    // returned without firing because state.lastPlayedCardCategory ('perm-magic')
    // matched curCat ('perm-magic'). After the fix it uses
    // transformChainPrevCategory ('event') which differs from curCat, so the
    // transform fires and the player gains 3 gold.
    const result = reduce(afterMagicResolver, {
      type: 'APPLY_TRANSFORM_CATEGORY',
      card: surveyCard,
    } as GameAction);

    expect(result.state.gold).toBe(13);
    expect(result.state.transformChainPrevCategory).toBe('perm-magic');
    expect(result.sideEffects?.some(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.includes('转型触发')
    )).toBe(true);
  });

  it('同类型连出（perm-magic 后 perm-magic）不应触发转型', () => {
    const card: GameCardData = {
      id: 'survey-2',
      type: 'magic',
      name: '查阅动作',
      value: 0,
      image: '',
      magicType: 'permanent',
      transformBonus: '+3 金币',
      transformEffect: 'gold:3',
    } as GameCardData;

    const baseState = makeState({
      gold: 10,
      lastPlayedCardCategory: 'perm-magic',
      transformChainPrevCategory: 'perm-magic',
    });

    const result = reduce(baseState, {
      type: 'APPLY_TRANSFORM_CATEGORY',
      card,
    } as GameAction);

    expect(result.state.gold).toBe(10);
  });

  it('首次出牌（无前置类型）不应触发转型', () => {
    const card: GameCardData = {
      id: 'survey-3',
      type: 'magic',
      name: '查阅动作',
      value: 0,
      image: '',
      magicType: 'permanent',
      transformBonus: '+3 金币',
      transformEffect: 'gold:3',
    } as GameCardData;

    const baseState = makeState({ gold: 10 });

    const result = reduce(baseState, {
      type: 'APPLY_TRANSFORM_CATEGORY',
      card,
    } as GameAction);

    expect(result.state.gold).toBe(10);
    expect(result.state.transformChainPrevCategory).toBe('perm-magic');
  });
});
