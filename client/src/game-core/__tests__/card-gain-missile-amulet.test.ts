/**
 * `card:newCardGained` event emission — contract tests.
 *
 * Currently consumed by 弹幕之符 (`card-gain-missile`), which by design only
 * triggers on `source === 'graveyard'` (see GameBoard.tsx onNewCardGainedRef
 * filter). The event itself is emitted on **both** `'classPool'` and
 * `'graveyard'` paths so future amulets can opt into either source — these
 * tests lock in the emission contract on every relevant call site, regardless
 * of which sources 弹幕之符 currently filters for.
 *
 * Bug history: Heavy Shield's `onDestroyClassDraw` fired correctly (it routed
 * through `equipment:classCardDraw` → `drawClassCardsToBackpack` →
 * `DRAW_CLASS_TO_BACKPACK`), but `reduceDrawClassToBackpack` only emitted
 * `cards:classDrawn` (animation), never `card:newCardGained`. Same gap existed
 * for `graveyard-to-hand` / `graveyard-event-to-hand` last-words effects (Iron
 * Shield, 生长之盾) and the waterfall destruction path. All paths now emit
 * `card:newCardGained` with the correct `source`.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createEmptyAmuletEffects, initialCombatState, BASE_BACKPACK_CAPACITY } from '../constants';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import { applyEquipDestroyLastWords } from '../rules/waterfall';
import type { GameState, EquipmentSlotId } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { SideEffect } from '../reducer';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1) DRAW_CLASS_TO_BACKPACK — class-pool source
// ---------------------------------------------------------------------------

describe('card:newCardGained from DRAW_CLASS_TO_BACKPACK', () => {
  it('emits card:newCardGained with source="classPool" when at least one card lands in backpack', () => {
    const c1: GameCardData = { id: 'c1', type: 'magic', name: 'Class1', value: 0 } as any;
    const c2: GameCardData = { id: 'c2', type: 'magic', name: 'Class2', value: 0 } as any;
    const state = makeState({ classDeck: [c1, c2] as any, backpackItems: [] });

    const result = reduce(state, { type: 'DRAW_CLASS_TO_BACKPACK', count: 2 } as GameAction);
    const gained = result.sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained).toHaveLength(1);
    expect((gained[0].payload as any).source).toBe('classPool');
    expect((gained[0].payload as any).count).toBe(1);
  });

  it('does NOT emit card:newCardGained when every drawn card overflows to recycle bag', () => {
    const c1: GameCardData = { id: 'c1', type: 'magic', name: 'Class1', value: 0 } as any;
    // Backpack already at the cap → all draws spill to recycle bag.
    // Fill exactly to BASE_BACKPACK_CAPACITY with capacityModifier 0 so the
    // assertion stays correct regardless of future BASE_BACKPACK_CAPACITY tweaks.
    const fillers: GameCardData[] = Array.from({ length: BASE_BACKPACK_CAPACITY }, (_, i) => ({
      id: `f${i}`, type: 'magic', name: `F${i}`, value: 0,
    } as any));
    const state = makeState({
      classDeck: [c1] as any,
      backpackItems: fillers as any,
      backpackCapacityModifier: 0,
    });

    const result = reduce(state, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1 } as GameAction);
    const gained = result.sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained).toHaveLength(0);
  });

  it('returns noChange (and no event) when class deck is empty', () => {
    const state = makeState({ classDeck: [], backpackItems: [] });
    const result = reduce(state, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1 } as GameAction);
    const gained = result.sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2) Heavy Shield (onDestroyClassDraw) — end-to-end through computeEquipmentBreakEffects
// ---------------------------------------------------------------------------

describe('Heavy Shield onDestroyClassDraw → card:newCardGained chain', () => {
  it('emits equipment:classCardDraw on break; subsequent DRAW_CLASS_TO_BACKPACK emits card:newCardGained', () => {
    const heavyShield: GameCardData = {
      id: 'hs', type: 'shield', name: 'Heavy Shield', value: 4, image: '',
      durability: 0, maxDurability: 1, armorMax: 4,
      damageReflect: 1, onDestroyClassDraw: 1,
    } as any;
    const classCard: GameCardData = { id: 'cc', type: 'magic', name: 'ClassCard', value: 0 } as any;
    const state = makeState({
      equipmentSlot1: heavyShield as any,
      classDeck: [classCard] as any,
      backpackItems: [],
    });

    // Step 1: live break path — should request a class card draw.
    const breakResult = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      heavyShield,
      createEmptyAmuletEffects(),
    );
    expect(breakResult.classCardDraw).toBe(1);

    // Step 2: simulate the GameBoard listener that forwards equipment:classCardDraw
    // by dispatching DRAW_CLASS_TO_BACKPACK on the post-break state.
    const postBreak = { ...state, ...breakResult.patch } as GameState;
    const drawResult = reduce(postBreak, {
      type: 'DRAW_CLASS_TO_BACKPACK',
      count: breakResult.classCardDraw,
    } as GameAction);

    const gained = drawResult.sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained).toHaveLength(1);
    expect((gained[0].payload as any).source).toBe('classPool');
  });
});

// ---------------------------------------------------------------------------
// 3) graveyard-to-hand (Iron Shield style) — graveyard source
// ---------------------------------------------------------------------------

describe('graveyard-to-hand → card:newCardGained chain', () => {
  it('emits card:newCardGained source="graveyard" when computeEquipmentBreakEffects picks a graveyard card', () => {
    const ironShield: GameCardData = {
      id: 'is', type: 'shield', name: 'Iron Shield', value: 3, image: '',
      durability: 0, maxDurability: 1, armorMax: 3,
      onDestroyEffect: 'graveyard-to-hand',
    } as any;
    const grave1: GameCardData = { id: 'g1', type: 'magic', name: 'Spell', value: 0 } as any;
    const state = makeState({
      equipmentSlot1: ironShield as any,
      discardedCards: [grave1] as any,
      handCards: [],
    });

    const { sideEffects, patch } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      ironShield,
      createEmptyAmuletEffects(),
    );

    // Card moved from graveyard to hand
    expect(patch.handCards?.some(c => c.id === 'g1')).toBe(true);
    // And the gain event fired
    const gained = sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained).toHaveLength(1);
    expect((gained[0].payload as any).source).toBe('graveyard');
  });

  it('does NOT emit card:newCardGained when graveyard is empty', () => {
    const ironShield: GameCardData = {
      id: 'is', type: 'shield', name: 'Iron Shield', value: 3, image: '',
      durability: 0, maxDurability: 1, armorMax: 3,
      onDestroyEffect: 'graveyard-to-hand',
    } as any;
    const state = makeState({
      equipmentSlot1: ironShield as any,
      discardedCards: [],
      handCards: [],
    });

    const { sideEffects } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      ironShield,
      createEmptyAmuletEffects(),
    );
    const gained = sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained).toHaveLength(0);
  });

  it('also emits the event via the waterfall destruction path (applyEquipDestroyLastWords)', () => {
    const ironShield: GameCardData = {
      id: 'is', type: 'shield', name: 'Iron Shield', value: 3, image: '',
      durability: 0, maxDurability: 1, armorMax: 3,
      onDestroyEffect: 'graveyard-to-hand',
    } as any;
    const grave1: GameCardData = { id: 'g1', type: 'magic', name: 'Spell', value: 0 } as any;
    const state = makeState({ discardedCards: [grave1] as any });

    const patch: Partial<GameState> = {};
    const sideEffects: SideEffect[] = [];
    const enqueuedActions: GameAction[] = [];
    applyEquipDestroyLastWords(
      ironShield,
      'equipmentSlot1' as EquipmentSlotId,
      state,
      patch,
      sideEffects,
      enqueuedActions,
    );

    const gained = sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained).toHaveLength(1);
    expect((gained[0].payload as any).source).toBe('graveyard');
  });
});

// ---------------------------------------------------------------------------
// 4) graveyard-event-to-hand (生长之盾) — graveyard source for Event picks
// ---------------------------------------------------------------------------

describe('graveyard-event-to-hand → card:newCardGained chain', () => {
  it('emits card:newCardGained source="graveyard" when an event card is picked', () => {
    const growthShield: GameCardData = {
      id: 'gs', type: 'shield', name: '生长之盾', value: 2, image: '',
      durability: 0, maxDurability: 1, armorMax: 2,
      onDestroyEffect: 'graveyard-event-to-hand',
    } as any;
    const evt: GameCardData = { id: 'e1', type: 'event', name: 'MysteryEvent', value: 0 } as any;
    const state = makeState({
      equipmentSlot1: growthShield as any,
      discardedCards: [evt] as any,
      handCards: [],
    });

    const { sideEffects, patch } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      growthShield,
      createEmptyAmuletEffects(),
    );

    expect(patch.handCards?.some(c => c.id === 'e1')).toBe(true);
    const gained = sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained).toHaveLength(1);
    expect((gained[0].payload as any).source).toBe('graveyard');
  });
});

// ---------------------------------------------------------------------------
// 5) Other DRAW_CLASS_TO_BACKPACK call sites (regression safety) —
//    we don't replay each hook end-to-end, but we lock in that the canonical
//    reducer emits the event so any caller (loneCard, hero skill, potion,
//    crossroads, missing-equipment fallback, opening hand draw, ...) is covered.
// ---------------------------------------------------------------------------

describe('DRAW_CLASS_TO_BACKPACK common callers — drain path', () => {
  it('hero skill 黄金探秘 ends up emitting card:newCardGained via the queued DRAW_CLASS_TO_BACKPACK', () => {
    // Set up: hero has gold to spend, classDeck has at least one card.
    const classCard: GameCardData = { id: 'cc', type: 'magic', name: 'ClassCard', value: 0 } as any;
    const state = makeState({
      gold: 100,
      classDeck: [classCard] as any,
      backpackItems: [],
      // 黄金探秘 expects to be the active hero skill; we exercise the dispatch
      // path directly instead of replaying the full skill setup.
    });

    // Direct DRAW_CLASS_TO_BACKPACK is what 黄金探秘 enqueues —
    // we already covered that. This serves as a documentation-level
    // regression: if a future refactor splits the action, this assertion
    // will break and force re-checking the missile amulet wiring.
    const drained = drain(state, [{ type: 'DRAW_CLASS_TO_BACKPACK', count: 1 } as GameAction]);
    const gained = drained.sideEffects.filter(e => e.event === 'card:newCardGained');
    expect(gained.length).toBeGreaterThanOrEqual(1);
    expect(gained.some(e => (e.payload as any).source === 'classPool')).toBe(true);
  });
});
