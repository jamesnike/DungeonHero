/**
 * Spell Echo (法术回响) — discover-class flavoured cards now re-prompt the
 * discover modal (echoMultiplier - 1) extra times via
 * `pendingClassDiscoverQueue` (Phase 1 of B* → B promotion).
 *
 * Cards covered:
 *   1. STARTER 「专属感召」 (discover-class-to-hand)
 *   2. 「祭坛秘术 — 发现」 (altar-discover-class-magic)
 *   3. 「祭坛秘术 — 弃 2 发现 1」 (altar-discard-discover)
 *
 * Note: discover-modal opening is driven by the UI hook (`beginDiscoverFlow`
 * in `useShopHandlers.ts`) listening to `card:discoverRequested` and then
 * dispatching `BEGIN_DISCOVER`. These tests simulate that hop by manually
 * dispatching `BEGIN_DISCOVER` after observing the side effect, and then
 * `RESOLVE_DISCOVER_SELECTION` to drive the queue drain.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { createStarterDiscoverClassToHandCard } from '../deck';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { SideEffect } from '../event-bus';

function makeClassMagicCard(id: string, name: string): GameCardData {
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    knightEffect: 'noop',
    magicEffect: 'noop',
  } as GameCardData;
}

function makeClassWeaponCard(id: string, name: string): GameCardData {
  return {
    id,
    type: 'weapon',
    name,
    value: 2,
  } as GameCardData;
}

function getDiscoverEvent(sideEffects: SideEffect[]) {
  return sideEffects.filter(e => e.event === 'card:discoverRequested');
}

describe('Spell Echo on STARTER discover-class-to-hand (「专属感召」)', () => {
  it('echo×2 fires one discover side-effect immediately and queues 1 extra', () => {
    const card = createStarterDiscoverClassToHandCard();
    const classCards: GameCardData[] = [
      makeClassMagicCard('cls-m1', '专属魔法甲'),
      makeClassMagicCard('cls-m2', '专属魔法乙'),
      makeClassWeaponCard('cls-w1', '专属武器丙'),
      makeClassWeaponCard('cls-w2', '专属武器丁'),
    ];
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(123),
      handCards: [card],
      classDeck: classCards,
      doubleNextMagic: true,
    };

    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    const finalState = drained.state;
    const allSideEffects = [...initial.sideEffects, ...drained.sideEffects];

    const discoverEvents = getDiscoverEvent(allSideEffects);
    expect(discoverEvents.length).toBe(1);
    expect((discoverEvents[0].payload as { delivery: string }).delivery).toBe('hand-first');

    expect(finalState.pendingClassDiscoverQueue.length).toBe(1);
    expect(finalState.pendingClassDiscoverQueue[0]).toMatchObject({
      source: 'starter-discover-class-to-hand',
      delivery: 'hand-first',
    });
    expect(finalState.pendingClassDiscoverQueue[0].magicOnly).toBeFalsy();
    expect(finalState.doubleNextMagic).toBe(false);
  });

  it('after first discover resolves, queue drain triggers a second BEGIN_DISCOVER (using full classDeck)', () => {
    const card = createStarterDiscoverClassToHandCard();
    const classCards: GameCardData[] = [
      makeClassMagicCard('cls-m1', '专属魔法甲'),
      makeClassMagicCard('cls-m2', '专属魔法乙'),
      makeClassWeaponCard('cls-w1', '专属武器丙'),
      makeClassWeaponCard('cls-w2', '专属武器丁'),
    ];
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(7),
      handCards: [card],
      classDeck: classCards,
      doubleNextMagic: true,
    };

    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    const afterPlay = drained.state;

    // Simulate the UI hook reacting to `card:discoverRequested`:
    const discoverEvents = getDiscoverEvent([...initial.sideEffects, ...drained.sideEffects]);
    expect(discoverEvents.length).toBe(1);
    const candidates = (discoverEvents[0].payload as { candidates: GameCardData[] }).candidates;
    const afterBegin = reduce(afterPlay, {
      type: 'BEGIN_DISCOVER',
      source: 'starter-discover-class-to-hand',
      pool: candidates,
      sourceLabel: '专属感召',
      delivery: 'hand-first',
    });

    expect(afterBegin.state.discoverModalOpen).toBe(true);
    const firstChoice = afterBegin.state.discoverOptions[0];
    expect(firstChoice).toBeTruthy();

    // Resolve the first selection — queue should drain → second BEGIN_DISCOVER enqueued.
    const afterFirstSelect = reduce(afterBegin.state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: firstChoice.id,
    });
    const afterSecondPrompt = drain(afterFirstSelect.state, afterFirstSelect.enqueuedActions ?? []);

    expect(afterSecondPrompt.state.discoverModalOpen).toBe(true);
    expect(afterSecondPrompt.state.discoverDelivery).toBe('hand-first');
    expect(afterSecondPrompt.state.pendingClassDiscoverQueue.length).toBe(0);
    expect(afterSecondPrompt.state.discoverOptions.length).toBeGreaterThan(0);

    const secondChoice = afterSecondPrompt.state.discoverOptions[0];
    const afterSecondSelect = reduce(afterSecondPrompt.state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: secondChoice.id,
    });
    expect(afterSecondSelect.state.discoverModalOpen).toBe(false);
    expect(afterSecondSelect.state.pendingClassDiscoverQueue.length).toBe(0);
  });

  it('echo×1 (no doubleNextMagic) only fires one discover side-effect, no queue entry', () => {
    const card = createStarterDiscoverClassToHandCard();
    const classCards: GameCardData[] = [
      makeClassMagicCard('cls-m1', 'A'),
      makeClassMagicCard('cls-m2', 'B'),
      makeClassMagicCard('cls-m3', 'C'),
    ];
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(99),
      handCards: [card],
      classDeck: classCards,
      doubleNextMagic: false,
    };

    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    expect(drained.state.pendingClassDiscoverQueue.length).toBe(0);
  });
});

describe('Queue drain — second BEGIN_DISCOVER applies magicOnly filter', () => {
  it('manually-queued entry with magicOnly: true filters classDeck to magic cards only', () => {
    const classCards: GameCardData[] = [
      makeClassMagicCard('cls-m1', 'M1'),
      makeClassMagicCard('cls-m2', 'M2'),
      makeClassMagicCard('cls-m3', 'M3'),
      makeClassWeaponCard('cls-w1', 'W1'),
      makeClassWeaponCard('cls-w2', 'W2'),
    ];
    const candidate = makeClassMagicCard('cls-m1', 'M1');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(77),
      classDeck: classCards,
      discoverModalOpen: true,
      discoverOptions: [candidate],
      pendingClassDiscoverQueue: [
        { source: 'altar-discover-class-magic', sourceLabel: '祭坛秘术', magicOnly: true },
      ],
    };

    const afterFirstSelect = reduce(state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: candidate.id,
    });
    const afterSecondModal = drain(afterFirstSelect.state, afterFirstSelect.enqueuedActions ?? []).state;

    expect(afterSecondModal.discoverModalOpen).toBe(true);
    afterSecondModal.discoverOptions.forEach(c => {
      expect(c.type === 'magic' || c.type === 'hero-magic').toBe(true);
    });
    expect(afterSecondModal.pendingClassDiscoverQueue.length).toBe(0);
  });

  it('manually-queued entry without magicOnly uses full classDeck (legacy semantics)', () => {
    const classCards: GameCardData[] = [
      makeClassMagicCard('cls-m1', 'M1'),
      makeClassWeaponCard('cls-w1', 'W1'),
      makeClassWeaponCard('cls-w2', 'W2'),
    ];
    const candidate = makeClassMagicCard('cls-m1', 'M1');
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(11),
      classDeck: classCards,
      discoverModalOpen: true,
      discoverOptions: [candidate],
      pendingClassDiscoverQueue: [
        { source: 'starter-discover-class-to-hand', sourceLabel: '专属感召', delivery: 'hand-first' },
      ],
    };

    const afterFirstSelect = reduce(state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: candidate.id,
    });
    const afterSecondModal = drain(afterFirstSelect.state, afterFirstSelect.enqueuedActions ?? []).state;

    expect(afterSecondModal.discoverModalOpen).toBe(true);
    expect(afterSecondModal.discoverDelivery).toBe('hand-first');
    const types = new Set(afterSecondModal.discoverOptions.map(c => c.type));
    expect(types.has('weapon') || types.has('magic')).toBe(true);
  });
});

describe('Spell Echo on altar-discard-discover (祭坛秘术 — 弃 2 发现 1)', () => {
  it('echo×2 propagates echoMultiplier through hand-discard modal and queues 1 extra', () => {
    const card: GameCardData = {
      id: 'altar-discard-discover-1',
      type: 'magic',
      name: '祭坛秘术',
      value: 0,
      magicEffect: 'altar-discard-discover',
    } as GameCardData;
    const filler1 = makeClassMagicCard('h1', '手牌1');
    const filler2 = makeClassMagicCard('h2', '手牌2');
    const classCards: GameCardData[] = [
      makeClassMagicCard('cls-m1', 'M1'),
      makeClassMagicCard('cls-m2', 'M2'),
      makeClassMagicCard('cls-m3', 'M3'),
    ];
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(55),
      handCards: [card, filler1, filler2],
      classDeck: classCards,
      doubleNextMagic: true,
    };

    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const afterPlay = drain(initial.state, initial.enqueuedActions ?? []).state;

    expect(afterPlay.pendingHandDiscardSelection).toBeTruthy();
    expect(afterPlay.pendingHandDiscardSelection?.context.kind).toBe('altar-discover');
    expect(
      (afterPlay.pendingHandDiscardSelection?.context as { kind: 'altar-discover'; echoMultiplier?: number }).echoMultiplier,
    ).toBe(2);

    const afterDiscardSelect = reduce(afterPlay, {
      type: 'RESOLVE_HAND_DISCARD_SELECTION',
      cardIds: [filler1.id, filler2.id],
    });
    const afterDiscoverEmit = drain(afterDiscardSelect.state, afterDiscardSelect.enqueuedActions ?? []);

    const discoverEvents = getDiscoverEvent([
      ...afterDiscardSelect.sideEffects,
      ...afterDiscoverEmit.sideEffects,
    ]);
    expect(discoverEvents.length).toBeGreaterThanOrEqual(1);

    expect(afterDiscoverEmit.state.pendingClassDiscoverQueue.length).toBe(1);
    expect(afterDiscoverEmit.state.pendingClassDiscoverQueue[0]).toMatchObject({
      source: 'altar-discard-discover',
      magicOnly: true,
    });
  });

  it('auto-discard path (handCards < 2) also propagates echoMultiplier', () => {
    const card: GameCardData = {
      id: 'altar-discard-discover-2',
      type: 'magic',
      name: '祭坛秘术',
      value: 0,
      magicEffect: 'altar-discard-discover',
    } as GameCardData;
    const classCards: GameCardData[] = [
      makeClassMagicCard('cls-m1', 'M1'),
      makeClassMagicCard('cls-m2', 'M2'),
      makeClassMagicCard('cls-m3', 'M3'),
    ];
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(13),
      handCards: [card],
      classDeck: classCards,
      doubleNextMagic: true,
    };

    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const afterPlay = drain(initial.state, initial.enqueuedActions ?? []);

    expect(afterPlay.state.pendingHandDiscardSelection).toBeNull();
    const allSideEffects = [...initial.sideEffects, ...afterPlay.sideEffects];
    const discoverEvents = getDiscoverEvent(allSideEffects);
    expect(discoverEvents.length).toBeGreaterThanOrEqual(1);

    expect(afterPlay.state.pendingClassDiscoverQueue.length).toBe(1);
    expect(afterPlay.state.pendingClassDiscoverQueue[0]).toMatchObject({
      source: 'altar-discard-discover',
      magicOnly: true,
    });
  });
});
