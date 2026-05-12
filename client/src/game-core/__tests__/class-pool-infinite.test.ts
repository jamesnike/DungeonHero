/**
 * Class pool — infinite template semantics.
 *
 * The classDeck is a static template: all "obtain" paths (discover, draw to
 * backpack, purchase, equipKnight, drawClassToHand, classBottom+, etc.) sample
 * from it without consuming. Each obtained card is a clone with a fresh,
 * deterministic id whose base-id strips back to the source (so starter-routed
 * cards still play correctly).
 *
 * These tests lock in:
 *   1. classDeck length never decreases on obtain.
 *   2. Obtained cards have NEW ids distinct from the template card.
 *   3. Cloned ids strip back via getStarterBaseId to the original base id —
 *      both for `knight-N` and for `starter-perm-X-pick-N` families.
 *   4. Discover candidates are distinct-by-name.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { getStarterBaseId } from '../deck';
import { cloneClassCardWithFreshId, sampleDistinctByName } from '../cardClone';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function knightCard(id: string, name: string): GameCardData {
  return { id, type: 'magic', name, value: 0, image: '' } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1) cloneClassCardWithFreshId — id-strip preservation
// ---------------------------------------------------------------------------

describe('cloneClassCardWithFreshId — preserves base id via getStarterBaseId', () => {
  it('clones a knight-N card with a fresh, unique id whose base strips to the original', () => {
    const card = knightCard('knight-7', 'Knight Sword');
    const rng = createRng(42);

    const [clone] = cloneClassCardWithFreshId(card, rng);
    expect(clone.id).not.toBe(card.id);
    expect(clone.name).toBe('Knight Sword');
    // The clone id should strip back to the same starter base as the original
    // (knight-N has no -pick suffix to strip; just verify both produce the
    // same base — the new id may add a suffix that getStarterBaseId removes).
    expect(getStarterBaseId(clone.id)).toBe(getStarterBaseId(card.id));
  });

  it('clones a starter-perm-X-pick-N card so the base still strips to starter-perm-X', () => {
    const card: GameCardData = {
      id: 'starter-perm-fireblast-pick-3',
      type: 'magic',
      name: 'Fire Blast',
      value: 0,
      image: '',
    } as GameCardData;
    const baseBefore = getStarterBaseId(card.id);
    expect(baseBefore).toBe('starter-perm-fireblast');

    const [clone] = cloneClassCardWithFreshId(card, createRng(99));
    expect(clone.id).not.toBe(card.id);
    expect(getStarterBaseId(clone.id)).toBe('starter-perm-fireblast');
  });

  it('threads RNG so cloning the same card twice yields different ids', () => {
    const card = knightCard('knight-1', 'A');
    const rng = createRng(123);
    const [a, rngAfter] = cloneClassCardWithFreshId(card, rng);
    const [b] = cloneClassCardWithFreshId(card, rngAfter);
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// 2) sampleDistinctByName — distinct-name candidate selection
// ---------------------------------------------------------------------------

describe('sampleDistinctByName — distinct-by-name selection', () => {
  it('returns up to N items, never duplicating names', () => {
    const pool = [
      { id: 'a1', name: 'Alpha' },
      { id: 'a2', name: 'Alpha' },
      { id: 'a3', name: 'Alpha' },
      { id: 'b1', name: 'Beta' },
      { id: 'c1', name: 'Gamma' },
    ];
    // Identity shuffle: don't mutate order so we can reason deterministically.
    const identityShuffle = <U,>(arr: readonly U[], r: any): [U[], any] => [arr.slice(), r];
    const [picks] = sampleDistinctByName(pool, 3, createRng(0), identityShuffle);
    const names = picks.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('returns fewer than N when the pool has fewer distinct names', () => {
    const pool = [
      { id: 'a1', name: 'Alpha' },
      { id: 'a2', name: 'Alpha' },
    ];
    const identityShuffle = <U,>(arr: readonly U[], r: any): [U[], any] => [arr.slice(), r];
    const [picks] = sampleDistinctByName(pool, 3, createRng(0), identityShuffle);
    expect(picks).toHaveLength(1);
    expect(picks[0].name).toBe('Alpha');
  });
});

// ---------------------------------------------------------------------------
// 3) DRAW_CLASS_TO_BACKPACK — sample + clone, no consumption
// ---------------------------------------------------------------------------

describe('DRAW_CLASS_TO_BACKPACK — infinite template semantics', () => {
  it('classDeck length is unchanged after a draw', () => {
    const c1 = knightCard('knight-1', 'A');
    const c2 = knightCard('knight-2', 'B');
    const state = makeState({ classDeck: [c1, c2] as any, backpackItems: [] });

    const result = reduce(state, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
    expect(result.state.classDeck).toHaveLength(2);
    expect(result.state.backpackItems).toHaveLength(1);
  });

  it('drawn card has a NEW id but its base strips to the source id', () => {
    const c1 = knightCard('knight-1', 'A');
    const state = makeState({ classDeck: [c1] as any, backpackItems: [] });

    const result = reduce(state, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
    const drawn = result.state.backpackItems[0];
    expect(drawn.id).not.toBe(c1.id);
    expect(getStarterBaseId(drawn.id)).toBe(getStarterBaseId(c1.id));
  });

  it('drawing twice from the same single-card pool yields two different ids', () => {
    const c1 = knightCard('knight-1', 'A');
    const state = makeState({ classDeck: [c1] as any, backpackItems: [] });

    let s = state;
    s = reduce(s, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1 }).state;
    s = reduce(s, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1 }).state;
    expect(s.classDeck).toHaveLength(1);
    expect(s.backpackItems).toHaveLength(2);
    expect(s.backpackItems[0].id).not.toBe(s.backpackItems[1].id);
  });

  it('includeIds restricts the source to a specific template id', () => {
    const c1 = knightCard('knight-1', 'A');
    const c2 = knightCard('knight-2', 'B');
    const state = makeState({ classDeck: [c1, c2] as any, backpackItems: [] });

    const result = reduce(state, {
      type: 'DRAW_CLASS_TO_BACKPACK',
      count: 1,
      includeIds: [c2.id],
    });
    expect(result.state.classDeck).toHaveLength(2);
    expect(result.state.backpackItems).toHaveLength(1);
    expect(result.state.backpackItems[0].name).toBe('B');
    expect(getStarterBaseId(result.state.backpackItems[0].id)).toBe(getStarterBaseId(c2.id));
  });
});

// ---------------------------------------------------------------------------
// 4) PURCHASE — bought card is a clone, classDeck preserved
// ---------------------------------------------------------------------------

describe('PURCHASE — infinite template semantics', () => {
  it('classDeck is preserved and the bought card is a fresh clone (lands in hand by default)', () => {
    const c1 = { id: 'c1', type: 'weapon' as const, name: 'Sword', value: 3 };
    const c2 = { id: 'c2', type: 'shield' as const, name: 'Shield', value: 2 };
    const state = makeState({
      gold: 50,
      shopOfferings: [{ card: c1, price: 10, sold: false }],
      classDeck: [c1, c2] as any,
      backpackItems: [],
    });

    const result = reduce(state, { type: 'PURCHASE', cardId: 'c1' });
    expect(result.state.classDeck).toHaveLength(2);
    // Hand-first delivery: bought card lands in hand (default initial state
    // has empty handCards, well under HAND_LIMIT).
    expect(result.state.handCards).toHaveLength(1);
    expect(result.state.backpackItems).toHaveLength(0);
    expect(result.state.handCards[0].id).not.toBe('c1');
    expect(getStarterBaseId(result.state.handCards[0].id)).toBe(getStarterBaseId('c1'));
  });
});

// ---------------------------------------------------------------------------
// 5) BEGIN_DISCOVER — distinct-by-name candidates, no consumption
// ---------------------------------------------------------------------------

describe('BEGIN_DISCOVER — distinct-by-name + non-consuming', () => {
  it('classDeck length is unchanged after a discover begins', () => {
    const cards = [
      knightCard('knight-1', 'A'),
      knightCard('knight-2', 'B'),
      knightCard('knight-3', 'C'),
      knightCard('knight-4', 'D'),
    ];
    const state = makeState({ classDeck: cards as any });
    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'test',
      pool: cards,
      sourceLabel: 'test',
    } as GameAction);
    expect(result.state.classDeck).toHaveLength(4);
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.discoverOptions.length).toBeGreaterThan(0);
  });

  it('discover candidates are distinct by name even when the pool has duplicates', () => {
    const cards = [
      knightCard('knight-1', 'Alpha'),
      knightCard('knight-2', 'Alpha'),
      knightCard('knight-3', 'Beta'),
      knightCard('knight-4', 'Gamma'),
      knightCard('knight-5', 'Gamma'),
    ];
    const state = makeState({ classDeck: cards as any });
    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'test',
      pool: cards,
      sourceLabel: 'test',
    } as GameAction);
    const names = result.state.discoverOptions.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// 6) RESOLVE_DISCOVER_SELECTION — selected card is a clone, pool preserved
// ---------------------------------------------------------------------------

describe('RESOLVE_DISCOVER_SELECTION — clone semantics', () => {
  it('selected card lands in backpack as a clone, classDeck preserved', () => {
    const cards = [
      knightCard('knight-1', 'A'),
      knightCard('knight-2', 'B'),
      knightCard('knight-3', 'C'),
    ];
    const state = makeState({ classDeck: cards as any, backpackItems: [] });
    const after = drain(state, [
      { type: 'BEGIN_DISCOVER', source: 'test', pool: cards, sourceLabel: 'test' } as GameAction,
    ]);
    expect(after.state.discoverOptions.length).toBeGreaterThan(0);

    const pickId = after.state.discoverOptions[0].id;
    const pickName = after.state.discoverOptions[0].name;

    const final = drain(after.state, [
      { type: 'RESOLVE_DISCOVER_SELECTION', cardId: pickId } as GameAction,
    ]);

    expect(final.state.classDeck).toHaveLength(3);
    const inBag = final.state.backpackItems.find(c => c.name === pickName);
    expect(inBag).toBeDefined();
    expect(inBag!.id).not.toBe(pickId);
  });
});
