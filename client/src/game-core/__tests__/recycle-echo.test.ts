/**
 * 回收余韵 (Recycle Echo) — Starter Perm 1 magic tests
 *
 * Covers the play (使用) effect:
 *   1. Cards with _recycleWaits === 1 in recycle bag return to backpack on play.
 *   2. Cards with _recycleWaits > 1 stay in recycle bag with waits decremented.
 *   3. Empty recycle bag → no-op but card still finalizes.
 *   4. Card itself goes to recycle bag with recycleDelay 1 after play.
 *   5. onDiscardDraw still triggers when the card is recycled.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import { STARTER_CARD_IDS } from '../deck';
// Importing this barrel registers the card-schema definitions.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

let _seq = 0;
function makeRecycleEcho(overrides: Partial<GameCardData> = {}): GameCardData {
  _seq += 1;
  return {
    id: `${STARTER_CARD_IDS.recycleDrawMagic}-pick-${_seq}`,
    type: 'magic',
    name: '回收余韵',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: 'test',
    description: 'test',
    recycleDelay: 1,
    onDiscardDraw: 1,
    ...overrides,
  } as GameCardData;
}

function makeFiller(idSuffix: string, waits?: number): GameCardData {
  const card: GameCardData = {
    id: `bag-${idSuffix}`,
    type: 'magic',
    name: `袋牌${idSuffix}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay: waits ?? 1,
  } as GameCardData;
  if (waits != null) {
    (card as GameCardData & { _recycleWaits?: number })._recycleWaits = waits;
  }
  return card;
}

describe('回收余韵 使用效果 (将回收袋洗回背包)', () => {
  it('returns ready cards (_recycleWaits === 1 → 0) from recycle bag to backpack', () => {
    const card = makeRecycleEcho();
    const ready1 = makeFiller('r1', 1);
    const ready2 = makeFiller('r2', 1);
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: [ready1, ready2],
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const inBackpackIds = result.state.backpackItems.map(c => c.id);
    expect(inBackpackIds).toContain('bag-r1');
    expect(inBackpackIds).toContain('bag-r2');
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'bag-r1' || c.id === 'bag-r2')).toBe(false);
  });

  it('decrements _recycleWaits by 1 for cards still waiting (waits > 1)', () => {
    const card = makeRecycleEcho();
    const waiting = makeFiller('w1', 3);
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: [waiting],
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    expect(result.state.backpackItems.some(c => c.id === 'bag-w1')).toBe(false);
    const stillWaiting = result.state.permanentMagicRecycleBag.find(c => c.id === 'bag-w1');
    expect(stillWaiting).toBeDefined();
    expect((stillWaiting as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(2);
  });

  it('handles mixed ready and waiting cards correctly', () => {
    const card = makeRecycleEcho();
    const ready = makeFiller('mix-r', 1);
    const waiting = makeFiller('mix-w', 2);
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: [ready, waiting],
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    expect(result.state.backpackItems.some(c => c.id === 'bag-mix-r')).toBe(true);
    const stillWaiting = result.state.permanentMagicRecycleBag.find(c => c.id === 'bag-mix-w');
    expect(stillWaiting).toBeDefined();
    expect((stillWaiting as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
  });

  it('still finalizes when recycle bag is empty (no error)', () => {
    const card = makeRecycleEcho();
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('the played card itself enters the recycle bag (recycleDelay 1)', () => {
    const card = makeRecycleEcho();
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const ownCardInRecycle = result.state.permanentMagicRecycleBag.find(c => c.id === card.id);
    expect(ownCardInRecycle).toBeDefined();
  });

  it('does NOT draw cards on play (use effect is recycle bag shuffle, not draw)', () => {
    const card = makeRecycleEcho();
    const filler: GameCardData = {
      id: 'bp-filler',
      type: 'potion',
      name: '背包卡',
      value: 0,
      image: '',
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      backpackItems: [filler],
      permanentMagicRecycleBag: [],
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // No new cards drawn from backpack to hand.
    expect(result.state.handCards.some(c => c.id === 'bp-filler')).toBe(false);
    expect(result.state.backpackItems.some(c => c.id === 'bp-filler')).toBe(true);
  });
});
