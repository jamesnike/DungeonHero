/**
 * Tests for the opening-hand 「专属感召」 perm-1 magic + the
 * 'hand-first' delivery extension to BEGIN_DISCOVER /
 * RESOLVE_DISCOVER_SELECTION.
 *
 * Coverage:
 *   1. INIT_GAME places exactly one 「专属感召」 card on the starting hand.
 *   2. PLAY_CARD on 「专属感召」 emits `card:discoverRequested` with
 *      `delivery: 'hand-first'` and 3 distinct candidates from `classDeck`.
 *   3. BEGIN_DISCOVER stores delivery on state.
 *   4. RESOLVE_DISCOVER_SELECTION with delivery='hand-first':
 *        a. lands the cloned card in handCards when the hand has room.
 *        b. falls back to backpack when the hand is full.
 *        c. falls back to recycle bag when both hand AND backpack are full.
 *   5. `getStartingRelics()` no longer contains 'waterfall-discover'.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import {
  STARTER_CARD_IDS,
  createStarterDiscoverClassToHandCard,
} from '../deck';
import { BASE_BACKPACK_CAPACITY, HAND_LIMIT } from '../constants';
import { getStartingRelics } from '@/lib/eternalRelics';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeStateWithSeed(seed: number): GameState {
  return { ...createInitialGameState(), rng: createRng(seed) };
}

function makeClassCard(id: string, name: string): GameCardData {
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    knightEffect: 'noop',
  } as GameCardData;
}

describe('INIT_GAME — opening hand contains 「专属感召」', () => {
  it('places exactly one starter discover-class-to-hand perm-1 magic on hand', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
        totalWins: 0,
        eternalRelics: [],
      });
      const matching = result.state.handCards.filter(
        c => c.id === STARTER_CARD_IDS.discoverClassToHand,
      );
      expect(matching.length, `seed=${seed} should have exactly 1 card`).toBe(1);
      expect(matching[0].magicType).toBe('permanent');
      expect(matching[0].recycleDelay).toBe(1);
    }
  });

  it('also works in quick mode', () => {
    const state = makeStateWithSeed(42);
    const result = reduce(state, {
      type: 'INIT_GAME',
      mode: 'single',
      totalWins: 0,
      eternalRelics: [],
    });
    const matching = result.state.handCards.filter(
      c => c.id === STARTER_CARD_IDS.discoverClassToHand,
    );
    expect(matching.length).toBe(1);
  });
});

describe('PLAY_CARD on 「专属感召」 — emits card:discoverRequested with delivery=hand-first', () => {
  it('samples 3 distinct candidates from classDeck and emits the discover side effect', () => {
    const card = createStarterDiscoverClassToHandCard();
    const classCards: GameCardData[] = [
      makeClassCard('cls-1', '专属甲'),
      makeClassCard('cls-2', '专属乙'),
      makeClassCard('cls-3', '专属丙'),
      makeClassCard('cls-4', '专属丁'),
      makeClassCard('cls-5', '专属戊'),
    ];
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(123),
      handCards: [card],
      classDeck: classCards,
    };

    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    const allSideEffects = [...initial.sideEffects, ...drained.sideEffects];

    const discoverEvents = allSideEffects.filter(
      e => e.event === 'card:discoverRequested',
    );
    expect(discoverEvents.length).toBe(1);
    const payload = discoverEvents[0].payload as {
      source: string;
      candidates: GameCardData[];
      delivery?: 'backpack' | 'hand-first';
      sourceLabel?: string;
    };
    expect(payload.delivery).toBe('hand-first');
    expect(payload.source).toBe('starter-discover-class-to-hand');
    expect(payload.candidates.length).toBe(3);
    const uniqueIds = new Set(payload.candidates.map(c => c.id));
    expect(uniqueIds.size).toBe(3);
    payload.candidates.forEach(c => {
      expect(classCards.some(cc => cc.id === c.id)).toBe(true);
    });
  });

  it('emits banner + log when classDeck is empty (no discover modal opens)', () => {
    const card = createStarterDiscoverClassToHandCard();
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(7),
      handCards: [card],
      classDeck: [],
    };

    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    const allSideEffects = [...initial.sideEffects, ...drained.sideEffects];

    const discoverEvents = allSideEffects.filter(
      e => e.event === 'card:discoverRequested',
    );
    expect(discoverEvents.length).toBe(0);
    const banners = allSideEffects.filter(e => e.event === 'ui:banner');
    expect(banners.some(b => (b.payload as { text: string }).text.includes('专属感召'))).toBe(true);
  });
});

describe('BEGIN_DISCOVER — stores delivery on state', () => {
  it("default delivery is 'backpack' when omitted", () => {
    const state = { ...createInitialGameState(), rng: createRng(11) };
    const pool: GameCardData[] = [
      makeClassCard('a', 'A'),
      makeClassCard('b', 'B'),
      makeClassCard('c', 'C'),
    ];
    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'test',
      pool,
      sourceLabel: 'test',
    });
    expect(result.state.discoverDelivery).toBe('backpack');
    expect(result.state.discoverModalOpen).toBe(true);
  });

  it("explicit delivery='hand-first' is stored on state", () => {
    const state = { ...createInitialGameState(), rng: createRng(11) };
    const pool: GameCardData[] = [
      makeClassCard('a', 'A'),
      makeClassCard('b', 'B'),
      makeClassCard('c', 'C'),
    ];
    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'test',
      pool,
      sourceLabel: 'test',
      delivery: 'hand-first',
    });
    expect(result.state.discoverDelivery).toBe('hand-first');
  });
});

describe('RESOLVE_DISCOVER_SELECTION — hand-first delivery', () => {
  it('lands cloned card in handCards when hand has room', () => {
    const candidate = makeClassCard('cls-x', '测试卡');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(50),
      discoverModalOpen: true,
      discoverOptions: [candidate],
      discoverDelivery: 'hand-first',
      handCards: [],
      backpackItems: [],
    };
    const result = reduce(state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: candidate.id,
    });
    expect(result.state.handCards.length).toBe(1);
    expect(result.state.handCards[0].name).toBe('测试卡');
    // Cloned card should have a fresh id (not the original).
    expect(result.state.handCards[0].id).not.toBe(candidate.id);
    expect(result.state.backpackItems.length).toBe(0);
    expect(result.state.permanentMagicRecycleBag.length).toBe(0);
    // Modal closed; delivery reset to default.
    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.discoverDelivery).toBe('backpack');

    // Animation: should emit `card:queueToHand` with sourceHint='classDeck'
    // (drives the class-deck → hand flight) and `shop:classCardObtained`
    // with destination='hand' (so the shop listener SKIPS the legacy
    // class-deck → backpack flight).
    const cloned = result.state.handCards[0];
    const queueEvents = result.sideEffects.filter(e => e.event === 'card:queueToHand');
    expect(queueEvents).toHaveLength(1);
    expect(queueEvents[0].payload).toMatchObject({
      card: expect.objectContaining({ id: cloned.id }),
      sourceHint: 'classDeck',
    });
    const obtainedEvents = result.sideEffects.filter(e => e.event === 'shop:classCardObtained');
    expect(obtainedEvents).toHaveLength(1);
    expect((obtainedEvents[0].payload as { destination: string }).destination).toBe('hand');
    // The legacy `card:drawnToHand` event must NOT be emitted on this path —
    // otherwise the GameBoard listener would queue a second flight from the
    // default backpack source, double-animating the same card.
    const drawnEvents = result.sideEffects.filter(e => e.event === 'card:drawnToHand');
    expect(drawnEvents).toHaveLength(0);
  });

  it('falls back to backpack when hand is full but backpack has room', () => {
    const candidate = makeClassCard('cls-x', '测试卡');
    // Fill hand to HAND_LIMIT (no bonus) so the candidate cannot land in hand.
    const fullHand: GameCardData[] = Array.from({ length: HAND_LIMIT }, (_, i) => ({
      id: `h-${i}`,
      type: 'magic',
      name: `H${i}`,
      value: 0,
    } as GameCardData));
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(50),
      discoverModalOpen: true,
      discoverOptions: [candidate],
      discoverDelivery: 'hand-first',
      handCards: fullHand,
      backpackItems: [],
    };
    const result = reduce(state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: candidate.id,
    });
    expect(result.state.handCards.length).toBe(HAND_LIMIT);
    expect(result.state.backpackItems.length).toBe(1);
    expect(result.state.backpackItems[0].name).toBe('测试卡');
    expect(result.state.permanentMagicRecycleBag.length).toBe(0);
  });

  it('falls back to recycle bag when both hand AND backpack are full', () => {
    const candidate: GameCardData = {
      ...makeClassCard('cls-x', '测试卡'),
      recycleDelay: 3,
    } as GameCardData;
    const fullHand: GameCardData[] = Array.from({ length: HAND_LIMIT }, (_, i) => ({
      id: `h-${i}`,
      type: 'magic',
      name: `H${i}`,
      value: 0,
    } as GameCardData));
    // Fill backpack exactly to BASE_BACKPACK_CAPACITY (modifier 0) so
    // `backpackHasRoom` is false and the recycle-bag fallback is exercised.
    const fullBackpack: GameCardData[] = Array.from({ length: BASE_BACKPACK_CAPACITY }, (_, i) => ({
      id: `b-${i}`,
      type: 'magic',
      name: `B${i}`,
      value: 0,
    } as GameCardData));
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(50),
      discoverModalOpen: true,
      discoverOptions: [candidate],
      discoverDelivery: 'hand-first',
      handCards: fullHand,
      backpackItems: fullBackpack,
      backpackCapacityModifier: 0,
    };
    const result = reduce(state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: candidate.id,
    });
    const recycled = result.state.permanentMagicRecycleBag.find(
      c => c.name === '测试卡',
    );
    expect(recycled).toBeTruthy();
    expect(
      (recycled as GameCardData & { _recycleWaits?: number })._recycleWaits,
    ).toBe(3);
    expect(result.state.handCards.length).toBe(HAND_LIMIT);
    expect(result.state.backpackItems.length).toBe(BASE_BACKPACK_CAPACITY);
  });
});

describe('Eternal relics — starting set no longer contains waterfall-discover', () => {
  it('getStartingRelics returns recycle-shuffle (not waterfall-discover)', () => {
    const starting = getStartingRelics();
    const ids = starting.map(r => r.id);
    expect(ids).not.toContain('waterfall-discover');
    expect(ids).toContain('recycle-shuffle');
  });

  it('getStartingRelics includes waterfall-draw-2 (default starter)', () => {
    const starting = getStartingRelics();
    const ids = starting.map(r => r.id);
    expect(ids).toContain('waterfall-draw-2');
  });
});
