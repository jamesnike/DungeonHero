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

  // Regression — user reported "sometimes the 专属感召 discover modal only
  // shows 2 cards instead of 3". Root cause: the resolver pre-sampled 3
  // cards from the *raw* classDeck (including already-acquired unique
  // cards), then `reduceBeginDiscover` ran the unique-lock filter and
  // shrunk the pool below 3.
  //
  // Fix: filter the classDeck through `filterAvailableClassPool` BEFORE
  // pre-sampling. End-to-end test below replays the full chain
  // (PLAY_CARD → resolver emits side effect → BEGIN_DISCOVER on the
  // emitted candidates) and asserts the discover modal opens with
  // exactly 3 options even when several unique cards in the pool are
  // already acquired.
  it('regression: with unique-locked cards in classDeck, modal still opens with 3 distinct candidates', () => {
    const card = createStarterDiscoverClassToHandCard();
    const lockedA: GameCardData = { ...makeClassCard('knight-1', 'LockedA'), unique: true } as GameCardData;
    const lockedB: GameCardData = { ...makeClassCard('knight-2', 'LockedB'), unique: true } as GameCardData;
    const lockedC: GameCardData = { ...makeClassCard('knight-3', 'LockedC'), unique: true } as GameCardData;
    const free1 = makeClassCard('cls-f1', 'Free1');
    const free2 = makeClassCard('cls-f2', 'Free2');
    const free3 = makeClassCard('cls-f3', 'Free3');
    const free4 = makeClassCard('cls-f4', 'Free4');

    // Try across many seeds — without the fix, there exists at least one
    // seed where the pre-sample picks a locked card and the modal shrinks.
    for (let seed = 1; seed <= 50; seed++) {
      const state: GameState = {
        ...createInitialGameState(),
        rng: createRng(seed),
        handCards: [card],
        // Pool is dominated by locked cards so a naive pre-sample is very
        // likely to pick at least one.
        classDeck: [lockedA, lockedB, lockedC, free1, free2, free3, free4],
        acquiredUniqueClassCardIds: ['knight-1', 'knight-2', 'knight-3'],
      };

      const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
      const drained = drain(initial.state, initial.enqueuedActions ?? []);
      const allSideEffects = [...initial.sideEffects, ...drained.sideEffects];

      const discoverEvent = allSideEffects.find(
        e => e.event === 'card:discoverRequested',
      );
      expect(discoverEvent, `seed=${seed} must emit discover side effect`).toBeTruthy();
      const candidates = (discoverEvent!.payload as { candidates: GameCardData[] }).candidates;

      // Replay the hook step: BEGIN_DISCOVER on the emitted candidates.
      const afterBegin = reduce(drained.state, {
        type: 'BEGIN_DISCOVER',
        source: 'starter-discover-class-to-hand',
        pool: candidates,
        sourceLabel: '专属感召',
        delivery: 'hand-first',
      });

      expect(afterBegin.state.discoverModalOpen, `seed=${seed} modal should open`).toBe(true);
      expect(
        afterBegin.state.discoverOptions.length,
        `seed=${seed} modal should have exactly 3 options`,
      ).toBe(3);
      // No locked card may slip into the final options either.
      const optionIds = afterBegin.state.discoverOptions.map(c => c.id);
      expect(optionIds, `seed=${seed} no locked card in options`).not.toContain('knight-1');
      expect(optionIds).not.toContain('knight-2');
      expect(optionIds).not.toContain('knight-3');
    }
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
