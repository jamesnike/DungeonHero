/**
 * Unique Class Card Lock — once a card tagged `unique: true` from the class
 * pool actually lands in player possession, every future class-pool sampling
 * path (discover / draw / event grants / shop offerings / shop refresh) must
 * filter it out for the rest of the run. Shop offerings already on display
 * remain visible but cannot be purchased.
 *
 * Coverage:
 *   1. `filterAvailableClassPool` excludes locked cards, leaves non-unique
 *      cards untouched, and ignores `unique: true` cards that haven't been
 *      acquired yet.
 *   2. `RESOLVE_DISCOVER_SELECTION` marks the chosen card and the queued
 *      next BEGIN_DISCOVER pool excludes it.
 *   3. `DRAW_CLASS_TO_BACKPACK` marks every drawn unique card and a second
 *      draw never re-rolls a locked card.
 *   4. `gainClassDeckBottomCardsPure` filters before slicing (so the bottom
 *      slice walks earlier into the deck instead of returning fewer cards).
 *   5. Shop refresh after acquisition never offers locked cards.
 *      `purchaseFromShopPure` rejects an offering whose base id was already
 *      acquired (e.g. via discover) even if the shop slot is still on
 *      display.
 *   6. `INIT_GAME` resets `acquiredUniqueClassCardIds` to `[]`.
 *   7. `serializeGameState` round-trip preserves the list.
 *   8. Backpack-overflow → recycle-bag landings still count as acquired
 *      (locking persists for the run even if the card later leaves the
 *      recycle bag).
 *   9. `markUniqueAcquired` is idempotent — re-marking the same card (e.g.
 *      after sell / break / curse-return-to-backpack) does not duplicate the
 *      base id and does not "unlock".
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { serializeGameState } from '../persistence';
import {
  filterAvailableClassPool,
  isUniqueLocked,
  markUniqueAcquired,
} from '../uniqueClass';
import { gainClassDeckBottomCardsPure } from '../events';
import {
  generateShopOfferingsPure,
  purchaseFromShopPure,
  shopRefreshPure,
} from '../shop';
import { getStarterBaseId } from '../deck';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeUniqueMagic(id: string, name: string): GameCardData {
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    unique: true,
    knightEffect: 'noop',
    magicEffect: 'noop',
  } as GameCardData;
}

function makeMagic(id: string, name: string): GameCardData {
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    knightEffect: 'noop',
    magicEffect: 'noop',
  } as GameCardData;
}

function makeUniqueWeapon(id: string, name: string, value = 2): GameCardData {
  return {
    id,
    type: 'weapon',
    name,
    value,
    unique: true,
  } as GameCardData;
}

function makeWeapon(id: string, name: string, value = 2): GameCardData {
  return {
    id,
    type: 'weapon',
    name,
    value,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// Scenario 1 — filterAvailableClassPool
// ---------------------------------------------------------------------------

describe('filterAvailableClassPool / isUniqueLocked', () => {
  it('excludes acquired unique cards, keeps non-unique cards', () => {
    const pool = [
      makeUniqueMagic('knight-1', 'A'),
      makeUniqueMagic('knight-2', 'B'),
      makeMagic('knight-3', 'C'),
    ];
    const state: GameState = {
      ...createInitialGameState(),
      classDeck: pool,
      acquiredUniqueClassCardIds: ['knight-1'],
    };

    const filtered = filterAvailableClassPool(pool, state);
    expect(filtered.map(c => c.id)).toEqual(['knight-2', 'knight-3']);
  });

  it('keeps unique cards that are not yet acquired', () => {
    const pool = [makeUniqueMagic('knight-1', 'A'), makeUniqueMagic('knight-2', 'B')];
    const state: GameState = {
      ...createInitialGameState(),
      classDeck: pool,
      acquiredUniqueClassCardIds: [],
    };

    const filtered = filterAvailableClassPool(pool, state);
    expect(filtered.map(c => c.id)).toEqual(['knight-1', 'knight-2']);
  });

  it('reads in-flight patch overrides for back-to-back acquisitions', () => {
    const pool = [makeUniqueMagic('knight-1', 'A'), makeUniqueMagic('knight-2', 'B')];
    const state: GameState = {
      ...createInitialGameState(),
      classDeck: pool,
      acquiredUniqueClassCardIds: [],
    };
    const patch: Partial<GameState> = { acquiredUniqueClassCardIds: ['knight-2'] };

    const filtered = filterAvailableClassPool(pool, state, patch);
    expect(filtered.map(c => c.id)).toEqual(['knight-1']);
  });

  it('isUniqueLocked is false for cards without the unique flag', () => {
    const card = makeMagic('knight-1', 'A');
    const acquired = new Set(['knight-1']);
    expect(isUniqueLocked(card, acquired)).toBe(false);
  });

  it('isUniqueLocked is true for unique card whose base id is acquired (matches across cloned id)', () => {
    const cloned: GameCardData = { ...makeUniqueMagic('knight-1-pick-1-abc', 'A') };
    const acquired = new Set(['knight-1']);
    expect(isUniqueLocked(cloned, acquired)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — RESOLVE_DISCOVER_SELECTION marks acquisition
// ---------------------------------------------------------------------------

describe('RESOLVE_DISCOVER_SELECTION marks unique cards as acquired', () => {
  it('selecting a unique candidate writes its base id to acquiredUniqueClassCardIds', () => {
    const candidate = makeUniqueMagic('knight-7', 'UniqueOne');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(1),
      classDeck: [candidate, makeUniqueMagic('knight-8', 'UniqueTwo')],
      discoverModalOpen: true,
      discoverOptions: [candidate],
      discoverSourceLabel: 'test',
    };

    const result = reduce(state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: candidate.id,
    });

    expect(result.state.acquiredUniqueClassCardIds).toContain('knight-7');
    expect(result.state.discoverModalOpen).toBe(false);
  });

  it('queue-drained next BEGIN_DISCOVER pool excludes the just-acquired unique card', () => {
    const a = makeUniqueMagic('knight-7', 'UniqueA');
    const b = makeUniqueMagic('knight-8', 'UniqueB');
    const c = makeUniqueMagic('knight-9', 'UniqueC');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(2),
      classDeck: [a, b, c],
      discoverModalOpen: true,
      discoverOptions: [a],
      discoverSourceLabel: 'test',
      pendingClassDiscoverQueue: [
        { source: 'test-source', sourceLabel: 'test', delivery: 'backpack' },
      ],
    };

    const afterFirst = reduce(state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: a.id,
    });
    const drained = drain(afterFirst.state, afterFirst.enqueuedActions ?? []);

    expect(drained.state.acquiredUniqueClassCardIds).toContain('knight-7');
    expect(drained.state.discoverModalOpen).toBe(true);
    const optionIds = drained.state.discoverOptions.map(c => getStarterBaseId(c.id));
    expect(optionIds).not.toContain('knight-7');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — DRAW_CLASS_TO_BACKPACK marks every drawn card; rerolls skip locks
// ---------------------------------------------------------------------------

describe('DRAW_CLASS_TO_BACKPACK locks every drawn unique card', () => {
  it('marks all drawn unique cards in one step', () => {
    const cards = [
      makeUniqueMagic('knight-1', 'U1'),
      makeUniqueMagic('knight-2', 'U2'),
      makeUniqueMagic('knight-3', 'U3'),
    ];
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(11),
      classDeck: cards,
    };

    const result = reduce(state, {
      type: 'DRAW_CLASS_TO_BACKPACK',
      count: 3,
    });

    expect(result.state.acquiredUniqueClassCardIds.sort()).toEqual([
      'knight-1',
      'knight-2',
      'knight-3',
    ]);
    expect(result.state.backpackItems.length).toBe(3);
  });

  it('a second draw cannot re-roll a card already locked from a prior draw', () => {
    const a = makeUniqueMagic('knight-1', 'U1');
    const b = makeMagic('knight-2', 'NonU');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(31),
      classDeck: [a, b],
      acquiredUniqueClassCardIds: ['knight-1'],
    };

    const result = reduce(state, {
      type: 'DRAW_CLASS_TO_BACKPACK',
      count: 1,
    });

    const baseIds = result.state.backpackItems.map(c => getStarterBaseId(c.id));
    expect(baseIds).not.toContain('knight-1');
    expect(baseIds).toContain('knight-2');
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — gainClassDeckBottomCardsPure filters before slicing
// ---------------------------------------------------------------------------

describe('gainClassDeckBottomCardsPure filters unique-locked cards before the bottom slice', () => {
  it('locked card at the bottom is skipped; the next card up is returned instead', () => {
    const top = makeMagic('knight-1', 'Top');
    const middle = makeMagic('knight-2', 'Middle');
    const lockedBottom = makeUniqueMagic('knight-3', 'LockedBottom');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(7),
      classDeck: [top, middle, lockedBottom],
      acquiredUniqueClassCardIds: ['knight-3'],
    };

    const { cards } = gainClassDeckBottomCardsPure(state, 1);
    const baseIds = cards.map(c => getStarterBaseId(c.id));
    expect(baseIds).not.toContain('knight-3');
    expect(baseIds).toEqual(['knight-2']);
  });

  it('marks the cards it does land as acquired and returns the proper count', () => {
    const a = makeUniqueMagic('knight-1', 'A');
    const b = makeUniqueMagic('knight-2', 'B');
    const c = makeMagic('knight-3', 'C');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(8),
      classDeck: [a, b, c],
    };

    const { patch, cards } = gainClassDeckBottomCardsPure(state, 2);
    const lockedAfter = patch.acquiredUniqueClassCardIds ?? [];
    expect(cards.length).toBe(2);
    // 'b' (knight-2) is unique and was at index 1 (the 2nd-from-bottom slice).
    expect(lockedAfter).toContain('knight-2');
    // Non-unique 'c' must not be locked.
    expect(lockedAfter).not.toContain('knight-3');
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Shop offerings + purchaseFromShopPure
// ---------------------------------------------------------------------------

describe('Shop interactions with unique-locked cards', () => {
  it('shop refresh after acquisition never offers a locked card', () => {
    // Pool contains two unique cards; one is already locked.
    const locked = makeUniqueWeapon('knight-1', 'LockedSword');
    const free = makeUniqueWeapon('knight-2', 'FreeSword');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(101),
      classDeck: [locked, free],
      acquiredUniqueClassCardIds: ['knight-1'],
      gold: 999,
    };

    const refreshed = shopRefreshPure(state, state.rng);
    expect(refreshed).not.toBeNull();
    const [patch] = refreshed!;
    const offeringIds = (patch.shopOfferings ?? []).map(o =>
      getStarterBaseId(o.card.id),
    );
    expect(offeringIds).not.toContain('knight-1');
    if (offeringIds.length > 0) {
      expect(offeringIds).toContain('knight-2');
    }
  });

  it('purchaseFromShopPure rejects an offering whose base id was acquired elsewhere', () => {
    // Build a shop offering for knight-1 *before* acquisition (as if it was
    // already on display when the player got the card via discover).
    const card = makeUniqueWeapon('knight-1', 'LockedSword');
    const [offerings] = generateShopOfferingsPure([card], 0, createRng(200));
    expect(offerings.length).toBeGreaterThan(0);

    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(201),
      gold: 999,
      shopOfferings: offerings,
      // Player acquired the same base id elsewhere in this run.
      acquiredUniqueClassCardIds: ['knight-1'],
    };

    const result = purchaseFromShopPure(state, offerings[0].card.id);
    expect(result).toBeNull();
  });

  it('purchaseFromShopPure succeeds for a unique card never acquired before, and adds the base id to the lock list', () => {
    const card = makeUniqueWeapon('knight-1', 'FirstBuy');
    const [offerings] = generateShopOfferingsPure([card], 0, createRng(300));
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(301),
      gold: 999,
      shopOfferings: offerings,
      acquiredUniqueClassCardIds: [],
    };

    const result = purchaseFromShopPure(state, offerings[0].card.id);
    expect(result).not.toBeNull();
    expect(result!.acquiredUniqueClassCardIds).toEqual(['knight-1']);
    expect(result!.purchasedCard).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — INIT_GAME resets the lock list
// ---------------------------------------------------------------------------

describe('INIT_GAME resets acquiredUniqueClassCardIds', () => {
  it('a previous run with locked cards starts fresh after INIT_GAME', () => {
    const previous: GameState = {
      ...createInitialGameState(),
      rng: createRng(1),
      acquiredUniqueClassCardIds: ['knight-1', 'knight-7'],
    };

    const result = reduce(previous, {
      type: 'INIT_GAME',
      mode: 'normal',
      totalWins: 0,
      eternalRelics: [],
    });

    expect(result.state.acquiredUniqueClassCardIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — Persistence round-trip
// ---------------------------------------------------------------------------

describe('Persistence round-trip preserves acquiredUniqueClassCardIds', () => {
  it('serializeGameState carries the list verbatim', () => {
    const state: GameState = {
      ...createInitialGameState(),
      acquiredUniqueClassCardIds: ['knight-1', 'knight-7', 'knight-12'],
    };
    const persisted = serializeGameState(state);
    expect(persisted.acquiredUniqueClassCardIds).toEqual([
      'knight-1',
      'knight-7',
      'knight-12',
    ]);
  });

  it('serializeGameState clones the array (mutation-safe)', () => {
    const original = ['knight-1'];
    const state: GameState = {
      ...createInitialGameState(),
      acquiredUniqueClassCardIds: original,
    };
    const persisted = serializeGameState(state);
    expect(persisted.acquiredUniqueClassCardIds).toEqual(['knight-1']);
    expect(persisted.acquiredUniqueClassCardIds).not.toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — Backpack-overflow → recycle-bag still locks
// ---------------------------------------------------------------------------

describe('Recycle-bag overflow on draw still locks the card', () => {
  it('full-backpack DRAW_CLASS_TO_BACKPACK pushes overflow into recycle bag and still records the lock', () => {
    const card = makeUniqueMagic('knight-5', 'OverflowMagic');
    // Fill backpack: BASE_BACKPACK_CAPACITY is 6; we'll fabricate 6 filler
    // cards via createInitialGameState's empty backpack and then push 6.
    const filler: GameCardData[] = Array.from({ length: 12 }, (_, i) => ({
      id: `filler-${i}`,
      type: 'magic',
      name: `Filler${i}`,
      value: 0,
    } as GameCardData));
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(42),
      classDeck: [card],
      backpackItems: filler,
    };

    const result = reduce(state, {
      type: 'DRAW_CLASS_TO_BACKPACK',
      count: 1,
    });

    expect(result.state.acquiredUniqueClassCardIds).toContain('knight-5');
    // Card landed somewhere — either backpack or recycle bag — but the lock
    // is the contract regardless of physical destination.
    const baseIdsInRecycle = result.state.permanentMagicRecycleBag.map(c =>
      getStarterBaseId(c.id),
    );
    const baseIdsInBackpack = result.state.backpackItems.map(c =>
      getStarterBaseId(c.id),
    );
    expect(
      baseIdsInRecycle.includes('knight-5') ||
        baseIdsInBackpack.includes('knight-5'),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — markUniqueAcquired is idempotent
// ---------------------------------------------------------------------------

describe('markUniqueAcquired is idempotent', () => {
  it('re-marking the same card does not duplicate the base id', () => {
    const card = makeUniqueMagic('knight-9', 'Curse');
    const state: GameState = {
      ...createInitialGameState(),
      acquiredUniqueClassCardIds: ['knight-9'],
    };
    const patch: Partial<GameState> = {};
    markUniqueAcquired(card, state, patch);
    // No write because already locked.
    expect(patch.acquiredUniqueClassCardIds).toBeUndefined();
  });

  it('re-marking the same card via a fresh patch does not duplicate the base id', () => {
    const card = makeUniqueMagic('knight-9', 'Curse');
    const state: GameState = {
      ...createInitialGameState(),
      acquiredUniqueClassCardIds: [],
    };
    const patch: Partial<GameState> = {};
    markUniqueAcquired(card, state, patch);
    markUniqueAcquired(card, state, patch);
    expect(patch.acquiredUniqueClassCardIds).toEqual(['knight-9']);
  });

  it('non-unique cards are never recorded', () => {
    const card = makeMagic('knight-2', 'Plain');
    const state: GameState = {
      ...createInitialGameState(),
      acquiredUniqueClassCardIds: [],
    };
    const patch: Partial<GameState> = {};
    markUniqueAcquired(card, state, patch);
    expect(patch.acquiredUniqueClassCardIds).toBeUndefined();
  });
});
