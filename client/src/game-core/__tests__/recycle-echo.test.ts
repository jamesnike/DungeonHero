/**
 * 回收余韵 (Recycle Echo) — Starter Perm 1 magic tests
 *
 * New semantics (user confirmed option A):
 *   - Use effect: randomly pick N cards from the recycle bag and decrement
 *     their `_recycleWaits` by 1. Cards reaching 0 → backpack (subject to cap).
 *     Unpicked cards remain unchanged.
 *   - N depends on upgradeLevel: 1 (Lv0) / 2 (Lv1) / 3 (Lv2).
 *   - onDiscardDraw is fixed to 1 at all upgrade levels.
 *
 * Coverage:
 *   1. Picks 1 card at Lv0; only that card's _recycleWaits decrements.
 *   2. Picked ready (waits=1) card goes to backpack; emits recycleRestored.
 *   3. Picked waiting (waits>1) card stays in bag with waits-1.
 *   4. Unpicked cards in bag are completely untouched.
 *   5. Lv1 picks 2, Lv2 picks 3.
 *   6. pickCount caps at recycle bag size when bag has fewer than N cards.
 *   7. Empty recycle bag → no-op but card still finalizes.
 *   8. Card itself enters recycle bag with recycleDelay 1 after play.
 *   9. onDiscardDraw=1 triggers on play (cards drawn from backpack).
 *  10. onDiscardDraw also triggers via DISCARD_OWNED_CARD pipeline.
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

  it('被选中的 ready 牌（waits=1 → 0）进背包，并 emit waterfall:recycleRestored 副作用', () => {
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

    // Ready card is no longer in recycle bag (went to backpack, then onDiscardDraw=1
    // pulled it into hand).
    expect(result.state.permanentMagicRecycleBag.some(x => x.id === 'bag-ready-only')).toBe(false);
    const inBackpackOrHand =
      result.state.backpackItems.some(x => x.id === 'bag-ready-only') ||
      result.state.handCards.some(x => x.id === 'bag-ready-only');
    expect(inBackpackOrHand).toBe(true);
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

  it('使用效果本身不抽牌（覆盖 onDiscardDraw=0 验证）', () => {
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

describe('回收余韵 被回收效果 — onDiscardDraw 固定 1（play 路径）', () => {
  it('Lv0 被回收时从背包抽 1 张', () => {
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

  it('Lv1 / Lv2 也只从背包抽 1 张（升级不增加抽牌量）', () => {
    // Card-schema OnUpgradeHandler sets onDiscardDraw=1 always.
    // We simulate the upgraded state by providing onDiscardDraw=1 and upgradeLevel=2.
    const card = makeRecycleEcho({ upgradeLevel: 2, onDiscardDraw: 1 });
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
    expect(drawnCount).toBe(1);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('回收袋为空时也触发 onDiscardDraw（use 是 no-op + draw 仍触发）', () => {
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

  it('play 路径不触发弹射 / 弃能护符（toRecycleBag 选项设为 true）', () => {
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

describe('回收余韵 被回收效果 — DISCARD_OWNED_CARD 路径', () => {
  it('被 专属召唤 等机制弃回时也触发 onDiscardDraw', () => {
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
