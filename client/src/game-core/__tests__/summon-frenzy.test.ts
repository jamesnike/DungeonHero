/**
 * 永恒护符·狂热发现 (`summon-frenzy`) — stackable aura effect.
 *
 * Granted by the stackable class potion 「狂热发现」
 * (`potionEffect: 'grant-eternal-relic-summon-frenzy'`).
 *
 * Aura active iff:
 *   - hero holds at least one `summon-frenzy` relic, AND
 *   - `state.backpackItems.length > 10` (i.e. 11+ cards).
 *
 * When active, playing 「专属感召」 (`STARTER_CARD_IDS.discoverClassToHand`)
 * queues **(1 + N) total discover modals** where
 *   `N = countEternalRelics(state.eternalRelics, 'summon-frenzy')`.
 *
 * The +N "frenzy extras" are added to the SAME `pendingClassDiscoverQueue`
 * that already handles Spell Echo's extras — they stack additively
 * (`totalExtras = echoExtras + frenzyExtras`).
 *
 * Per `pipeline-input-continuation.mdc`: PLAY_CARD chains run with
 * `phase: 'playerInput'` to match real-game drain semantics. Per
 * `card-data-to-ui-tag-coverage.mdc`, this test does NOT modify the
 * unique-card snapshot (the potion is stackable, not unique).
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { createStarterDiscoverClassToHandCard } from '../deck';
import {
  hasEternalRelic,
  countEternalRelics,
  getEternalRelic,
  STACKABLE_RELIC_IDS,
} from '@/lib/eternalRelics';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    rng: createRng(123),
    ...overrides,
  };
}

function makeFrenzyRelic() {
  return getEternalRelic('summon-frenzy');
}

function makeFrenzyRelics(count: number) {
  return Array.from({ length: count }, () => makeFrenzyRelic());
}

// Use the production factory so the card's id matches
// `STARTER_CARD_IDS.discoverClassToHand`, which is required for the resolver
// branch in `resolvePermanentMagic` to fire.
function makeDiscoverCard(): GameCardData {
  return createStarterDiscoverClassToHandCard();
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

function makeBackpack(count: number, prefix = 'bp'): GameCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    type: 'magic' as const,
    name: `Junk-${i}`,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData));
}

function makeClassDeck(count = 5): GameCardData[] {
  return Array.from({ length: count }, (_, i) =>
    makeClassCard(`cls-${i}`, `专属${i}`),
  );
}

function makeFrenzyPotion(id = 'pot-frenzy'): GameCardData {
  return {
    id,
    type: 'potion' as const,
    name: '狂热发现',
    value: 0,
    image: '',
    classCard: true,
    potionEffect: 'grant-eternal-relic-summon-frenzy',
  } as GameCardData;
}

// Drives the same PLAY_CARD → drain path the game uses and returns the
// post-drain state + collected side effects.
function playDiscoverCard(state: GameState, card: GameCardData) {
  const stateWithCard = { ...state, handCards: [card] };
  const initial = reduce(stateWithCard, { type: 'PLAY_CARD', cardId: card.id });
  const drained = drain(initial.state, initial.enqueuedActions ?? []);
  return {
    state: drained.state,
    sideEffects: [...initial.sideEffects, ...drained.sideEffects],
  };
}

// ---------------------------------------------------------------------------
// Section 1: Baseline (no relic) — backpack size irrelevant
// ---------------------------------------------------------------------------

describe('summon-frenzy — baseline (no relic)', () => {
  it('×0 relics + backpack=11: only 1 discover modal, queue empty', () => {
    const state = makeState({
      eternalRelics: [],
      backpackItems: makeBackpack(11),
      classDeck: makeClassDeck(),
    });
    const { state: out, sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    const discoverEvents = sideEffects.filter(
      e => e.event === 'card:discoverRequested',
    );
    expect(discoverEvents.length).toBe(1);
    expect(out.pendingClassDiscoverQueue.length).toBe(0);
  });

  it('×0 relics + backpack=0: still only 1 modal, queue empty', () => {
    const state = makeState({
      eternalRelics: [],
      backpackItems: [],
      classDeck: makeClassDeck(),
    });
    const { state: out, sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    expect(sideEffects.filter(e => e.event === 'card:discoverRequested').length).toBe(1);
    expect(out.pendingClassDiscoverQueue.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Threshold gating (strict > 10)
// ---------------------------------------------------------------------------

describe('summon-frenzy — strict > 10 threshold', () => {
  it('×1 relic + backpack=10 (boundary): aura off → no extras', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(1),
      backpackItems: makeBackpack(10),
      classDeck: makeClassDeck(),
    });
    const { state: out, sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    expect(sideEffects.filter(e => e.event === 'card:discoverRequested').length).toBe(1);
    expect(out.pendingClassDiscoverQueue.length).toBe(0);
  });

  it('×1 relic + backpack=11: +1 extra → 1 modal + 1 queued', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(1),
      backpackItems: makeBackpack(11),
      classDeck: makeClassDeck(),
    });
    const { state: out, sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    expect(sideEffects.filter(e => e.event === 'card:discoverRequested').length).toBe(1);
    expect(out.pendingClassDiscoverQueue.length).toBe(1);
    expect(out.pendingClassDiscoverQueue[0].source).toBe('starter-discover-class-to-hand');
    expect(out.pendingClassDiscoverQueue[0].delivery).toBe('hand-first');
    expect(out.pendingClassDiscoverQueue[0].sourceLabel).toBe('专属感召');
  });

  it('×2 relics + backpack=5: aura off (≤10) → no extras (stack count irrelevant)', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(2),
      backpackItems: makeBackpack(5),
      classDeck: makeClassDeck(),
    });
    const { state: out, sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    expect(sideEffects.filter(e => e.event === 'card:discoverRequested').length).toBe(1);
    expect(out.pendingClassDiscoverQueue.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Section 3: Per-stack scaling
// ---------------------------------------------------------------------------

describe('summon-frenzy — per-stack scaling above threshold', () => {
  it('×2 relics + backpack=12: +2 extras → 1 modal + 2 queued', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(2),
      backpackItems: makeBackpack(12),
      classDeck: makeClassDeck(),
    });
    const { state: out } = playDiscoverCard(state, makeDiscoverCard());

    expect(out.pendingClassDiscoverQueue.length).toBe(2);
    for (const entry of out.pendingClassDiscoverQueue) {
      expect(entry.source).toBe('starter-discover-class-to-hand');
      expect(entry.delivery).toBe('hand-first');
    }
  });

  it('×3 relics + backpack=20: +3 extras → 1 modal + 3 queued', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(3),
      backpackItems: makeBackpack(20),
      classDeck: makeClassDeck(),
    });
    const { state: out } = playDiscoverCard(state, makeDiscoverCard());

    expect(out.pendingClassDiscoverQueue.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Spell Echo + frenzy stack additively
// ---------------------------------------------------------------------------

describe('summon-frenzy — additive with Spell Echo', () => {
  it('echo×2 + ×1 relic + backpack=11: 1 echo + 1 frenzy → 1 modal + 2 queued', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(1),
      backpackItems: makeBackpack(11),
      classDeck: makeClassDeck(),
      doubleNextMagic: true,
    });
    const { state: out, sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    expect(sideEffects.filter(e => e.event === 'card:discoverRequested').length).toBe(1);
    expect(out.pendingClassDiscoverQueue.length).toBe(2);
    // doubleNextMagic should be consumed by the engine echo machinery.
    expect(out.doubleNextMagic).toBe(false);
  });

  it('echo×2 + ×2 relics + backpack=12: 1 echo + 2 frenzy → 1 modal + 3 queued', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(2),
      backpackItems: makeBackpack(12),
      classDeck: makeClassDeck(),
      doubleNextMagic: true,
    });
    const { state: out } = playDiscoverCard(state, makeDiscoverCard());

    expect(out.pendingClassDiscoverQueue.length).toBe(3);
  });

  it('echo×2 + ×1 relic + backpack=10 (below threshold): 1 echo + 0 frenzy → 1 modal + 1 queued', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(1),
      backpackItems: makeBackpack(10),
      classDeck: makeClassDeck(),
      doubleNextMagic: true,
    });
    const { state: out } = playDiscoverCard(state, makeDiscoverCard());

    expect(out.pendingClassDiscoverQueue.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Section 5: Banner copy
// ---------------------------------------------------------------------------

describe('summon-frenzy — banner copy', () => {
  it('banner contains "狂热发现×N" suffix when frenzy extras fire', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(2),
      backpackItems: makeBackpack(11),
      classDeck: makeClassDeck(),
    });
    const { sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    const banners = sideEffects.filter(e => e.event === 'ui:banner');
    const text = banners
      .map(b => (b.payload as { text: string }).text)
      .join(' | ');
    expect(text).toContain('狂热发现×2');
    expect(text).toContain('额外触发 2 次');
    expect(text).toContain('发现 3 张专属牌');
  });

  it('no "狂热发现" suffix when aura is off (no relic)', () => {
    const state = makeState({
      eternalRelics: [],
      backpackItems: makeBackpack(20),
      classDeck: makeClassDeck(),
    });
    const { sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    const banners = sideEffects.filter(e => e.event === 'ui:banner');
    const text = banners
      .map(b => (b.payload as { text: string }).text)
      .join(' | ');
    expect(text).not.toContain('狂热发现');
  });

  it('no "狂热发现" suffix when aura is below threshold', () => {
    const state = makeState({
      eternalRelics: makeFrenzyRelics(3),
      backpackItems: makeBackpack(10),
      classDeck: makeClassDeck(),
    });
    const { sideEffects } = playDiscoverCard(state, makeDiscoverCard());

    const banners = sideEffects.filter(e => e.event === 'ui:banner');
    const text = banners
      .map(b => (b.payload as { text: string }).text)
      .join(' | ');
    expect(text).not.toContain('狂热发现');
  });
});

// ---------------------------------------------------------------------------
// Section 6: Stackable potion grants relic on each drink
// ---------------------------------------------------------------------------

describe('狂热发现 (potion) — grants stackable relic on each drink', () => {
  it('drinking N times stacks N copies in eternalRelics', () => {
    let state = makeState({
      eternalRelics: [],
      handCards: [],
    });

    for (let i = 1; i <= 3; i++) {
      const potion = makeFrenzyPotion(`p${i}`);
      state = { ...state, handCards: [potion] };
      const r = reduce(state, { type: 'RESOLVE_POTION', cardId: potion.id, card: potion });
      state = r.state;

      expect(hasEternalRelic(state.eternalRelics ?? [], 'summon-frenzy')).toBe(true);
      expect(countEternalRelics(state.eternalRelics ?? [], 'summon-frenzy')).toBe(i);
    }
  });

  it("'summon-frenzy' is registered in STACKABLE_RELIC_IDS", () => {
    expect(STACKABLE_RELIC_IDS.has('summon-frenzy')).toBe(true);
  });

  it('registry entry exists and has matching id', () => {
    const relic = getEternalRelic('summon-frenzy');
    expect(relic.id).toBe('summon-frenzy');
    expect(relic.name).toBe('永恒护符·狂热发现');
  });
});

// ---------------------------------------------------------------------------
// Section 7: end-to-end potion → relic → discover combo
// ---------------------------------------------------------------------------

describe('summon-frenzy — end-to-end potion → relic → discover', () => {
  it('drink potion, then play 专属感召 with backpack>10 → 1 modal + 1 queued', () => {
    const potion = makeFrenzyPotion();
    let state = makeState({
      eternalRelics: [],
      handCards: [potion],
      backpackItems: makeBackpack(15),
      classDeck: makeClassDeck(),
    });

    // Drink the potion.
    const drink = reduce(state, { type: 'RESOLVE_POTION', cardId: potion.id, card: potion });
    state = drink.state;
    expect(countEternalRelics(state.eternalRelics ?? [], 'summon-frenzy')).toBe(1);

    // Now play 专属感召.
    const { state: afterDiscover, sideEffects } = playDiscoverCard(
      state,
      makeDiscoverCard(),
    );
    expect(sideEffects.filter(e => e.event === 'card:discoverRequested').length).toBe(1);
    expect(afterDiscover.pendingClassDiscoverQueue.length).toBe(1);
  });
});
