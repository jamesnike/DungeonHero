/**
 * Spell Echo (法术回响) — Phase 2: B* → B promotion for the three remaining
 * UI-delegated modal cards.
 *
 * Cards covered:
 *   1. 升级卷轴 (upgrade-scroll) — sets `upgradeModalMaxCount = echoMultiplier`
 *      so the existing CardUpgradeModal stays open for N consecutive picks.
 *   2. 秘法精炼 (arcane-refine) — sets `handMagicUpgradeModal.maxSelect = 2N`
 *      so HandMagicUpgradeModal accepts up to 2N selections in one shot.
 *   3. 破印遗物 (graveyard-discover-equip-amulet) — emits a side effect with
 *      `echoRemaining: N`. The hook (`useCardPlayHandlers.ts`) drives a loop
 *      that re-opens the graveyard discover modal N times — same shape as
 *      `card:cleanseDrawRequested`.
 *
 * For (3), we can only test the reducer surface (echoRemaining propagation).
 * The hook loop is exercised by integration / e2e — not unit-tested here.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { SideEffect } from '../event-bus';

function makeUpgradeScroll(): GameCardData {
  return {
    id: 'upgrade-scroll-test',
    type: 'magic',
    name: '升级卷轴',
    value: 0,
    magicType: 'instant',
    magicEffect: '即时魔法：升级一张牌。',
    knightEffect: 'noop',
  } as GameCardData;
}

function makeArcaneRefine(): GameCardData {
  return {
    id: 'arcane-refine-test',
    type: 'magic',
    name: '秘法精炼',
    value: 0,
    magicType: 'instant',
    magicEffect: '升级手牌中至多 2 张魔法牌。',
    knightEffect: 'noop',
  } as GameCardData;
}

function makeGraveyardDiscoverRelic(): GameCardData {
  return {
    id: 'graveyard-discover-test',
    type: 'magic',
    name: '破印遗物',
    value: 0,
    magicType: 'instant',
    knightEffect: 'graveyard-discover-equip-amulet',
    magicEffect: '一次性：从坟场发现一张装备或护符（三选一）。',
  } as GameCardData;
}

function makeWeapon(id: string, name: string): GameCardData {
  return { id, type: 'weapon', name, value: 2 } as GameCardData;
}

function makeShield(id: string, name: string): GameCardData {
  return { id, type: 'shield', name, value: 2 } as GameCardData;
}

function makeAmulet(id: string, name: string): GameCardData {
  return { id, type: 'amulet', name, value: 0, amuletEffect: 'gold+2' } as GameCardData;
}

function getSideEffect(sideEffects: SideEffect[], event: string) {
  return sideEffects.filter(e => e.event === event);
}

// ---------------------------------------------------------------------------
// 1. 升级卷轴 (upgrade-scroll)
// ---------------------------------------------------------------------------

describe('Spell Echo on 升级卷轴 (upgrade-scroll)', () => {
  it('普通使用：开 upgrade modal，maxCount = undefined（选 1 张后关闭）', () => {
    const card = makeUpgradeScroll();
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(1),
      handCards: [card],
      doubleNextMagic: false,
    };
    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    expect(drained.state.upgradeModalOpen).toBe(true);
    expect(drained.state.upgradeModalMaxCount).toBeUndefined();
  });

  it('echo×2：开 upgrade modal，maxCount = 2（让玩家连续升级 2 张）', () => {
    const card = makeUpgradeScroll();
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(2),
      handCards: [card],
      doubleNextMagic: true,
    };
    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    expect(drained.state.upgradeModalOpen).toBe(true);
    expect(drained.state.upgradeModalMaxCount).toBe(2);
    expect(drained.state.doubleNextMagic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. 秘法精炼 (arcane-refine)
// ---------------------------------------------------------------------------

describe('Spell Echo on 秘法精炼 (arcane-refine)', () => {
  it('普通使用：开 handMagicUpgradeModal，maxSelect = 2', () => {
    const card = makeArcaneRefine();
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(3),
      handCards: [card],
      doubleNextMagic: false,
    };
    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    expect(drained.state.handMagicUpgradeModal).toEqual({
      sourceCardId: card.id,
      maxSelect: 2,
    });
  });

  it('echo×2：开 handMagicUpgradeModal，maxSelect = 4（2 * echoMultiplier）', () => {
    const card = makeArcaneRefine();
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(4),
      handCards: [card],
      doubleNextMagic: true,
    };
    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    expect(drained.state.handMagicUpgradeModal).toEqual({
      sourceCardId: card.id,
      maxSelect: 4,
    });
    expect(drained.state.doubleNextMagic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. 破印遗物 (graveyard-discover-equip-amulet)
// ---------------------------------------------------------------------------

describe('Spell Echo on 破印遗物 (graveyard-discover-equip-amulet)', () => {
  it('普通使用：side effect 携带 echoRemaining = 1', () => {
    const card = makeGraveyardDiscoverRelic();
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(5),
      handCards: [card],
      discardedCards: [makeWeapon('w1', '剑'), makeShield('s1', '盾'), makeAmulet('a1', '符')],
      doubleNextMagic: false,
    };
    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    const allSideEffects = [...initial.sideEffects, ...drained.sideEffects];

    const events = getSideEffect(allSideEffects, 'card:graveyardDiscoverEquipAmulet');
    expect(events.length).toBe(1);
    const payload = events[0].payload as { card: GameCardData; echoRemaining: number };
    expect(payload.echoRemaining).toBe(1);
    expect(payload.card.id).toBe(card.id);
  });

  it('echo×2：side effect 携带 echoRemaining = 2，pendingMagicAction.echoRemaining = 2', () => {
    const card = makeGraveyardDiscoverRelic();
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(6),
      handCards: [card],
      discardedCards: [
        makeWeapon('w1', '剑'),
        makeShield('s1', '盾'),
        makeAmulet('a1', '符'),
        makeWeapon('w2', '锤'),
      ],
      doubleNextMagic: true,
    };
    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    const allSideEffects = [...initial.sideEffects, ...drained.sideEffects];

    const events = getSideEffect(allSideEffects, 'card:graveyardDiscoverEquipAmulet');
    expect(events.length).toBe(1);
    const payload = events[0].payload as { card: GameCardData; echoRemaining: number };
    expect(payload.echoRemaining).toBe(2);
    expect((drained.state.pendingMagicAction as any)?.echoRemaining).toBe(2);
    expect(drained.state.doubleNextMagic).toBe(false);
  });

  it('坟场为空：直接 banner + finalize，不发 graveyardDiscover side effect', () => {
    const card = makeGraveyardDiscoverRelic();
    const state: GameState = {
      ...createInitialGameState(),
      rng: createRng(7),
      handCards: [card],
      discardedCards: [],
      doubleNextMagic: true,
    };
    const initial = reduce(state, { type: 'PLAY_CARD', cardId: card.id });
    const drained = drain(initial.state, initial.enqueuedActions ?? []);
    const allSideEffects = [...initial.sideEffects, ...drained.sideEffects];

    const events = getSideEffect(allSideEffects, 'card:graveyardDiscoverEquipAmulet');
    expect(events.length).toBe(0);
  });
});
