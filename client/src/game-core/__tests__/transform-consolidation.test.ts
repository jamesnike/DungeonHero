/**
 * Transform consolidation tests — verifies that every "card play" path now
 * automatically threads through APPLY_TRANSFORM_CATEGORY at the reducer
 * level, without requiring the hook layer to remember to dispatch it.
 *
 * Paths covered:
 *   1. RESOLVE_MAGIC               (instant / perm magic, curses)
 *   2. RESOLVE_POTION
 *   3. SET_CURRENT_EVENT { card }  — and { card: null } must NOT trigger
 *   4. ACTIVATE_HERO_MAGIC → COMPLETE_HERO_MAGIC chain (hero magic now joins)
 *   5. PLACE_BUILDING_IN_DUNGEON   (new narrow action)
 *   6. EQUIP_FROM_HAND             (new thin marker)
 *   7. EQUIP_AMULET_FROM_HAND      (new thin marker)
 *   8. Original bug repro — Event then transform-effect magic should fire.
 *
 * The plan also relies on this consolidation to fix the useKnightSkill event
 * token path (useEventSystem.ts:1216) which dispatches RESOLVE_MAGIC without
 * an explicit transform call. Test #1 verifies that RESOLVE_MAGIC alone is
 * sufficient.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction, ApplyTransformCategoryAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

interface DispatchOutcome {
  state: GameState;
  enqueuedActions: GameAction[];
  drainedQueue: GameAction[];
}

/**
 * Drive a single dispatch the same way GameEngine.dispatch does:
 *   reduce → prepend enqueuedActions to actionQueue → drain.
 * Returns both the immediate enqueued actions and the post-drain state.
 */
function dispatchFull(state: GameState, action: GameAction): DispatchOutcome {
  const r = reduce(state, action);
  let s = r.state;
  if (r.enqueuedActions.length > 0) {
    s = { ...s, actionQueue: [...r.enqueuedActions, ...s.actionQueue] };
  }
  if (s.actionQueue.length > 0) {
    const dr = drain(s, s.actionQueue);
    s = { ...dr.state, actionQueue: dr.queue };
    return {
      state: s,
      enqueuedActions: r.enqueuedActions,
      drainedQueue: dr.queue,
    };
  }
  return { state: s, enqueuedActions: r.enqueuedActions, drainedQueue: [] };
}

function lastTransformAction(enqueued: GameAction[]): ApplyTransformCategoryAction | undefined {
  for (let i = enqueued.length - 1; i >= 0; i--) {
    const a = enqueued[i];
    if (a.type === 'APPLY_TRANSFORM_CATEGORY') return a;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 1. RESOLVE_MAGIC (also covers useKnightSkill event-token path)
// ---------------------------------------------------------------------------

describe('RESOLVE_MAGIC enqueues APPLY_TRANSFORM_CATEGORY', () => {
  it('reducer appends the transform action to enqueuedActions tail', () => {
    const card: GameCardData = {
      id: 'm1', type: 'magic', name: 'Test Magic', value: 0, image: '',
      magicType: 'permanent',
    } as GameCardData;
    const result = reduce(makeState(), {
      type: 'RESOLVE_MAGIC', cardId: card.id, card,
    } as GameAction);
    const tail = result.enqueuedActions[result.enqueuedActions.length - 1];
    expect(tail?.type).toBe('APPLY_TRANSFORM_CATEGORY');
    expect((tail as ApplyTransformCategoryAction).card.id).toBe('m1');
  });

  it('drives a transform fire after a category change (event → magic)', () => {
    const surveyCard: GameCardData = {
      id: 'survey-1', type: 'magic', name: '查阅动作', value: 0, image: '',
      magicType: 'permanent',
      transformBonus: '+3 金币',
      transformEffect: 'gold:3',
    } as GameCardData;

    // Pretend the previous play was an event card.
    const baseState = makeState({
      gold: 10,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });

    const out = dispatchFull(baseState, {
      type: 'RESOLVE_MAGIC', cardId: surveyCard.id, card: surveyCard,
    } as GameAction);

    expect(out.state.gold).toBe(13);
    expect(out.state.transformChainPrevCategory).toBe('perm-magic');
  });
});

// ---------------------------------------------------------------------------
// 2. RESOLVE_POTION
// ---------------------------------------------------------------------------

describe('RESOLVE_POTION enqueues APPLY_TRANSFORM_CATEGORY', () => {
  it('reducer appends the transform action to enqueuedActions tail', () => {
    const card: GameCardData = {
      id: 'p1', type: 'potion', name: 'Test Potion', value: 0, image: '',
    } as GameCardData;
    const result = reduce(makeState(), {
      type: 'RESOLVE_POTION', cardId: card.id, card,
    } as GameAction);
    const tail = result.enqueuedActions[result.enqueuedActions.length - 1];
    expect(tail?.type).toBe('APPLY_TRANSFORM_CATEGORY');
    expect((tail as ApplyTransformCategoryAction).card.id).toBe('p1');
  });

  it('drives a transform fire when previous category differs', () => {
    const potionCard: GameCardData = {
      id: 'p2', type: 'potion', name: 'Transform Potion', value: 0, image: '',
      transformBonus: '+3 金币',
      transformEffect: 'gold:3',
    } as GameCardData;
    const baseState = makeState({
      gold: 5,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });
    const out = dispatchFull(baseState, {
      type: 'RESOLVE_POTION', cardId: potionCard.id, card: potionCard,
    } as GameAction);
    expect(out.state.gold).toBe(8);
    expect(out.state.transformChainPrevCategory).toBe('potion');
  });
});

// ---------------------------------------------------------------------------
// 3. SET_CURRENT_EVENT
// ---------------------------------------------------------------------------

describe('SET_CURRENT_EVENT enqueues APPLY_TRANSFORM_CATEGORY only when a card is provided', () => {
  it('enqueues transform when card != null', () => {
    const eventCard: GameCardData = {
      id: 'e1', type: 'event', name: 'Test Event', value: 0, image: '',
    } as GameCardData;
    const result = reduce(makeState(), {
      type: 'SET_CURRENT_EVENT', card: eventCard,
    } as GameAction);
    const tail = result.enqueuedActions[result.enqueuedActions.length - 1];
    expect(tail?.type).toBe('APPLY_TRANSFORM_CATEGORY');
  });

  it('does NOT enqueue transform when clearing (card === null)', () => {
    const result = reduce(makeState({ currentEventCard: { id: 'old' } as any }), {
      type: 'SET_CURRENT_EVENT', card: null,
    } as GameAction);
    expect(result.enqueuedActions).toEqual([]);
    expect(result.state.currentEventCard).toBeNull();
  });

  it('drives a transform fire when previous category differs', () => {
    const eventCard: GameCardData = {
      id: 'e2', type: 'event', name: 'Transform Event', value: 0, image: '',
      transformBonus: '+3 金币',
      transformEffect: 'gold:3',
    } as GameCardData;
    const baseState = makeState({
      gold: 0,
      lastPlayedCardCategory: 'perm-magic',
      transformChainPrevCategory: 'perm-magic',
    });
    const out = dispatchFull(baseState, {
      type: 'SET_CURRENT_EVENT', card: eventCard,
    } as GameAction);
    expect(out.state.gold).toBe(3);
    expect(out.state.transformChainPrevCategory).toBe('event');
    expect(out.state.currentEventCard?.id).toBe('e2');
  });
});

// ---------------------------------------------------------------------------
// 4. ACTIVATE_HERO_MAGIC → COMPLETE_HERO_MAGIC
// ---------------------------------------------------------------------------

describe('Hero magic completion enqueues APPLY_TRANSFORM_CATEGORY', () => {
  it('COMPLETE_HERO_MAGIC reducer enqueues the transform with synthetic hero-magic card', () => {
    const result = reduce(makeState(), {
      type: 'COMPLETE_HERO_MAGIC', magicId: 'berserker-rage', origin: 'card',
    } as GameAction);
    const tail = result.enqueuedActions[result.enqueuedActions.length - 1];
    expect(tail?.type).toBe('APPLY_TRANSFORM_CATEGORY');
    const transformAction = tail as ApplyTransformCategoryAction;
    expect(transformAction.card.type).toBe('hero-magic');
    expect(transformAction.card.id).toBe('berserker-rage');
  });

  it('full ACTIVATE_HERO_MAGIC for berserker-rage updates lastPlayedCardCategory to hero-magic', () => {
    // Unlock berserker-rage so the activation succeeds.
    const baseState = makeState();
    const heroMagicState = {
      ...baseState.heroMagicState,
      'berserker-rage': {
        ...baseState.heroMagicState['berserker-rage'],
        unlocked: true,
      },
    };
    const out = dispatchFull(
      { ...baseState, heroMagicState, lastPlayedCardCategory: 'event', transformChainPrevCategory: 'event' },
      { type: 'ACTIVATE_HERO_MAGIC', magicId: 'berserker-rage', origin: 'card' } as GameAction,
    );
    expect(out.state.lastPlayedCardCategory).toBe('hero-magic');
    expect(out.state.transformChainPrevCategory).toBe('hero-magic');
    expect(out.state.berserkerRageActive).toBe(true);
  });

  it('failed activation (not unlocked) does NOT update transform chain', () => {
    const baseState = makeState({
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });
    const out = dispatchFull(baseState, {
      type: 'ACTIVATE_HERO_MAGIC', magicId: 'berserker-rage', origin: 'card',
    } as GameAction);
    expect(out.state.lastPlayedCardCategory).toBe('event');
    expect(out.state.transformChainPrevCategory).toBe('event');
  });
});

// ---------------------------------------------------------------------------
// 5. PLACE_BUILDING_IN_DUNGEON
// ---------------------------------------------------------------------------

describe('PLACE_BUILDING_IN_DUNGEON', () => {
  it('places the building into an empty active row slot AND fires transform', () => {
    const buildingCard: GameCardData = {
      id: 'b1', type: 'building', name: 'Test Building', value: 0, image: '',
      transformBonus: '+3 金币', transformEffect: 'gold:3',
    } as GameCardData;
    const baseState = makeState({
      gold: 0,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });
    const out = dispatchFull(baseState, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card: buildingCard, source: 'hand',
    } as GameAction);
    const placedSlot = out.state.activeCards.findIndex(c => c?.id === 'b1');
    expect(placedSlot).toBeGreaterThanOrEqual(0);
    expect(out.state.activeCards[placedSlot]?.hasReleaseCharge).toBe(true);
    expect(out.state.transformChainPrevCategory).toBe('building');
    expect(out.state.gold).toBe(3);
  });

  it('routes to graveyard when no active slot is empty (still fires transform)', () => {
    const buildingCard: GameCardData = {
      id: 'b2', type: 'building', name: 'Crowded Building', value: 0, image: '',
      transformBonus: '+3 金币', transformEffect: 'gold:3',
    } as GameCardData;
    // Fill every slot in the active row.
    const filler = (i: number): GameCardData => ({
      id: `filler-${i}`, type: 'monster', name: 'Filler', value: 1,
      hp: 1, maxHp: 1, attack: 1,
    } as GameCardData);
    const baseState = makeState({
      gold: 0,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
      activeCards: [filler(0), filler(1), filler(2), filler(3), filler(4)] as any,
    });
    const out = dispatchFull(baseState, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card: buildingCard, source: 'hand',
    } as GameAction);
    expect(out.state.activeCards.some(c => c?.id === 'b2')).toBe(false);
    // Card ended up in player's discard pile via DISCARD_OWNED_CARD.
    expect(out.state.discardedCards.some(c => c.id === 'b2')).toBe(true);
    expect(out.state.gold).toBe(3);
  });

  it('source=hand + 命运之刃 applies 5 self-damage; source=backpack does not', () => {
    const fateBlade: GameCardData = {
      id: 'fb', type: 'building', name: '命运之刃', value: 0, image: '',
    } as GameCardData;

    const fromHand = dispatchFull(makeState({ hp: 20 }), {
      type: 'PLACE_BUILDING_IN_DUNGEON', card: fateBlade, source: 'hand',
    } as GameAction);
    expect(fromHand.state.hp).toBe(15);

    const fromBackpack = dispatchFull(makeState({ hp: 20 }), {
      type: 'PLACE_BUILDING_IN_DUNGEON', card: { ...fateBlade, id: 'fb2' }, source: 'backpack',
    } as GameAction);
    expect(fromBackpack.state.hp).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 6. EQUIP_FROM_HAND  (thin marker)
// ---------------------------------------------------------------------------

describe('EQUIP_FROM_HAND', () => {
  it('without onEquipEffect: only enqueues APPLY_TRANSFORM_CATEGORY', () => {
    const weapon: GameCardData = {
      id: 'w1', type: 'weapon', name: 'Sword', value: 3, image: '',
    } as GameCardData;
    const result = reduce(makeState(), {
      type: 'EQUIP_FROM_HAND', card: weapon, slotId: 'equipmentSlot1',
    } as GameAction);
    expect(result.state).toBeDefined();
    expect(result.sideEffects).toEqual([]);
    expect(result.enqueuedActions).toHaveLength(1);
    expect(result.enqueuedActions[0].type).toBe('APPLY_TRANSFORM_CATEGORY');
  });

  it('full dispatch updates lastPlayedCardCategory to the weapon category', () => {
    const weapon: GameCardData = {
      id: 'w2', type: 'weapon', name: 'Sword', value: 3, image: '',
    } as GameCardData;
    const baseState = makeState({
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });
    const out = dispatchFull(baseState, {
      type: 'EQUIP_FROM_HAND', card: weapon, slotId: 'equipmentSlot1',
    } as GameAction);
    expect(out.state.lastPlayedCardCategory).toBe('weapon');
    expect(out.state.transformChainPrevCategory).toBe('weapon');
  });

  it('runs onEquipEffect via the registry (gold+4 grants gold)', () => {
    const weapon: GameCardData = {
      id: 'w3', type: 'weapon', name: '赏金之剑', value: 2, image: '',
      durability: 2, maxDurability: 2, onEquipEffect: 'gold+4',
    } as GameCardData;
    const baseState = makeState({ gold: 10 });
    const out = dispatchFull(baseState, {
      type: 'EQUIP_FROM_HAND', card: weapon, slotId: 'equipmentSlot1',
    } as GameAction);
    expect(out.state.gold).toBe(14);
  });

  it('runs onEquipEffect via the registry (temp-attack-3 boosts target slot)', () => {
    const weapon: GameCardData = {
      id: 'w4', type: 'weapon', name: '足锡冲锋', value: 1, image: '',
      durability: 2, maxDurability: 2, onEquipEffect: 'temp-attack-3',
    } as GameCardData;
    const out = dispatchFull(makeState(), {
      type: 'EQUIP_FROM_HAND', card: weapon, slotId: 'equipmentSlot2',
    } as GameAction);
    expect(out.state.slotTempAttack?.equipmentSlot2 ?? 0).toBe(3);
    expect(out.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. EQUIP_AMULET_FROM_HAND  (thin marker)
// ---------------------------------------------------------------------------

describe('EQUIP_AMULET_FROM_HAND (thin marker)', () => {
  it('only enqueues APPLY_TRANSFORM_CATEGORY', () => {
    const amulet: GameCardData = {
      id: 'a1', type: 'amulet', name: 'Amulet of Power', value: 0, image: '',
    } as GameCardData;
    const result = reduce(makeState(), {
      type: 'EQUIP_AMULET_FROM_HAND', card: amulet,
    } as GameAction);
    expect(result.sideEffects).toEqual([]);
    expect(result.enqueuedActions).toHaveLength(1);
    expect(result.enqueuedActions[0].type).toBe('APPLY_TRANSFORM_CATEGORY');
  });

  it('full dispatch updates lastPlayedCardCategory to amulet', () => {
    const amulet: GameCardData = {
      id: 'a2', type: 'amulet', name: 'Strength Amulet', value: 0, image: '',
    } as GameCardData;
    const baseState = makeState({
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });
    const out = dispatchFull(baseState, {
      type: 'EQUIP_AMULET_FROM_HAND', card: amulet,
    } as GameAction);
    expect(out.state.lastPlayedCardCategory).toBe('amulet');
    expect(out.state.transformChainPrevCategory).toBe('amulet');
  });
});

// ---------------------------------------------------------------------------
// 7b. PLAY_CARD weapon/shield inline equip branch (landmine guard)
//
// reducePlayCard handles weapon/shield by inline-equipping into a slot
// instead of routing through EQUIP_FROM_HAND. Make sure that branch also
// auto-enqueues APPLY_TRANSFORM_CATEGORY so the inconsistency between
// "drag to slot" (EQUIP_FROM_HAND) and "PLAY_CARD weapon" doesn't silently
// drop transform.
// ---------------------------------------------------------------------------

describe('PLAY_CARD weapon/shield enqueues APPLY_TRANSFORM_CATEGORY', () => {
  it('weapon: tail of enqueuedActions is APPLY_TRANSFORM_CATEGORY', () => {
    const weapon: GameCardData = {
      id: 'pw-1', type: 'weapon', name: 'Sword', value: 3, image: '',
    } as GameCardData;
    const state = makeState({ handCards: [weapon] as GameCardData[] });
    const result = reduce(state, {
      type: 'PLAY_CARD', cardId: weapon.id,
    } as GameAction);
    const tail = result.enqueuedActions[result.enqueuedActions.length - 1];
    expect(tail?.type).toBe('APPLY_TRANSFORM_CATEGORY');
    expect((tail as ApplyTransformCategoryAction).card.id).toBe('pw-1');
  });

  it('shield: tail of enqueuedActions is APPLY_TRANSFORM_CATEGORY', () => {
    const shield: GameCardData = {
      id: 'ps-1', type: 'shield', name: 'Buckler', value: 2, image: '',
    } as GameCardData;
    const state = makeState({ handCards: [shield] as GameCardData[] });
    const result = reduce(state, {
      type: 'PLAY_CARD', cardId: shield.id,
    } as GameAction);
    const tail = result.enqueuedActions[result.enqueuedActions.length - 1];
    expect(tail?.type).toBe('APPLY_TRANSFORM_CATEGORY');
    expect((tail as ApplyTransformCategoryAction).card.id).toBe('ps-1');
  });

  it('full dispatch flips transformChainPrevCategory to weapon after event', () => {
    const weapon: GameCardData = {
      id: 'pw-2', type: 'weapon', name: 'Sword', value: 3, image: '',
    } as GameCardData;
    const baseState = makeState({
      handCards: [weapon] as GameCardData[],
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });
    const out = dispatchFull(baseState, {
      type: 'PLAY_CARD', cardId: weapon.id,
    } as GameAction);
    expect(out.state.lastPlayedCardCategory).toBe('weapon');
    expect(out.state.transformChainPrevCategory).toBe('weapon');
  });
});

// ---------------------------------------------------------------------------
// 8. End-to-end repro of the original bug — Event then 查阅动作
// ---------------------------------------------------------------------------

describe('Original bug repro — SET_CURRENT_EVENT(event) then RESOLVE_MAGIC(查阅)', () => {
  it('triggers transform +3 gold without any hook-layer transform call', () => {
    const eventCard: GameCardData = {
      id: 'evt-orig', type: 'event', name: 'Test Event', value: 0, image: '',
    } as GameCardData;
    const surveyCard: GameCardData = {
      id: 'survey-orig', type: 'magic', name: '查阅动作', value: 0, image: '',
      magicType: 'permanent',
      transformBonus: '+3 金币',
      transformEffect: 'gold:3',
    } as GameCardData;

    let state = makeState({ gold: 10 });
    state = dispatchFull(state, {
      type: 'SET_CURRENT_EVENT', card: eventCard,
    } as GameAction).state;
    expect(state.transformChainPrevCategory).toBe('event');
    expect(state.lastPlayedCardCategory).toBe('event');

    const out = dispatchFull(state, {
      type: 'RESOLVE_MAGIC', cardId: surveyCard.id, card: surveyCard,
    } as GameAction);
    expect(out.state.gold).toBe(13);
    expect(out.state.transformChainPrevCategory).toBe('perm-magic');
  });
});
