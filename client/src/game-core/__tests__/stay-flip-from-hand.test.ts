/**
 * Stay-flip on event played from hand: toCard must land in hand
 *
 * Bug: when an event is used FROM HAND (not from the active row) and has a
 * `flipTarget` with `destination: 'stay'`, the flipped result was silently
 * dropped unless `flip.toCard.type === 'event'`. All other types (magic /
 * amulet / building / potion / monster) disappeared with no log, no card
 * landing anywhere — the player just lost the card outright.
 *
 * Fix (rules/cards.ts `reduceApplyCardFlip`): when `destination === 'stay'`
 * and the source card is NOT in `activeCards` (idx === -1), unconditionally
 * add `flip.toCard` to `handCards`. Semantically "stay" means "stay in
 * current owner"; an event played from hand means current owner = hand.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeEventWithStayFlip(toCardOverrides: Partial<GameCardData>): GameCardData {
  return {
    id: 'evt-from-hand-1',
    type: 'event' as const,
    name: 'Test Event',
    value: 0,
    image: '',
    description: 'test',
    flipTarget: {
      toCard: {
        id: 'flip-result-1',
        value: 0,
        image: '',
        ...toCardOverrides,
      } as GameCardData,
      destination: 'stay' as const,
      message: 'flipped!',
    },
  } as unknown as GameCardData;
}

describe('APPLY_CARD_FLIP: stay-flip on event used from hand', () => {
  it('toCard.type === "magic" → adds flipped magic to hand (was: silently dropped)', () => {
    const evt = makeEventWithStayFlip({
      type: 'magic' as const,
      name: '测试魔法',
      magicType: 'instant',
    });

    // Event lives in hand, NOT in activeCards. cellIndex: -1 simulates the
    // value that COMPLETE_EVENT passes when `eventCellIdx === -1`.
    const state = makeState({
      handCards: [evt],
      activeCards: [null, null, null, null, null] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_CARD_FLIP',
      card: evt,
      cellIndex: -1,
    } as any);

    const flipped = result.state.handCards.find(c => c.id === 'flip-result-1');
    expect(flipped).toBeDefined();
    expect(flipped?.name).toBe('测试魔法');
    expect(flipped?.type).toBe('magic');
    expect((flipped as any)?._flipBackCard?.id).toBe('evt-from-hand-1');

    expect(result.state.activeCards.every(c => c == null)).toBe(true);

    expect(result.sideEffects.some(e => e.event === 'event:cardTransformed')).toBe(true);
    expect(result.sideEffects.some(e => e.event === 'card:flippedInCell')).toBe(false);
    expect(
      result.sideEffects.some(
        e => e.event === 'log:entry' && (e.payload as any).message === '测试魔法 加入手牌',
      ),
    ).toBe(true);
  });

  it('toCard.type === "amulet" → adds flipped amulet to hand', () => {
    const evt = makeEventWithStayFlip({
      type: 'amulet' as const,
      name: '测试护符',
    });

    const state = makeState({
      handCards: [evt],
      activeCards: [null, null, null, null, null] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_CARD_FLIP',
      card: evt,
      cellIndex: -1,
    } as any);

    const flipped = result.state.handCards.find(c => c.id === 'flip-result-1');
    expect(flipped).toBeDefined();
    expect(flipped?.type).toBe('amulet');
    expect(flipped?.name).toBe('测试护符');
  });

  it('toCard.type === "building" → adds flipped building to hand', () => {
    const evt = makeEventWithStayFlip({
      type: 'building' as const,
      name: '测试建筑',
    });

    const state = makeState({
      handCards: [evt],
      activeCards: [null, null, null, null, null] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_CARD_FLIP',
      card: evt,
      cellIndex: -1,
    } as any);

    const flipped = result.state.handCards.find(c => c.id === 'flip-result-1');
    expect(flipped).toBeDefined();
    expect(flipped?.type).toBe('building');
  });

  it('toCard.type === "potion" → adds flipped potion to hand', () => {
    const evt = makeEventWithStayFlip({
      type: 'potion' as const,
      name: '测试药剂',
      potionEffect: 'heal-5' as any,
    });

    const state = makeState({
      handCards: [evt],
      activeCards: [null, null, null, null, null] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_CARD_FLIP',
      card: evt,
      cellIndex: -1,
    } as any);

    const flipped = result.state.handCards.find(c => c.id === 'flip-result-1');
    expect(flipped).toBeDefined();
    expect(flipped?.type).toBe('potion');
  });

  it('toCard.type === "event" → still adds flipped event to hand (existing behavior preserved)', () => {
    const evt = makeEventWithStayFlip({
      type: 'event' as const,
      name: '后续事件',
      eventChoices: [{ text: 'A', effect: 'noop' }] as any,
    });

    const state = makeState({
      handCards: [evt],
      activeCards: [null, null, null, null, null] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_CARD_FLIP',
      card: evt,
      cellIndex: -1,
    } as any);

    const flipped = result.state.handCards.find(c => c.id === 'flip-result-1');
    expect(flipped).toBeDefined();
    expect(flipped?.type).toBe('event');
  });

  it('preserves _flipBackCard so the original event can be flipped back via 乾坤一翻', () => {
    const evt = makeEventWithStayFlip({
      type: 'magic' as const,
      name: '测试魔法',
    });

    const state = makeState({
      handCards: [evt],
      activeCards: [null, null, null, null, null] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_CARD_FLIP',
      card: evt,
      cellIndex: -1,
    } as any);

    const flipped = result.state.handCards.find(c => c.id === 'flip-result-1');
    expect((flipped as any)?._flipBackCard?.id).toBe('evt-from-hand-1');
    expect((flipped as any)?._flipBackCard?.name).toBe('Test Event');
  });

  it('does NOT touch activeCards when source is not in active row', () => {
    const evt = makeEventWithStayFlip({
      type: 'magic' as const,
      name: '测试魔法',
    });
    const filler = {
      id: 'm-filler', type: 'monster' as const, name: 'Goblin', value: 0,
      hp: 5, maxHp: 5, attack: 1,
    } as unknown as GameCardData;

    const state = makeState({
      handCards: [evt],
      activeCards: [filler, null, null, null, null] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_CARD_FLIP',
      card: evt,
      cellIndex: -1,
    } as any);

    expect(result.state.activeCards[0]?.id).toBe('m-filler');
    expect(result.state.activeCards.slice(1).every(c => c == null)).toBe(true);
  });

  it('regression: source event in activeCards still flips in-place (cellIndex omitted, idx looked up)', () => {
    const evt = makeEventWithStayFlip({
      type: 'magic' as const,
      name: '测试魔法',
    });

    const state = makeState({
      handCards: [],
      activeCards: [null, null, evt, null, null] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_CARD_FLIP',
      card: evt,
      // cellIndex omitted on purpose — reduceApplyCardFlip should fall back to
      // findIndex on activeCards and place the flipped card in slot 2.
    } as any);

    expect(result.state.activeCards[2]?.id).toBe('flip-result-1');
    expect(result.state.activeCards[2]?.name).toBe('测试魔法');
    expect(result.state.handCards).toHaveLength(0);

    expect(result.sideEffects.some(e => e.event === 'card:flippedInCell')).toBe(true);
    expect(result.sideEffects.some(e => e.event === 'event:cardTransformed')).toBe(false);
  });
});
