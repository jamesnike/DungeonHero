/**
 * 回收余韵 (Recycle Echo) — Starter Perm 1 magic tests
 *
 * Semantics:
 *   - Use effect: randomly pick N cards from the recycle bag and decrement
 *     their `_recycleWaits` by 1. Cards reaching 0 → backpack (subject to cap).
 *     Unpicked cards remain unchanged.
 *   - N depends on upgradeLevel: 1 (Lv0) / 2 (Lv1) / 3 (Lv2).
 *   - **No "被回收时抽牌" effect** (onDiscardDraw was removed by user request).
 *
 * Coverage:
 *   1. Picks 1 card at Lv0; only that card's _recycleWaits decrements.
 *   2. Picked ready (waits=1) card goes strictly to backpack (NOT hand).
 *   3. Picked waiting (waits>1) card stays in bag with waits-1.
 *   4. Unpicked cards in bag are completely untouched.
 *   5. Lv1 picks 2, Lv2 picks 3.
 *   6. pickCount caps at recycle bag size when bag has fewer than N cards.
 *   7. Empty recycle bag → no-op but card still finalizes.
 *   8. Card itself enters recycle bag with recycleDelay 1 after play.
 *   9. Negative regression: play does NOT draw any card from backpack.
 *  10. Negative regression: DISCARD_OWNED_CARD also does NOT draw.
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

function getWaits(c: GameCardData | undefined): number | undefined {
  if (!c) return undefined;
  return (c as GameCardData & { _recycleWaits?: number })._recycleWaits;
}

describe('回收余韵 使用效果 — Lv0：随机选 1 张牌瀑流 -1', () => {
  it('从回收袋随机选 1 张牌，对其 _recycleWaits -1（其他牌完全不变）', () => {
    // Bag of 3 cards all with waits=2. After play exactly one should drop to waits=1.
    const card = makeRecycleEcho();
    const a = makeFiller('a', 2);
    const b = makeFiller('b', 2);
    const c = makeFiller('c', 2);
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: [a, b, c],
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // 3 cards still in bag (none became ready).
    const inBag = result.state.permanentMagicRecycleBag.filter(
      x => x.id === 'bag-a' || x.id === 'bag-b' || x.id === 'bag-c',
    );
    expect(inBag.length).toBe(3);

    // Exactly one of {a,b,c} got waits decremented from 2 → 1; other two stay at 2.
    const waitsList = inBag.map(x => getWaits(x)).sort();
    expect(waitsList).toEqual([1, 2, 2]);
  });

  it('被选中的 ready 牌（waits=1 → 0）进背包（不再被 onDiscardDraw 拉进手牌）', () => {
    const card = makeRecycleEcho();
    const ready = makeFiller('ready-only', 1);
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: [ready],
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // Ready card leaves recycle bag and lands in backpack — strictly backpack now,
    // since onDiscardDraw was removed. Used to be either backpack or hand.
    expect(result.state.permanentMagicRecycleBag.some(x => x.id === 'bag-ready-only')).toBe(false);
    expect(result.state.backpackItems.some(x => x.id === 'bag-ready-only')).toBe(true);
    expect(result.state.handCards.some(x => x.id === 'bag-ready-only')).toBe(false);
  });

  it('未被选中的牌完全不变（_recycleWaits 不动）', () => {
    // Bag of 5 cards with mixed waits — pickCount=1 so 4 of them must be untouched.
    const card = makeRecycleEcho();
    const cards = [
      makeFiller('u1', 3),
      makeFiller('u2', 3),
      makeFiller('u3', 3),
      makeFiller('u4', 3),
      makeFiller('u5', 3),
    ];
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: cards,
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // All 5 still in bag; exactly one got waits=2, rest stay at 3.
    const inBag = result.state.permanentMagicRecycleBag.filter(x => x.id.startsWith('bag-u'));
    expect(inBag.length).toBe(5);
    const waitsList = inBag.map(x => getWaits(x)!).sort();
    expect(waitsList).toEqual([2, 3, 3, 3, 3]);
  });
});

describe('回收余韵 使用效果 — Lv1/Lv2：选 2/3 张牌瀑流 -1', () => {
  it('Lv1 (upgradeLevel=1) 随机选 2 张牌瀑流 -1', () => {
    const card = makeRecycleEcho({ upgradeLevel: 1 });
    const cards = [
      makeFiller('a', 2),
      makeFiller('b', 2),
      makeFiller('c', 2),
      makeFiller('d', 2),
    ];
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: cards,
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const inBag = result.state.permanentMagicRecycleBag.filter(x => x.id.startsWith('bag-'));
    expect(inBag.length).toBe(4);
    const waitsList = inBag.map(x => getWaits(x)!).sort();
    // Two cards went from 2 → 1, two cards stay at 2.
    expect(waitsList).toEqual([1, 1, 2, 2]);
  });

  it('Lv2 (upgradeLevel=2) 随机选 3 张牌瀑流 -1', () => {
    const card = makeRecycleEcho({ upgradeLevel: 2 });
    const cards = [
      makeFiller('a', 2),
      makeFiller('b', 2),
      makeFiller('c', 2),
      makeFiller('d', 2),
    ];
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: cards,
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const inBag = result.state.permanentMagicRecycleBag.filter(x => x.id.startsWith('bag-'));
    expect(inBag.length).toBe(4);
    const waitsList = inBag.map(x => getWaits(x)!).sort();
    // Three cards went from 2 → 1, one card stays at 2.
    expect(waitsList).toEqual([1, 1, 1, 2]);
  });

  it('回收袋少于 N 张时按 bag 大小 cap', () => {
    // Lv2 wants to pick 3, but bag only has 2 — should pick 2.
    const card = makeRecycleEcho({ upgradeLevel: 2 });
    const cards = [
      makeFiller('a', 2),
      makeFiller('b', 2),
    ];
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      permanentMagicRecycleBag: cards,
      handSize: 10,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const inBag = result.state.permanentMagicRecycleBag.filter(x => x.id.startsWith('bag-'));
    expect(inBag.length).toBe(2);
    const waitsList = inBag.map(x => getWaits(x)!).sort();
    // Both cards picked (since pickCount caps at bag size) → both go from 2 → 1.
    expect(waitsList).toEqual([1, 1]);
  });
});

describe('回收余韵 使用效果 — 边界', () => {
  it('回收袋为空时仍然 finalize（无错误）', () => {
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

  it('打出的卡自身入回收袋（recycleDelay 1）', () => {
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

  it('使用效果本身不抽牌（背包卡纹丝不动）', () => {
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

    // The use effect itself never draws — backpack contents stay put.
    expect(result.state.handCards.some(c => c.id === 'bp-filler')).toBe(false);
    expect(result.state.backpackItems.some(c => c.id === 'bp-filler')).toBe(true);
  });
});

// Negative regression tests: the "被回收时抽 1 张" effect was removed by user request.
// These guards make sure no future change accidentally re-introduces a draw on either
// the play path (card auto-recycles) or the DISCARD_OWNED_CARD path (e.g. 专属召唤).
describe('回收余韵 — 被回收时不抽牌（regression guards）', () => {
  it('PLAY 路径：卡入回收袋时不抽背包卡', () => {
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

    // Played card itself goes to recycle bag (recycleDelay 1).
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    // No draw happens — bp-filler stays in backpack, hand contains nothing extra.
    expect(result.state.handCards.some(c => c.id === 'bp-filler')).toBe(false);
    expect(result.state.backpackItems.some(c => c.id === 'bp-filler')).toBe(true);
  });

  it('PLAY 路径 (Lv2)：升级后仍然不抽（升级只影响 use 效果选牌数量）', () => {
    const card = makeRecycleEcho({ upgradeLevel: 2 });
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
    expect(drawnCount).toBe(0);
    expect(result.state.backpackItems.length).toBe(3);
  });

  it('DISCARD_OWNED_CARD 路径：被 专属召唤 等弃回时也不抽（仍正确路由到回收袋）', () => {
    const card = makeRecycleEcho();
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

    // Perm routing still works: card lands in recycle bag, not graveyard.
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(false);
    // No draw happens — bp-filler stays in backpack.
    expect(result.state.handCards.some(c => c.id === 'bp-filler')).toBe(false);
    expect(result.state.backpackItems.some(c => c.id === 'bp-filler')).toBe(true);
  });
});
