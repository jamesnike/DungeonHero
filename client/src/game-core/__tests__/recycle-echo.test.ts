/**
 * 回收余韵 (Recycle Echo) — Starter Perm 1 magic tests
 *
 * Covers the play (使用) effect:
 *   1. Cards with _recycleWaits === 1 in recycle bag return to backpack on play.
 *   2. Cards with _recycleWaits > 1 stay in recycle bag with waits decremented.
 *   3. Empty recycle bag → no-op but card still finalizes.
 *   4. Card itself goes to recycle bag with recycleDelay 1 after play.
 *   5. onDiscardDraw triggers when the card is recycled (play path).
 *   6. onDiscardDraw also triggers when the card is discarded by another effect
 *      (e.g. 专属召唤) — covered via the standard DISCARD_OWNED_CARD pipeline.
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
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // After play:
    //   1. Use effect moves r1, r2 from recycle bag → backpack.
    //   2. onDiscardDraw=1 then draws 1 card from backpack → hand.
    // So r1+r2 are split between backpack and hand, none left in recycle bag.
    const ids = new Set([
      ...result.state.backpackItems.map(c => c.id),
      ...result.state.handCards.map(c => c.id),
    ]);
    expect(ids.has('bag-r1')).toBe(true);
    expect(ids.has('bag-r2')).toBe(true);
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
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // mix-r goes bag → backpack; onDiscardDraw=1 may draw it into hand. Either is fine.
    const inBackpackOrHand =
      result.state.backpackItems.some(c => c.id === 'bag-mix-r') ||
      result.state.handCards.some(c => c.id === 'bag-mix-r');
    expect(inBackpackOrHand).toBe(true);
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

  it('use effect alone does NOT draw cards (proven by overriding onDiscardDraw to 0)', () => {
    const card = makeRecycleEcho({ onDiscardDraw: 0 });
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

    // Without onDiscardDraw, the use effect itself never draws.
    expect(result.state.handCards.some(c => c.id === 'bp-filler')).toBe(false);
    expect(result.state.backpackItems.some(c => c.id === 'bp-filler')).toBe(true);
  });
});

describe('回收余韵 被回收效果 (onDiscardDraw — play 路径)', () => {
  it('triggers onDiscardDraw=1 → draws 1 card from backpack on play', () => {
    const card = makeRecycleEcho(); // onDiscardDraw: 1
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

    // Played card itself goes to recycle bag (recycleDelay 1).
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    // onDiscardDraw=1 pulled bp-filler from backpack into hand.
    expect(result.state.handCards.some(c => c.id === 'bp-filler')).toBe(true);
    expect(result.state.backpackItems.some(c => c.id === 'bp-filler')).toBe(false);
  });

  it('triggers upgraded onDiscardDraw=2 → draws 2 cards on play', () => {
    const card = makeRecycleEcho({ onDiscardDraw: 2 });
    const fillers: GameCardData[] = [
      { id: 'bp-1', type: 'potion', name: '袋1', value: 0, image: '' } as GameCardData,
      { id: 'bp-2', type: 'potion', name: '袋2', value: 0, image: '' } as GameCardData,
      { id: 'bp-3', type: 'potion', name: '袋3', value: 0, image: '' } as GameCardData,
    ];
    const state = makeState({
      handCards: [card],
      backpackItems: fillers,
      permanentMagicRecycleBag: [],
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const drawnCount = result.state.handCards.filter(c => c.id.startsWith('bp-')).length;
    expect(drawnCount).toBe(2);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('triggers onDiscardDraw even when recycle bag is empty (use effect no-op + draw still fires)', () => {
    const card = makeRecycleEcho(); // onDiscardDraw: 1
    const filler: GameCardData = {
      id: 'bp-only',
      type: 'potion',
      name: '袋',
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

    expect(result.state.handCards.some(c => c.id === 'bp-only')).toBe(true);
  });

  it('does NOT trigger catapult / discard-zap amulet effects on play (toRecycleBag opt set)', () => {
    // Catapult amulet (弹射护符) and discard-zap (弃能护符) are skipped when
    // opts.toRecycleBag === true. We assert by reading the log: there should be
    // no "弹射护符" or "弃能" entry from playing 回收余韵.
    const card = makeRecycleEcho();
    const state = makeState({
      handCards: [card],
      backpackItems: [{ id: 'bp', type: 'potion', name: '袋', value: 0, image: '' } as GameCardData],
      permanentMagicRecycleBag: [],
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const logText = (result.state.gameLog ?? []).map(e => e.message ?? '').join('\n');
    expect(logText).not.toContain('弹射护符');
    expect(logText).not.toContain('弃能');
  });
});

describe('回收余韵 被回收效果 (onDiscardDraw — discard 路径)', () => {
  it('triggers onDiscardDraw when discarded by 专属召唤 (DISCARD_OWNED_CARD pipeline)', () => {
    // Standard DISCARD_OWNED_CARD path: permanent magic → recycle bag + APPLY_DISCARD_EFFECTS.
    const card = makeRecycleEcho(); // onDiscardDraw: 1
    const filler: GameCardData = {
      id: 'bp-filler',
      type: 'potion',
      name: '袋',
      value: 0,
      image: '',
    } as GameCardData;
    const state = makeState({
      backpackItems: [filler],
      permanentMagicRecycleBag: [],
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'DISCARD_OWNED_CARD', card, owner: 'player' } as GameAction,
    ]);

    // Card routed to recycle bag (it's permanent), not graveyard.
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(false);
    // onDiscardDraw=1 fired.
    expect(result.state.handCards.some(c => c.id === 'bp-filler')).toBe(true);
  });
});
